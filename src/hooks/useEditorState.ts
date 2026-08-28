import { useState, useRef, useCallback, useEffect } from "react";
import { getTelemetry } from "@/lib/telemetry";
import { DiagramDocument } from "@/lib/api/storage";
import { toast } from "sonner";
import mermaid from "mermaid";
import { FONT_OPTIONS } from "@/lib/diagrams/constants";
import {
  saveOfflineEdit,
  getOfflineEdit,
  clearOfflineEdit,
  type OfflineEdit,
} from "@/lib/offlineStorage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const DEBOUNCE_MS = 1500;
const VALID_MERMAID_THEMES = new Set(["default", "forest", "dark", "neutral", "base", "redux"]);
// Bounded backoff for auto-retrying a cached edit: 2s, 4s, 8s, 16s, 32s — then stop.
const RETRY_MAX = 5;
const RETRY_BASE_MS = 2000;

// Server vs local divergence detected when replaying a cached offline edit on reconnect.
export interface OfflineConflict {
  baseCode: string;
  pendingCode: string;
  serverCode: string;
}

// `isDemo` is passed in from the (runtime-rendered) editor page rather than read
// from `process.env.NEXT_PUBLIC_DEMO_MODE`, which would be baked into the client
// bundle at build time and could not be toggled by a runtime env var.
export function useEditorState(documentId: string, isDemo: boolean = false) {
  const [doc, setDoc] = useState<DiagramDocument | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // True from the moment the user edits until the debounced auto-save has been confirmed by the
  // server. The editor's `beforeunload` guard reads this ref to warn ONLY when there is unsaved
  // work still in the pipeline, so leaving the page after everything is saved is friction-free.
  const hasUnsavedChangesRef = useRef(false);
  // Last code confirmed by the server (initial load + every successful save). The offline
  // cache records it as `baseCode` so the reconnect sync can detect server-side divergence.
  const baseCodeRef = useRef("");

  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;
  // Mirrored into a ref so `saveCode` reads connectivity at FIRE time — the user can go
  // offline during the debounce window after an edit was scheduled. Kept in a committed
  // effect (not render) so async save/sync callbacks only ever observe committed renders.
  const isOfflineRef = useRef(false);
  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  // Latest committed code, read by async sync callbacks to detect whether the snapshot being
  // replayed is still what's on screen (a newer edit mid-sync must not be clobbered).
  const codeRef = useRef("");
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const [offlinePending, setOfflinePending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [conflict, setConflict] = useState<OfflineConflict | null>(null);
  const syncingRef = useRef(false);
  // In-memory copy of the pending edit, retained even when localStorage persistence fails so the
  // edit is still replayed on reconnect within the current session. Wiped on a successful sync.
  const inMemoryPendingRef = useRef<OfflineEdit | null>(null);
  // Bounded backoff counter for auto-retrying a cached edit when a network throw happened while
  // `navigator.onLine` still reports online (so the isOnline-driven sync effect never re-fires).
  const retryAttemptRef = useRef(0);
  // Auto-retries pause while a conflict dialog is up (or was cancelled) so the backoff timer
  // doesn't silently re-open the dialog or burn the retry budget without a network failure.
  // Resumed on the next online transition (or an explicit conflict resolution, which clears
  // the cache entirely).
  const retryPausedRef = useRef(false);

  // Settle a pending edit once the server is known to hold `pendingCode`. Clears the cache
  // (persistent + in-memory), updates the base, clears the pending/dirty flags, and resets the
  // retry budget so a fresh edit gets fresh attempts.
  const settlePending = useCallback(
    (pendingCode: string) => {
      clearOfflineEdit(documentId);
      inMemoryPendingRef.current = null;
      baseCodeRef.current = pendingCode;
      setOfflinePending(false);
      hasUnsavedChangesRef.current = false;
      retryAttemptRef.current = 0;
    },
    [documentId],
  );

  const [svgContent, setSvgContent] = useState<string>("");
  const [currentTheme, setCurrentTheme] = useState("default");
  const [currentFont, setCurrentFont] = useState("Default");
  const [parseError, setParseError] = useState<string | null>(null);

  const renderIdRef = useRef<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose", // allow clicks
      flowchart: { htmlLabels: true },
    });
  }, []);

  const renderMermaid = useCallback(async (mermaidCode: string, onResetSelection?: () => void) => {
    if (mermaidCode.trim().length === 0) {
      setParseError(null);
      setSvgContent("");
      renderIdRef.current = null;
      if (onResetSelection) onResetSelection();
      return;
    }

    try {
      setParseError(null);
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose", // allow clicks
        flowchart: { htmlLabels: true },
      });
      await mermaid.parse(mermaidCode, { suppressErrors: true });
      const id = `mermaid-svg-${Date.now()}`;
      renderIdRef.current = id;
      const { svg } = await mermaid.render(id, mermaidCode);
      const interactiveSvg = addInteractionHelpersToSvg(svg);
      setSvgContent(interactiveSvg);

      // Try to extract theme
      const match = mermaidCode.match(/theme:\s*(?:'|")?([^'"\s\n]+)/);
      if (match) {
        const parsedTheme = match[1].trim();
        setCurrentTheme(VALID_MERMAID_THEMES.has(parsedTheme) ? parsedTheme : "default");
      } else {
        setCurrentTheme("default");
      }

      // Try to extract font. We parse the full value to support nested quotes like
      // fontFamily: '"Inter Variable", sans-serif'.
      const fontLineMatch = mermaidCode.match(/fontFamily:\s*([^\n\r]+)/);
      if (fontLineMatch) {
        let fontVal = fontLineMatch[1].trim();
        if (
          (fontVal.startsWith("'") && fontVal.endsWith("'")) ||
          (fontVal.startsWith('"') && fontVal.endsWith('"'))
        ) {
          fontVal = fontVal.slice(1, -1);
        }

        const normalizedFont = fontVal.replace(/["']/g, "").toLowerCase();
        const found = FONT_OPTIONS.find((f) => {
          const optionPrimary = f.value.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
          return normalizedFont.includes(optionPrimary);
        });

        setCurrentFont(found?.label || "Default");
      } else {
        setCurrentFont("Default");
      }

      if (onResetSelection) {
        onResetSelection();
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Syntax Error";
      setParseError(errorMessage);
      getTelemetry()?.addBreadcrumb({
        category: "render",
        message: "Mermaid render failed",
        level: "error",
        data: { documentId },
      });
    }
  }, []);

  // Fetch Initial Data
  useEffect(() => {
    // Replay a cached offline edit over whatever state we have. Used on successful loads
    // (the pending edit wins over the stale server copy; the sync-on-reconnect effect then
    // auto-resolves or surfaces a conflict) and on failed loads (a fully offline reload
    // must not blank the editor).
    const restoreCachedEdit = (edit: OfflineEdit) => {
      setCode(edit.pendingCode);
      renderMermaid(edit.pendingCode);
      baseCodeRef.current = edit.baseCode;
      hasUnsavedChangesRef.current = true;
      setOfflinePending(true);
    };

    const fetchDoc = async () => {
      try {
        const startTime = Date.now();
        const res = await fetch(`/api/diagrams/${documentId}`);
        if (res.ok) {
          const data = await res.json();
          setDoc(data);
          setCode(data.code);
          renderMermaid(data.code);
          baseCodeRef.current = data.code;
          getTelemetry()?.addBreadcrumb({
            category: "editor",
            message: "Diagram loaded",
            data: { documentId },
          });
          const cachedEdit = getOfflineEdit(documentId);
          if (cachedEdit) restoreCachedEdit(cachedEdit);
        } else if (res.status === 404) {
          // The requested diagram does not exist — surface a dedicated not-found screen
          // instead of silently rendering an empty editor. 404 wins over any cached edit.
          setNotFound(true);
        } else {
          const cachedEdit = getOfflineEdit(documentId);
          if (cachedEdit) {
            restoreCachedEdit(cachedEdit);
          } else {
            toast.error("Failed to load diagram");
          }
        }
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 600) {
          await new Promise((resolve) => setTimeout(resolve, 600 - elapsedTime));
        }
      } catch {
        const cachedEdit = getOfflineEdit(documentId);
        if (cachedEdit) {
          restoreCachedEdit(cachedEdit);
        } else {
          toast.error("Failed to load diagram");
          getTelemetry()?.captureMessage("Failed to load diagram", "error", { documentId });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [documentId, renderMermaid]);

  // Auto-Save Logic
  const cacheOfflineEdit = useCallback(
    (newCode: string) => {
      const edit: OfflineEdit = {
        diagramId: documentId,
        baseCode: baseCodeRef.current,
        pendingCode: newCode,
        updatedAt: Date.now(),
      };
      // Always keep an in-memory copy so the edit survives even if localStorage is full/disabled;
      // the persistent write is best-effort on top of it.
      inMemoryPendingRef.current = edit;
      saveOfflineEdit(edit);
      retryAttemptRef.current = 0; // fresh edit → fresh retry budget
      setOfflinePending(true);
      hasUnsavedChangesRef.current = true;
    },
    [documentId],
  );

  const saveCode = useCallback(
    async (newCode: string) => {
      // Offline at fire time: cache locally instead of hitting the network; the
      // sync-on-reconnect effect replays the cached edit once connectivity returns.
      // `saving` is deliberately untouched — no request is in flight.
      if (isOfflineRef.current) {
        cacheOfflineEdit(newCode);
        return;
      }
      setSaving(true);
      try {
        // Conditional update: `expectedCode` is the server state we last saw. A 409 means the
        // server moved on — e.g. the user edited offline and reconnected within the debounce
        // window, or another tab saved — so surface a conflict instead of silently clobbering
        // the concurrent change.
        const res = await fetch(`/api/diagrams/${documentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: newCode, expectedCode: baseCodeRef.current }),
        });
        if (res.status === 409) {
          const serverDoc = await res.json();
          cacheOfflineEdit(newCode);
          retryPausedRef.current = true;
          setConflict({
            baseCode: baseCodeRef.current,
            pendingCode: newCode,
            serverCode: serverDoc.code,
          });
          return;
        }
        if (!res.ok) {
          // Server responded with an error — surface it, keep the dirty flag, do NOT
          // cache as an offline edit (the server is reachable; this is not an outage).
          toast.error("Failed to auto-save");
          getTelemetry()?.captureMessage("Auto-save failed", "error", { documentId });
          return;
        }

        const updatedDoc = await res.json();
        setDoc(updatedDoc);
        baseCodeRef.current = newCode;
        retryAttemptRef.current = 0;
        if (codeRef.current === newCode) {
          // This PUT carried the latest editor snapshot — safe to settle.
          clearOfflineEdit(documentId);
          inMemoryPendingRef.current = null;
          setOfflinePending(false);
          hasUnsavedChangesRef.current = false;
        } else {
          // A newer edit exists (an older PUT completed late) — keep the pending state and
          // rebase the cached edit onto this newly confirmed server code so the pending sync
          // applies cleanly instead of surfacing a stale-base conflict.
          const cached = getOfflineEdit(documentId) ?? inMemoryPendingRef.current;
          if (cached) {
            const rebased: OfflineEdit = { ...cached, baseCode: newCode };
            inMemoryPendingRef.current = rebased;
            saveOfflineEdit(rebased);
          }
        }
        getTelemetry()?.addBreadcrumb({
          category: "editor",
          message: "Auto-save succeeded",
          data: { documentId },
        });
      } catch {
        // The request itself threw (network dropped mid-flight while the browser still
        // reports online) — cache locally so the edit is never lost.
        cacheOfflineEdit(newCode);
        toast.error("Offline: changes saved locally and will sync when reconnected");
        // Keep the dirty flag set so the unload guard still protects the unsaved edit.
      } finally {
        setSaving(false);
      }
    },
    [documentId, cacheOfflineEdit],
  );

  const handleCodeChange = useCallback(
    (value: string | undefined, onResetSelection?: () => void) => {
      const newCode = value || "";
      setCode(newCode);

      renderMermaid(newCode, onResetSelection);

      if (isDemo) return;

      // Mark as dirty immediately on edit; cleared only once the debounced save succeeds. The
      // unload guard reads this ref so it warns ONLY while there is genuinely unsaved work in the
      // pipeline (debounce window + in-flight PUT), never when everything is already persisted.
      hasUnsavedChangesRef.current = true;

      // Trigger auto-save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveCode(newCode);
      }, DEBOUNCE_MS);
    },
    [renderMermaid, saveCode, isDemo],
  );

  // Replay a cached offline edit against the server. Idempotent via `syncingRef`.
  const syncPendingEdit = useCallback(async () => {
    if (syncingRef.current) return;
    // Prefer the persistent cache; fall back to the in-memory copy retained when
    // localStorage persistence failed, so the edit is still replayed this session.
    const edit = getOfflineEdit(documentId) ?? inMemoryPendingRef.current;
    if (!edit) {
      setOfflinePending(false);
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      // Conditional PUT: the server rejects with 409 + its current doc when the base this
      // edit was built on no longer matches — a single atomic check, no GET→PUT race window.
      const putRes = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: edit.pendingCode, expectedCode: edit.baseCode }),
      });
      if (putRes.ok) {
        const updatedDoc = await putRes.json();
        setDoc(updatedDoc);
        // Only settle when the replayed snapshot is still the current edit. If the user made a
        // newer edit during the sync, leave the cache, pending flag, and dirty flag intact so
        // the newer edit is preserved and still protected by the unload guard.
        if (codeRef.current === edit.pendingCode) {
          settlePending(edit.pendingCode);
          toast.success("Back online — your changes are synced");
        }
      } else if (putRes.status === 409) {
        const serverDoc = await putRes.json();
        const serverCode: string = serverDoc.code;
        if (serverCode === edit.pendingCode) {
          // A prior PUT already landed but its response was lost — the server holds our edit.
          // Settle without re-PUTting, still guarded by the current-snapshot check.
          setDoc(serverDoc);
          if (codeRef.current === edit.pendingCode) {
            settlePending(edit.pendingCode);
            toast.success("Back online — your changes are synced");
          }
        } else {
          // The server moved on since the cached base — surface a conflict instead of
          // silently clobbering either side, and pause auto-retries so the dialog doesn't
          // reopen behind the user's back while they read it.
          retryPausedRef.current = true;
          setConflict({ baseCode: edit.baseCode, pendingCode: edit.pendingCode, serverCode });
        }
      }
      // Other non-ok statuses: server-side failure — keep the cache; retried on the next
      // attempt. Silent by design.
    } catch {
      // Network error — keep the cache and pending flag; retried via backoff / next online
      // transition. Silent by design.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [documentId, settlePending]);

  useEffect(() => {
    // `loading` gate ensures the initial fetch has settled (and any cached edit was
    // restored) before the first sync attempt runs.
    if (isDemo || !isOnline || loading) return;
    // A fresh online transition resumes auto-retries (they pause after a conflict is
    // detected or cancelled — see the retry effect below).
    retryPausedRef.current = false;
    void syncPendingEdit();
  }, [isDemo, isOnline, loading, syncPendingEdit]);

  // Bounded backoff auto-retry. A save can throw while the browser still reports online (server
  // recovering / transient blip) — the isOnline-driven effect above never re-fires in that case,
  // so without this a cached edit could sit in "Pending sync" indefinitely. Retry with backoff
  // while a pending edit exists, capped so a permanently-down server doesn't hammer forever.
  // Depends on `syncing` so each completed failed attempt schedules the next backoff attempt.
  // Paused while a conflict is pending (or was cancelled) — retried only on a new online
  // transition or an explicit resolution.
  useEffect(() => {
    if (isDemo || !isOnline || loading || syncing) return;
    if (conflict !== null || retryPausedRef.current) return;
    const edit = getOfflineEdit(documentId) ?? inMemoryPendingRef.current;
    if (!edit) return;
    if (retryAttemptRef.current >= RETRY_MAX) return;
    const delay = RETRY_BASE_MS * 2 ** retryAttemptRef.current;
    retryAttemptRef.current += 1;
    const t = setTimeout(() => void syncPendingEdit(), delay);
    return () => clearTimeout(t);
  }, [isDemo, isOnline, loading, syncing, conflict, documentId, offlinePending, syncPendingEdit]);

  const resolveConflict = useCallback(
    async (mode: "mine" | "server" | "cancel") => {
      if (!conflict) return;
      if (mode === "cancel") {
        // Keep the cache and dirty flag so the next reconnect retries the sync.
        setConflict(null);
        return;
      }
      if (mode === "server") {
        // The server already holds this code — adopt it locally, no PUT needed.
        setCode(conflict.serverCode);
        renderMermaid(conflict.serverCode);
        clearOfflineEdit(documentId);
        inMemoryPendingRef.current = null;
        retryAttemptRef.current = 0;
        baseCodeRef.current = conflict.serverCode;
        setOfflinePending(false);
        hasUnsavedChangesRef.current = false;
        setDoc((prev) => (prev ? { ...prev, code: conflict.serverCode } : prev));
        setConflict(null);
        return;
      }
      try {
        // Conditional on the server version the user just reviewed and chose to override: if
        // yet another save landed in the meantime, re-surface the conflict with the fresher
        // server copy instead of silently overwriting it.
        const res = await fetch(`/api/diagrams/${documentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: conflict.pendingCode, expectedCode: conflict.serverCode }),
        });
        if (res.status === 409) {
          const serverDoc = await res.json();
          setConflict({ ...conflict, serverCode: serverDoc.code });
          return;
        }
        if (!res.ok) throw new Error("Failed to resolve conflict");
        const updatedDoc = await res.json();
        setDoc(updatedDoc);
        // Same current-snapshot guard as the auto-sync path: only settle when the resolved code
        // is still what's on screen, so a newer edit made mid-request isn't clobbered.
        if (codeRef.current === conflict.pendingCode) {
          settlePending(conflict.pendingCode);
        }
        setConflict(null);
      } catch {
        toast.error("Failed to sync — still offline");
      }
    },
    [conflict, documentId, renderMermaid, settlePending],
  );

  return {
    doc,
    setDoc,
    code,
    setCode,
    loading,
    setLoading,
    notFound,
    saving,
    setSaving,
    svgContent,
    setSvgContent,
    currentTheme,
    setCurrentTheme,
    currentFont,
    setCurrentFont,
    parseError,
    setParseError,
    isBlankDiagram: code.trim().length === 0,
    renderIdRef,
    handleCodeChange,
    hasUnsavedChangesRef,
    isOffline,
    offlinePending,
    syncing,
    conflict,
    resolveConflict,
  };
}

function addInteractionHelpersToSvg(svgString: string): string {
  if (typeof window === "undefined") return svgString;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    // Mermaid flowchart labels are often rendered in foreignObject HTML blocks.
    // In some browsers those inner HTML clicks do not bubble reliably to outer SVG
    // containers, so single-click selection never fires. Make labels transparent
    // to pointer events so clicks hit the underlying SVG node/edge geometry.
    const foreignObjects = doc.querySelectorAll("foreignObject");
    foreignObjects.forEach((fo) => {
      const existingStyle = fo.getAttribute("style") || "";
      fo.setAttribute("style", `${existingStyle};pointer-events:none !important;`);
      fo.setAttribute("pointer-events", "none");
      const descendants = fo.querySelectorAll("*");
      descendants.forEach((el) => {
        const childStyle = el.getAttribute("style") || "";
        el.setAttribute("style", `${childStyle};pointer-events:none !important;`);
      });
    });

    const paths = doc.querySelectorAll("path.flowchart-link, .edgePath path.path");
    paths.forEach((path) => {
      const clone = path.cloneNode(true) as SVGElement;

      clone.classList.add("flowchart-link-hit-target");
      if (path.id) {
        clone.id = `${path.id}-hit-target`;
      }

      clone.removeAttribute("stroke-dasharray");
      clone.setAttribute("stroke-width", "16px");
      clone.setAttribute("stroke", "transparent");
      clone.setAttribute("fill", "none");
      clone.setAttribute("opacity", "0.01");
      clone.setAttribute(
        "style",
        "stroke-width: 16px !important; stroke: transparent !important; fill: none !important; opacity: 0.01 !important; cursor: pointer !important; pointer-events: stroke !important;",
      );

      if (path.parentNode) {
        path.parentNode.insertBefore(clone, path);
      }
    });

    // Edge label hit-targets: add invisible rects over each edge label so the label
    // text area has a generous clickable target, even though the foreignObject itself
    // has pointer-events: none (set above). The data-id on the edgeLabel is used to
    // resolve the edge back to its source path.
    const edgeLabelGroups = doc.querySelectorAll(".edgeLabel");
    edgeLabelGroups.forEach((el) => {
      const fo = el.querySelector("foreignObject");
      if (!fo) return;
      if (!fo.textContent?.trim()) return;

      const x = parseFloat(fo.getAttribute("x") || "0");
      const y = parseFloat(fo.getAttribute("y") || "0");
      const w = parseFloat(fo.getAttribute("width") || "0");
      const h = parseFloat(fo.getAttribute("height") || "0");
      if (w === 0 || h === 0) return;

      const padding = 8;
      const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.classList.add("edge-label-hit-target");
      rect.setAttribute("x", String(x - padding));
      rect.setAttribute("y", String(y - padding));
      rect.setAttribute("width", String(w + padding * 2));
      rect.setAttribute("height", String(h + padding * 2));
      rect.setAttribute("fill", "transparent");
      rect.setAttribute("opacity", "0.01");
      rect.setAttribute(
        "style",
        "fill: transparent !important; opacity: 0.01 !important; cursor: pointer !important; pointer-events: all !important;",
      );

      const dataId =
        el.getAttribute("data-id") ??
        el.querySelector("[data-id]")?.getAttribute("data-id") ??
        null;
      if (dataId) rect.setAttribute("data-id", dataId);

      fo.parentNode?.insertBefore(rect, fo);
    });

    // Class-diagram relationship edges (`path.relation`) get the same wide transparent hit-target
    // treatment so the thin connector line is easy to click. The clone keeps the stable `data-id`
    // (`id_<Src>_<Dst>_<N>`) used to resolve the edge back to its source line, but drops the id and
    // arrow markers so it neither duplicates ids nor paints a second arrowhead.
    const relationPaths = doc.querySelectorAll("path.relation");
    relationPaths.forEach((path) => {
      const clone = path.cloneNode(true) as SVGElement;
      // Strip the `relation` class so the clone is ONLY `class-relation-hit-target`. Keeping
      // `relation` would make `path.relation[data-id=…]` (selection re-resolve) and `path.relation`
      // queries ambiguously match the transparent hit-target instead of the visible line, and the
      // hover-highlight CSS would target the invisible clone.
      clone.classList.remove("relation");
      // Also drop Mermaid's line-pattern classes (`edge-pattern-dashed` / `edge-pattern-dotted`).
      // They apply `stroke-dasharray` via CSS, which would make the transparent hit-target itself
      // dashed/dotted — clicks then fall through the GAPS between dashes and the edge becomes nearly
      // impossible to select (this is the "dashed connection can't be selected" bug). We need a
      // SOLID continuous stroke for hit-testing regardless of the visible line's pattern.
      clone.classList.remove("edge-pattern-dashed", "edge-pattern-dotted");
      clone.classList.add("class-relation-hit-target");
      const dataId = path.getAttribute("data-id");
      if (dataId) clone.setAttribute("data-id", dataId);
      clone.removeAttribute("id");
      clone.removeAttribute("marker-start");
      clone.removeAttribute("marker-end");
      clone.removeAttribute("stroke-dasharray");
      clone.setAttribute("stroke-width", "50px");
      clone.setAttribute("stroke", "transparent");
      clone.setAttribute("fill", "none");
      clone.setAttribute("opacity", "0.01");
      clone.setAttribute(
        "style",
        // `stroke-dasharray: none` defeats any residual CSS dash so the hit-target is a solid
        // continuous 50px stroke that is clickable anywhere along its length.
        "stroke-width: 50px !important; stroke: transparent !important; fill: none !important; opacity: 0.01 !important; cursor: pointer !important; pointer-events: stroke !important; stroke-dasharray: none !important;",
      );
      if (path.parentNode) {
        path.parentNode.insertBefore(clone, path);
      }
    });

    // ER-diagram relationship edges (`path.relationshipLine`) get the same wide transparent
    // hit-target treatment. The clone keeps the stable `data-id` (`id_<srcSvgId>_<dstSvgId>_<N>`)
    // used to resolve the edge back to its source line, but drops the id and arrow markers so it
    // neither duplicates ids nor paints a second crow's-foot.
    const erRelationPaths = doc.querySelectorAll("path.relationshipLine");
    erRelationPaths.forEach((path) => {
      const clone = path.cloneNode(true) as SVGElement;
      // Strip `relationshipLine` so the clone is ONLY `er-relation-hit-target` (keeps
      // `path.relationshipLine[data-id=…]` selection re-resolve + hover CSS unambiguous).
      clone.classList.remove("relationshipLine");
      // Drop Mermaid's line-pattern classes so the transparent hit-target is a SOLID continuous
      // stroke (otherwise clicks fall through the gaps of a dashed/non-identifying relationship).
      clone.classList.remove("edge-pattern-dashed", "edge-pattern-dotted");
      clone.classList.add("er-relation-hit-target");
      const dataId = path.getAttribute("data-id");
      if (dataId) clone.setAttribute("data-id", dataId);
      clone.removeAttribute("id");
      clone.removeAttribute("marker-start");
      clone.removeAttribute("marker-end");
      clone.removeAttribute("stroke-dasharray");
      clone.setAttribute("stroke-width", "50px");
      clone.setAttribute("stroke", "transparent");
      clone.setAttribute("fill", "none");
      clone.setAttribute("opacity", "0.01");
      clone.setAttribute(
        "style",
        "stroke-width: 50px !important; stroke: transparent !important; fill: none !important; opacity: 0.01 !important; cursor: pointer !important; pointer-events: stroke !important; stroke-dasharray: none !important;",
      );
      if (path.parentNode) {
        path.parentNode.insertBefore(clone, path);
      }
    });

    // State-diagram transitions (`path.transition`) get the same wide transparent hit-target. The
    // clone keeps the stable `data-id` (`edge<N>`, a code-order index used to resolve the transition
    // back to its source line), but drops the id + arrow markers. Note-edges (`.note-edge`, the
    // connector from a state to its note) are EXCLUDED — they are not selectable transitions.
    const stateTransitionPaths = doc.querySelectorAll("path.transition:not(.note-edge)");
    stateTransitionPaths.forEach((path) => {
      const clone = path.cloneNode(true) as SVGElement;
      clone.classList.remove("transition");
      clone.classList.remove("edge-pattern-dashed", "edge-pattern-dotted");
      clone.classList.add("state-transition-hit-target");
      const dataId = path.getAttribute("data-id");
      if (dataId) clone.setAttribute("data-id", dataId);
      clone.removeAttribute("id");
      clone.removeAttribute("marker-start");
      clone.removeAttribute("marker-end");
      clone.removeAttribute("stroke-dasharray");
      clone.setAttribute("stroke-width", "50px");
      clone.setAttribute("stroke", "transparent");
      clone.setAttribute("fill", "none");
      clone.setAttribute("opacity", "0.01");
      clone.setAttribute(
        "style",
        "stroke-width: 50px !important; stroke: transparent !important; fill: none !important; opacity: 0.01 !important; cursor: pointer !important; pointer-events: stroke !important; stroke-dasharray: none !important;",
      );
      if (path.parentNode) {
        path.parentNode.insertBefore(clone, path);
      }
    });

    // Timeline diagram title — Mermaid's timeline renderer draws the title as a plain `<text>`
    // element (without any CSS class). Add `timelineDiagramTitleText` so double-click detection
    // and pointer-cursor styling work consistently with ER/Class/State diagram titles.
    const timelineTitleText = doc.querySelector('svg > text[font-weight="bold"][font-size="4ex"]');
    if (timelineTitleText) {
      timelineTitleText.classList.add("timelineDiagramTitleText");
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    console.error("Failed to add SVG interaction helpers:", error);
    return svgString;
  }
}
