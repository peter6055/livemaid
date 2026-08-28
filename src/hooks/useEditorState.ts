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
  // offline during the debounce window after an edit was scheduled.
  const isOfflineRef = useRef(false);
  isOfflineRef.current = isOffline;

  const codeRef = useRef("");
  codeRef.current = code;

  const [offlinePending, setOfflinePending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [conflict, setConflict] = useState<OfflineConflict | null>(null);
  const syncingRef = useRef(false);

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
      saveOfflineEdit({
        diagramId: documentId,
        baseCode: baseCodeRef.current,
        pendingCode: newCode,
        updatedAt: Date.now(),
      });
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
        const res = await fetch(`/api/diagrams/${documentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: newCode }),
        });
        if (!res.ok) {
          // Server responded with an error — surface it, keep the dirty flag, do NOT
          // cache as an offline edit (the server is reachable; this is not an outage).
          toast.error("Failed to auto-save");
          getTelemetry()?.captureMessage("Auto-save failed", "error", { documentId });
          return;
        }

        const updatedDoc = await res.json();
        setDoc(updatedDoc);
        clearOfflineEdit(documentId);
        setOfflinePending(false);
        baseCodeRef.current = newCode;
        hasUnsavedChangesRef.current = false;
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
    const edit = getOfflineEdit(documentId);
    if (!edit) {
      setOfflinePending(false);
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await fetch(`/api/diagrams/${documentId}`);
      if (!res.ok) return;
      const serverDoc = await res.json();
      const serverCode: string = serverDoc.code;
      if (serverCode !== edit.baseCode) {
        // The server moved on since the cached base — surface a conflict instead of
        // silently clobbering either side.
        setConflict({ baseCode: edit.baseCode, pendingCode: edit.pendingCode, serverCode });
        return;
      }
      const putRes = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: edit.pendingCode }),
      });
      if (!putRes.ok) return;
      const updatedDoc = await putRes.json();
      clearOfflineEdit(documentId);
      setDoc(updatedDoc);
      if (codeRef.current !== edit.pendingCode) setCode(edit.pendingCode);
      baseCodeRef.current = edit.pendingCode;
      setOfflinePending(false);
      hasUnsavedChangesRef.current = false;
      toast.success("Back online — your changes are synced");
    } catch {
      // Offline again / network error — keep the cache and pending flag; retried on the
      // next online transition. Silent by design.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [documentId]);

  useEffect(() => {
    // `loading` gate ensures the initial fetch has settled (and any cached edit was
    // restored) before the first sync attempt runs.
    if (isDemo || !isOnline || loading) return;
    void syncPendingEdit();
  }, [isDemo, isOnline, loading, syncPendingEdit]);

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
        baseCodeRef.current = conflict.serverCode;
        setOfflinePending(false);
        hasUnsavedChangesRef.current = false;
        setDoc((prev) => (prev ? { ...prev, code: conflict.serverCode } : prev));
        setConflict(null);
        return;
      }
      try {
        const res = await fetch(`/api/diagrams/${documentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: conflict.pendingCode }),
        });
        if (!res.ok) throw new Error("Failed to resolve conflict");
        const updatedDoc = await res.json();
        clearOfflineEdit(documentId);
        setDoc(updatedDoc);
        baseCodeRef.current = conflict.pendingCode;
        setOfflinePending(false);
        hasUnsavedChangesRef.current = false;
        setConflict(null);
      } catch {
        toast.error("Failed to sync — still offline");
      }
    },
    [conflict, documentId, renderMermaid],
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
