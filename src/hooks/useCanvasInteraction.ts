import { useState, useCallback, useRef, MutableRefObject, useEffect } from "react";
import { isEdgeId, parseEdgeId, CONNECTOR_PATTERN } from "@/lib/diagrams/utils";
import type { ShapeOption } from "@/lib/diagrams/flowchart";

// Padding (canvas units) added around a sequence message's raw line+label bounds to
// produce the unified hover/selection border box. The hover box and the selection box
// MUST both use this exact value so they stay pixel-identical (one single border box).
const SEQ_MSG_SELECTION_PADDING = { x: 2, y: 1 };
// Padding (canvas units) for the clickable/hoverable hit-test band. Kept SMALLER than the
// visible box padding (especially vertically) so the interactive area is tighter than the
// drawn box, preventing accidental clicks on adjacent message rows.
const SEQ_MSG_HITTEST_PADDING = { x: 2, y: 1 };

function unionClientRects(elements: SVGElement[]): DOMRect | null {
  if (elements.length === 0) return null;
  const rects = elements.map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

// A parsed sequence block fragment (loop/alt/opt/par/critical/break) or `rect` highlight, with its
// source-line range, nesting depth, internal section dividers, and computed canvas geometry.
export type SequenceBlockType = "loop" | "alt" | "opt" | "par" | "critical" | "break" | "rect";
export interface SequenceBlockEntry {
  id: string;
  type: SequenceBlockType;
  isHighlight: boolean; // true for `rect`
  label: string; // the text after the keyword (e.g. "Condition", "rgb(...)")
  startLine: number; // source line index of the opener keyword
  endLine: number; // source line index of the matching `end`
  depth: number; // nesting depth (0 = outermost)
  sections: Array<{ keyword: string; line: number }>; // opener + else/and/option dividers
}
export interface SequenceBlockArea extends SequenceBlockEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Live state for the click-drag "connect two nodes" interaction. */
export interface ConnectionState {
  active: boolean;
  startNodeId: string | null;
  startPos: { x: number; y: number } | null;
  mousePos: { x: number; y: number } | null;
  isDragging: boolean;
  snapTargetId: string | null;
  snapTargetPos: { x: number; y: number } | null;
  anchorY: number | null;
}

/** Position + origin node for the floating shape-picker popover. */
export interface ShapePicker {
  x: number;
  y: number;
  startNodeId: string;
}

export function useCanvasInteraction({
  code,
  svgContent,
  renderIdRef,
  containerRef,
  isLocked,
  handleCodeChange,
  determineDiagramType,
}: {
  code: string;
  svgContent?: string;
  renderIdRef: MutableRefObject<string | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  isLocked: boolean;
  handleCodeChange: (code: string) => void;
  determineDiagramType: (code: string) => string;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  // Keep ref in sync with state
  const setSelectedNodeIdWithRef = useCallback((id: string | null) => {
    selectedNodeIdRef.current = id;
    setSelectedNodeId(id);
  }, []);
  const [selectedSvgId, setSelectedSvgId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [textBox, setTextBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [shapePicker, setShapePicker] = useState<ShapePicker | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    active: false,
    startNodeId: null,
    startPos: null,
    mousePos: null,
    isDragging: false,
    snapTargetId: null,
    snapTargetPos: null,
    anchorY: null,
  });

  const [sequenceLifelineOverlay, setSequenceLifelineOverlay] = useState<{
    actorId: string;
    x: number;
    slots: number[];
  } | null>(null);
  const [hoveredSequenceActorBox, setHoveredSequenceActorBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoveredSequenceMessageBox, setHoveredSequenceMessageBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoveredSequenceNoteBox, setHoveredSequenceNoteBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoveredFlowchartNodeBox, setHoveredFlowchartNodeBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [sequenceMessageTriggerAreas, setSequenceMessageTriggerAreas] = useState<
    Array<{ index: number; x: number; y: number; width: number; height: number }>
  >([]);
  const [sequenceBlockAreas, setSequenceBlockAreas] = useState<SequenceBlockArea[]>([]);
  const hoveredSequenceTargetsRef = useRef<{
    textEl: SVGElement | null;
    lineEl: SVGElement | null;
  }>({ textEl: null, lineEl: null });
  // Opener for the highlight-recolor popover. EditorCanvas owns the popover (it needs canvasShell
  // coords + its own state), but the dblclick that triggers it is detected here in handleEditClick
  // (the React onDoubleClick on the canvas does NOT fire for SVG rects because react-zoom-pan-pinch
  // intercepts it — only the document-level capture dblclick listener that drives handleEditClick
  // works). EditorCanvas assigns `.current`; handleEditClick calls it when a highlight rect is hit.
  const openHighlightRecolorRef = useRef<
    ((lineIndex: number, color: string, clientX: number, clientY: number) => void) | null
  >(null);

  const findNearestLineForText = useCallback((textEl: SVGElement, lineEls: SVGElement[]) => {
    if (lineEls.length === 0) return null;
    const textRect = textEl.getBoundingClientRect();
    const textX = textRect.left + textRect.width / 2;
    const textY = textRect.top + textRect.height / 2;
    let nearest = lineEls[0];
    let best = Number.POSITIVE_INFINITY;
    for (const lineEl of lineEls) {
      const lineRect = lineEl.getBoundingClientRect();
      const lineY = lineRect.top + lineRect.height / 2;
      const dx =
        textX < lineRect.left
          ? lineRect.left - textX
          : textX > lineRect.right
            ? textX - lineRect.right
            : 0;
      const dy = Math.abs(lineY - textY);

      // Prefer lines at/under the text and with horizontal overlap.
      const underPenalty = lineY < textY ? 60 : 0;
      const score = dy * 3 + dx + underPenalty;

      if (score < best) {
        best = score;
        nearest = lineEl;
      }
    }
    return nearest;
  }, []);

  const findNearestTextForLine = useCallback((lineEl: SVGElement, textEls: SVGElement[]) => {
    if (textEls.length === 0) return null;
    const lineRect = lineEl.getBoundingClientRect();
    const lineX = lineRect.left + lineRect.width / 2;
    const lineY = lineRect.top + lineRect.height / 2;
    let nearest = textEls[0];
    let best = Number.POSITIVE_INFINITY;
    for (const textEl of textEls) {
      const textRect = textEl.getBoundingClientRect();
      const textX = textRect.left + textRect.width / 2;
      const textY = textRect.top + textRect.height / 2;

      const dx = Math.abs(textX - lineX);
      const dy = Math.abs(textY - lineY);
      // Prefer label positioned above the connection line.
      const abovePenalty = textY > lineY ? 40 : 0;
      const score = dy * 3 + dx + abovePenalty;

      if (score < best) {
        best = score;
        nearest = textEl;
      }
    }
    return nearest;
  }, []);

  const getSequenceTextElsForLine = useCallback(
    (lineEl: SVGElement | null, textEls: SVGElement[], lineEls: SVGElement[]) => {
      if (!lineEl) return [];
      const grouped = textEls.filter(
        (textEl) => findNearestLineForText(textEl, lineEls) === lineEl,
      );
      if (grouped.length > 0) return grouped;
      const fallback = findNearestTextForLine(lineEl, textEls);
      return fallback ? [fallback] : [];
    },
    [findNearestLineForText, findNearestTextForLine],
  );

  // Live hit-test: returns the message whose connection band (line + label, with
  // padding) contains the given canvas-space point. Computed directly from the DOM
  // so it is reliable on cold load, independent of any precomputed-areas state.
  const findSequenceMessageBandAtPoint = useCallback(
    (canvasX: number, canvasY: number): { index: number; el: SVGElement } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      const messageTextEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];
      const paddingX = SEQ_MSG_HITTEST_PADDING.x;
      const paddingY = SEQ_MSG_HITTEST_PADDING.y;
      let bestIndex = -1;
      let bestEl: SVGElement | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < messageTextEls.length; i += 1) {
        const textEl = messageTextEls[i];
        const lineEl = findNearestLineForText(textEl, messageLineEls);
        const textRect = textEl.getBoundingClientRect();
        const lineRect = lineEl?.getBoundingClientRect();
        const left = Math.min(textRect.left, lineRect?.left ?? textRect.left);
        const top = Math.min(textRect.top, lineRect?.top ?? textRect.top);
        const right = Math.max(textRect.right, lineRect?.right ?? textRect.right);
        const bottom = Math.max(textRect.bottom, lineRect?.bottom ?? textRect.bottom);
        const x = (left - containerRect.left + container.scrollLeft) / scale - paddingX;
        const y = (top - containerRect.top + container.scrollTop) / scale - paddingY;
        const w = Math.max(0, (right - left) / scale + paddingX * 2);
        const h = Math.max(0, (bottom - top) / scale + paddingY * 2);
        if (canvasX >= x && canvasX <= x + w && canvasY >= y && canvasY <= y + h) {
          // Bands of adjacent messages can overlap (padding); pick the one whose
          // vertical center is closest to the cursor.
          const dist = Math.abs(canvasY - (y + h / 2));
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
            bestEl = textEl;
          }
        }
      }
      return bestEl ? { index: bestIndex, el: bestEl } : null;
    },
    [containerRef, findNearestLineForText],
  );

  const clearSequenceMessageHoverHighlight = useCallback(() => {
    hoveredSequenceTargetsRef.current.textEl?.classList.remove("sequence-msg-hover-highlight-text");
    hoveredSequenceTargetsRef.current.lineEl?.classList.remove("sequence-msg-hover-highlight-line");
    hoveredSequenceTargetsRef.current = { textEl: null, lineEl: null };
    setHoveredSequenceMessageBox(null);
  }, []);

  const updateSequenceMessageHoverHighlight = useCallback(
    (target: EventTarget | null) => {
      const container = containerRef.current;
      if (!container || !(target instanceof Element)) {
        clearSequenceMessageHoverHighlight();
        return;
      }

      // The hover trigger overlay sits above message primitives. When the cursor is on it,
      // preserve the current paired highlight instead of clearing.
      if (target.closest('[data-seq-msg-hover-trigger="true"]')) {
        return;
      }

      const messageTextEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];

      const messageTextEl = target.closest(".messageText") as SVGElement | null;
      const messageLineEl = target.closest(
        '[class^="messageLine"], [class*=" messageLine"]',
      ) as SVGElement | null;

      const getCenterY = (el: SVGElement) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      };

      let nextTextEl: SVGElement | null = null;
      let nextLineEl: SVGElement | null = null;

      if (messageTextEl) {
        nextTextEl = messageTextEl;
        nextLineEl = findNearestLineForText(messageTextEl, messageLineEls);
      } else if (messageLineEl) {
        nextLineEl = messageLineEl;
        nextTextEl = findNearestTextForLine(nextLineEl, messageTextEls);
      }

      if (
        hoveredSequenceTargetsRef.current.textEl === nextTextEl &&
        hoveredSequenceTargetsRef.current.lineEl === nextLineEl
      ) {
        return;
      }

      hoveredSequenceTargetsRef.current.textEl?.classList.remove(
        "sequence-msg-hover-highlight-text",
      );
      hoveredSequenceTargetsRef.current.lineEl?.classList.remove(
        "sequence-msg-hover-highlight-line",
      );

      if (nextTextEl || nextLineEl) {
        nextTextEl?.classList.add("sequence-msg-hover-highlight-text");
        nextLineEl?.classList.add("sequence-msg-hover-highlight-line");

        hoveredSequenceTargetsRef.current = { textEl: nextTextEl, lineEl: nextLineEl };

        const lineEl = nextLineEl;
        const textEl = nextTextEl;
        const lineRect = lineEl?.getBoundingClientRect();
        const textRect = textEl?.getBoundingClientRect();
        if (lineRect || textRect) {
          const containerRect = container.getBoundingClientRect();
          const scale = containerRect.width / container.offsetWidth;
          const left = Math.min(
            lineRect?.left ?? Number.POSITIVE_INFINITY,
            textRect?.left ?? Number.POSITIVE_INFINITY,
          );
          const top = Math.min(
            lineRect?.top ?? Number.POSITIVE_INFINITY,
            textRect?.top ?? Number.POSITIVE_INFINITY,
          );
          const right = Math.max(
            lineRect?.right ?? Number.NEGATIVE_INFINITY,
            textRect?.right ?? Number.NEGATIVE_INFINITY,
          );
          const bottom = Math.max(
            lineRect?.bottom ?? Number.NEGATIVE_INFINITY,
            textRect?.bottom ?? Number.NEGATIVE_INFINITY,
          );

          // Equal padding (canvas units) applied here AND in the click/recalc selection box
          // builders, so the hover box and the selection box stay pixel-identical — one
          // single border box for both states (see SEQ_MSG_SELECTION_PADDING).
          setHoveredSequenceMessageBox({
            x:
              (left - containerRect.left + container.scrollLeft) / scale -
              SEQ_MSG_SELECTION_PADDING.x,
            y:
              (top - containerRect.top + container.scrollTop) / scale - SEQ_MSG_SELECTION_PADDING.y,
            width: Math.max(0, (right - left) / scale + SEQ_MSG_SELECTION_PADDING.x * 2),
            height: Math.max(0, (bottom - top) / scale + SEQ_MSG_SELECTION_PADDING.y * 2),
          });
        } else {
          setHoveredSequenceMessageBox(null);
        }
        return;
      }

      hoveredSequenceTargetsRef.current = { textEl: null, lineEl: null };
      setHoveredSequenceMessageBox(null);
    },
    [
      containerRef,
      clearSequenceMessageHoverHighlight,
      findNearestLineForText,
      findNearestTextForLine,
    ],
  );

  // Resolve the hover target to a message element. When the pointer is over the
  // empty connection band (not exactly on the line/label), fall back to the band's
  // messageText so the whole connection stays highlighted — matching note rect.note.
  // NOTE: This hover handling is wired through React's onMouseOver/onMouseOut props on
  // the canvas container (see EditorCanvas) rather than a manual addEventListener effect.
  // A previous addEventListener-in-useEffect approach silently attached to a stale DOM
  // node whenever the container remounted without the effect's deps changing, leaving the
  // live container with NO hover listener. React-managed props re-bind automatically on
  // every remount, so the hover ring stays reliable.
  const resolveMessageHoverTarget = useCallback(
    (clientX: number, clientY: number, rawTarget: EventTarget | null): EventTarget | null => {
      const container = containerRef.current;
      if (!container) return rawTarget;
      if (
        rawTarget instanceof Element &&
        rawTarget.closest('.messageText, [class^="messageLine"], [class*=" messageLine"]')
      ) {
        return rawTarget;
      }
      const rect = container.getBoundingClientRect();
      const scale = rect.width / container.offsetWidth;
      const cx = (clientX - rect.left + container.scrollLeft) / scale;
      const cy = (clientY - rect.top + container.scrollTop) / scale;
      const band = findSequenceMessageBandAtPoint(cx, cy);
      return band ? band.el : rawTarget;
    },
    [containerRef, findSequenceMessageBandAtPoint],
  );

  // Note hover via the reliable onMouseOver/onMouseOut path (mirrors message hover). Uses a
  // viewport-coordinate hit-test against rect.note boxes so it stays stable even when the note's
  // reorder grab overlay (pointer-events:auto) covers the note and changes e.target.
  const updateSequenceNoteHover = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) {
        setHoveredSequenceNoteBox(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      const noteRects = Array.from(container.querySelectorAll("rect.note")) as SVGElement[];
      let hit: SVGElement | null = null;
      for (const rn of noteRects) {
        const r = rn.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          hit = rn;
          break;
        }
      }
      if (hit) {
        const r = hit.getBoundingClientRect();
        setHoveredSequenceNoteBox({
          x: (r.left - containerRect.left + container.scrollLeft) / scale,
          y: (r.top - containerRect.top + container.scrollTop) / scale,
          width: r.width / scale,
          height: r.height / scale,
        });
      } else {
        setHoveredSequenceNoteBox(null);
      }
    },
    [containerRef],
  );

  const handleSequenceHoverOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (determineDiagramType(code) !== "sequence") return;
      // Floating-UI guard: the hover grab overlay (z-21) is a sibling of the selection
      // box (z-20) and therefore stacks ABOVE the inline toolbar (whose z-30 is trapped
      // inside the z-20 selection box). If we let the hover update while the cursor is
      // over the toolbar, the grab overlay for the message BEHIND the toolbar renders on
      // top of it and steals the press, starting a reorder that reselects that message.
      // Clear the hover so no overlay covers the toolbar.
      const overFloatingUi = (() => {
        const stack =
          typeof document !== "undefined" && document.elementsFromPoint
            ? document.elementsFromPoint(e.clientX, e.clientY)
            : [];
        return stack.some(
          (el) =>
            el.closest?.("[data-inline-toolbar]") ||
            el.closest?.("[data-scale-lock]") ||
            el.closest?.("[data-scale-lock-border]"),
        );
      })();
      if (overFloatingUi) {
        clearSequenceMessageHoverHighlight();
        setHoveredSequenceNoteBox(null);
        return;
      }
      updateSequenceMessageHoverHighlight(
        resolveMessageHoverTarget(e.clientX, e.clientY, e.target),
      );
      updateSequenceNoteHover(e.clientX, e.clientY);
    },
    [
      code,
      determineDiagramType,
      updateSequenceMessageHoverHighlight,
      clearSequenceMessageHoverHighlight,
      setHoveredSequenceNoteBox,
      resolveMessageHoverTarget,
      updateSequenceNoteHover,
    ],
  );

  const handleSequenceHoverOut = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (determineDiagramType(code) !== "sequence") {
        clearSequenceMessageHoverHighlight();
        setHoveredSequenceNoteBox(null);
        return;
      }
      updateSequenceMessageHoverHighlight(
        resolveMessageHoverTarget(e.clientX, e.clientY, e.relatedTarget),
      );
      updateSequenceNoteHover(e.clientX, e.clientY);
    },
    [
      code,
      determineDiagramType,
      updateSequenceMessageHoverHighlight,
      clearSequenceMessageHoverHighlight,
      resolveMessageHoverTarget,
      updateSequenceNoteHover,
    ],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (determineDiagramType(code) !== "sequence") {
      setSequenceMessageTriggerAreas([]);
      return;
    }

    const messageTextEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
    const messageLineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
    ) as SVGElement[];
    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;
    const paddingX = 12;
    const paddingY = 6;

    const areas: Array<{ index: number; x: number; y: number; width: number; height: number }> = [];
    for (let i = 0; i < messageTextEls.length; i += 1) {
      const textEl = messageTextEls[i];
      const lineEl = findNearestLineForText(textEl, messageLineEls);
      const textRect = textEl.getBoundingClientRect();
      const lineRect = lineEl?.getBoundingClientRect();
      const left = Math.min(textRect.left, lineRect?.left ?? textRect.left);
      const top = Math.min(textRect.top, lineRect?.top ?? textRect.top);
      const right = Math.max(textRect.right, lineRect?.right ?? textRect.right);
      const bottom = Math.max(textRect.bottom, lineRect?.bottom ?? textRect.bottom);

      areas.push({
        index: i,
        x: (left - containerRect.left + container.scrollLeft) / scale - paddingX,
        y: (top - containerRect.top + container.scrollTop) / scale - paddingY,
        width: Math.max(0, (right - left) / scale + paddingX * 2),
        height: Math.max(0, (bottom - top) / scale + paddingY * 2),
      });
    }

    setSequenceMessageTriggerAreas(areas);
  }, [containerRef, code, svgContent, determineDiagramType, findNearestLineForText]);

  const getSequenceParticipantEntries = useCallback(() => {
    const participantDecl =
      /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+/i;
    return code
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => participantDecl.test(l))
      .map((l) => {
        const m = l.match(
          /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+([^\s@]+)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i,
        );
        if (!m) return null;
        return {
          id: m[1].trim(),
          alias: m[2]?.trim() || null,
        };
      })
      .filter((v): v is { id: string; alias: string | null } => Boolean(v));
  }, [code]);

  const normalizeSequenceLabel = useCallback((value: string | null | undefined) => {
    return (value || "")
      .replace(/^['\"]|['\"]$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }, []);

  const getSvgTextDisplayName = useCallback((el: SVGElement | null) => {
    if (!el) return "";
    const tspans = Array.from(el.querySelectorAll("tspan"))
      .map((t) => (t.textContent || "").trim())
      .filter(Boolean);
    if (tspans.length > 0) {
      return tspans.join(" ").replace(/\s+/g, " ").trim();
    }
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }, []);

  const resolveSequenceActorIdFromDisplayName = useCallback(
    (displayName: string) => {
      const entries = getSequenceParticipantEntries();
      const normalizedDisplayName = normalizeSequenceLabel(displayName);

      const byAlias = entries.find(
        (e) => normalizeSequenceLabel(e.alias) === normalizedDisplayName,
      );
      if (byAlias) return byAlias.id;

      const byId = entries.find((e) => normalizeSequenceLabel(e.id) === normalizedDisplayName);
      if (byId) return byId.id;

      return displayName;
    },
    [getSequenceParticipantEntries, normalizeSequenceLabel],
  );

  const resolveSequenceDisplayNameFromActorId = useCallback(
    (actorId: string) => {
      const entries = getSequenceParticipantEntries();
      const found = entries.find((e) => e.id === actorId);
      return found?.alias || found?.id || actorId;
    },
    [getSequenceParticipantEntries],
  );

  const getSequenceLifelines = useCallback(() => {
    if (!containerRef.current)
      return [] as Array<{ actorId: string; x: number; y1: number; y2: number }>;

    const containerRect = containerRef.current.getBoundingClientRect();
    const scale = containerRect.width / containerRef.current.offsetWidth;

    const lineEls = Array.from(
      containerRef.current.querySelectorAll("line.actor-line"),
    ) as SVGLineElement[];
    const topActorTextEls = Array.from(containerRef.current.querySelectorAll("text.actor"))
      .sort((a, b) => {
        const ay = Number(a.getAttribute("y") || "0");
        const by = Number(b.getAttribute("y") || "0");
        return ay - by;
      })
      .slice(0, lineEls.length);

    const participantIds = getSequenceParticipantEntries().map((e) => e.id);

    const lifelines = lineEls
      .map((lineEl, index) => {
        const rect = lineEl.getBoundingClientRect();
        const x =
          (rect.left - containerRect.left + containerRef.current!.scrollLeft + rect.width / 2) /
          scale;
        const y1 = (rect.top - containerRect.top + containerRef.current!.scrollTop) / scale;
        const y2 = (rect.bottom - containerRect.top + containerRef.current!.scrollTop) / scale;

        const nearestText = topActorTextEls
          .map((t) => {
            const tRect = t.getBoundingClientRect();
            const tx =
              (tRect.left -
                containerRect.left +
                containerRef.current!.scrollLeft +
                tRect.width / 2) /
              scale;
            return {
              text: getSvgTextDisplayName(t as SVGElement),
              x: tx,
              distance: Math.abs(tx - x),
            };
          })
          .sort((a, b) => a.distance - b.distance)[0];

        const displayName =
          nearestText?.text || topActorTextEls[index]?.textContent?.trim() || `Actor${index + 1}`;
        const actorId = resolveSequenceActorIdFromDisplayName(displayName);

        return { actorId, x, y1, y2 };
      })
      .sort((a, b) => a.x - b.x);

    // Primary mapping strategy: Mermaid places participants in declaration order from left to right.
    // This avoids alias collisions (e.g. multiple "New Boundary" labels).
    if (participantIds.length === lifelines.length) {
      return lifelines.map((l, idx) => ({ ...l, actorId: participantIds[idx] }));
    }

    return lifelines;
  }, [containerRef, resolveSequenceActorIdFromDisplayName, getSvgTextDisplayName]);

  const findNearestSlot = useCallback((slots: number[], y: number) => {
    let nearest = slots[0] ?? y;
    let bestDistance = Math.abs(nearest - y);
    for (const slot of slots) {
      const d = Math.abs(slot - y);
      if (d < bestDistance) {
        bestDistance = d;
        nearest = slot;
      }
    }
    return nearest;
  }, []);

  const isSequenceMessageLine = useCallback((line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) return false;
    const keywords = [
      "sequenceDiagram",
      "Note",
      "note",
      "rect",
      "alt",
      "opt",
      "loop",
      "par",
      "critical",
      "option",
      "else",
      "end",
      "participant",
      "actor",
      "autonumber",
      "activate",
      "deactivate",
      "box",
      "links",
      "link",
      "properties",
      "details",
    ];
    if (keywords.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "))) return false;
    return trimmed.includes(":");
  }, []);

  const getSequenceMessageEntries = useCallback(
    (sourceCode: string) => {
      const lines = sourceCode.split("\n");
      const entries: Array<{ index: number; line: string }> = [];
      let inFrontmatter = false;

      for (let i = 0; i < lines.length; i += 1) {
        const trimmed = lines[i].trim();
        if (trimmed === "---") {
          inFrontmatter = !inFrontmatter;
          continue;
        }
        if (inFrontmatter) continue;

        if (isSequenceMessageLine(lines[i])) {
          entries.push({ index: i, line: lines[i] });
        }
      }

      return entries;
    },
    [isSequenceMessageLine],
  );

  // Parse the code into a flat list of block fragments (loop/alt/opt/par/critical/break/rect),
  // each with its source-line range, nesting depth, and internal section dividers. Stack-based so
  // nested blocks resolve correctly; `depth` reflects how many enclosing blocks each one sits in.
  // A deterministic `id` (`SEQ_BLOCK_<startLine>`) keys selection + geometry across re-renders.
  const getSequenceBlockEntries = useCallback((sourceCode: string): SequenceBlockEntry[] => {
    const lines = sourceCode.split("\n");
    const openerRe = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i;
    const sectionRe = /^(else|and|option)\b/i;
    const closerRe = /^end\b/i;

    const stack: SequenceBlockEntry[] = [];
    const out: SequenceBlockEntry[] = [];
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed === "---") {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter || !trimmed || trimmed.startsWith("%%")) continue;

      const opener = trimmed.match(openerRe);
      if (opener) {
        const type = opener[1].toLowerCase() as SequenceBlockType;
        stack.push({
          id: `SEQ_BLOCK_${i}`,
          type,
          isHighlight: type === "rect",
          label: (opener[2] || "").trim(),
          startLine: i,
          endLine: i,
          depth: stack.length,
          sections: [{ keyword: type, line: i }],
        });
        continue;
      }
      if (sectionRe.test(trimmed) && stack.length > 0) {
        stack[stack.length - 1].sections.push({
          keyword: trimmed.split(/\s+/)[0].toLowerCase(),
          line: i,
        });
        continue;
      }
      if (closerRe.test(trimmed) && stack.length > 0) {
        const blk = stack.pop()!;
        blk.endLine = i;
        out.push(blk);
      }
    }

    // Stable order: outermost first, then by start line (matches DOM paint order for overlays).
    return out.sort((a, b) => a.depth - b.depth || a.startLine - b.startLine);
  }, []);

  // Map a clicked Mermaid block-label element (`.loopText` for an opener label, `.sectionTitle`
  // for an else/and/option divider label) back to its SOURCE line so the label can be renamed
  // inline. Mermaid does NOT paint these labels in source order (inner/nested blocks paint first),
  // but a block's label always sits at the TOP of its box and section dividers never cross — so
  // sorting the label elements by their on-screen Y reproduces SOURCE order exactly. `rect`
  // highlights render no `.loopText` (only a colored box), so they are excluded from the opener
  // list; every other block (loop/alt/opt/par/critical/break) renders exactly one `.loopText`
  // (even when label-less, as a zero-width space), keeping the Y-sorted ↔ source-order map 1:1.
  const resolveSequenceBlockLabelTarget = useCallback(
    (clickedEl: Element | null): { lineIndex: number } | null => {
      const container = containerRef.current;
      if (!container || !clickedEl) return null;
      if (determineDiagramType(code) !== "sequence") return null;

      const labelEl = clickedEl.closest(".loopText, .sectionTitle") as SVGElement | null;
      if (!labelEl) return null;
      const isSection = labelEl.classList.contains("sectionTitle");

      const blocks = getSequenceBlockEntries(code);
      const byTop = (els: SVGElement[]) =>
        els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

      if (isSection) {
        const els = byTop(Array.from(container.querySelectorAll(".sectionTitle")) as SVGElement[]);
        const idx = els.indexOf(labelEl);
        if (idx < 0) return null;
        const dividers = blocks
          .flatMap((b) => b.sections.filter((s) => /^(else|and|option)$/i.test(s.keyword)))
          .sort((a, b) => a.line - b.line);
        if (idx >= dividers.length) return null;
        return { lineIndex: dividers[idx].line };
      }

      const els = byTop(Array.from(container.querySelectorAll(".loopText")) as SVGElement[]);
      const idx = els.indexOf(labelEl);
      if (idx < 0) return null;
      const openers = blocks
        .filter((b) => b.type !== "rect")
        .sort((a, b) => a.startLine - b.startLine);
      if (idx >= openers.length) return null;
      return { lineIndex: openers[idx].startLine };
    },
    [containerRef, code, determineDiagramType, getSequenceBlockEntries],
  );

  // Map a double-clicked `rect` highlight background (`<rect class="rect" fill="rgb(...)">`) back
  // to its SOURCE line + current color so it can be recolored. Like the block labels, Mermaid does
  // NOT paint these rects in source order (inner/nested rects paint first), but their TOP edges are
  // strictly ordered, so Y-sorting the highlight rects reproduces source order. We index the
  // Y-sorted rects into the source-ordered `rect` blocks from `getSequenceBlockEntries`.
  const resolveSequenceHighlightTarget = useCallback(
    (clientX: number, clientY: number): { lineIndex: number; color: string } | null => {
      const container = containerRef.current;
      if (!container || determineDiagramType(code) !== "sequence") return null;

      const isHighlightRect = (el: Element | null): el is SVGElement =>
        !!el &&
        el.tagName.toLowerCase() === "rect" &&
        el.getAttribute("class") === "rect" &&
        /^rgba?\(/i.test(el.getAttribute("fill") || "");

      const hit = document.elementsFromPoint(clientX, clientY).find(isHighlightRect) as
        | SVGElement
        | undefined;
      if (!hit) return null;

      const rects = (Array.from(container.querySelectorAll("rect.rect")) as SVGElement[])
        .filter((r) => /^rgba?\(/i.test(r.getAttribute("fill") || ""))
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const idx = rects.indexOf(hit);
      if (idx < 0) return null;

      const blocks = getSequenceBlockEntries(code)
        .filter((b) => b.type === "rect")
        .sort((a, b) => a.startLine - b.startLine);
      if (idx >= blocks.length) return null;
      return { lineIndex: blocks[idx].startLine, color: hit.getAttribute("fill") || "" };
    },
    [containerRef, code, determineDiagramType, getSequenceBlockEntries],
  );

  // Recompute block overlay geometry (canvas coords) whenever the code or rendered SVG changes.
  // Each block's vertical extent is derived from the rendered message/note rows whose SOURCE line
  // falls inside the block's [startLine, endLine] range; horizontally it spans all lifelines, inset
  // by nesting depth so children sit visibly within parents. Empty blocks fall back to the gap
  // between their neighbouring rows. Mirrors the message-trigger-areas effect (DOM-driven, runs on
  // every re-render so geometry tracks pan/zoom via the canvas-coord conversion).
  //
  // Cold-load race: `react-zoom-pan-pinch`'s <TransformComponent> mounts its children (and thus
  // attaches `containerRef`) a frame AFTER `svgContent` is first set, so the effect can fire with
  // the SVG ready but `containerRef.current` still null (or the lifelines not yet measurable).
  // Ref attachment doesn't re-trigger effects, so we retry on requestAnimationFrame (bounded) until
  // the container + lifelines are measurable, otherwise the overlays would never appear on first
  // paint and only show up after an unrelated re-render.
  useEffect(() => {
    if (determineDiagramType(code) !== "sequence") {
      setSequenceBlockAreas([]);
      return;
    }
    const blocks = getSequenceBlockEntries(code);
    if (blocks.length === 0) {
      setSequenceBlockAreas([]);
      return;
    }

    let rafId = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 150; // ~2.5s worth of frames — covers the deferred TransformComponent mount

    const compute = (): boolean => {
      const container = containerRef.current;
      if (!container) return false;

      const lifelines = getSequenceLifelines();
      if (lifelines.length === 0) return false;

      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      const toY = (v: number) => (v - containerRect.top + container.scrollTop) / scale;

      const messageTextEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];
      const noteTextEls = Array.from(container.querySelectorAll(".noteText")) as SVGElement[];

      const msgEntries = getSequenceMessageEntries(code);
      const codeLines = code.split("\n");
      const noteSrcLines = codeLines
        .map((l, idx) => ({ l: l.trim(), idx }))
        .filter(({ l }) => /^note\b/i.test(l))
        .map(({ idx }) => idx);

      type Row = { srcLine: number; top: number; bottom: number };
      const rows: Row[] = [];
      messageTextEls.forEach((textEl, i) => {
        const srcLine = msgEntries[i]?.index;
        if (srcLine == null) return;
        const tr = textEl.getBoundingClientRect();
        const lineEl = findNearestLineForText(textEl, messageLineEls);
        const lr = lineEl?.getBoundingClientRect();
        rows.push({
          srcLine,
          top: toY(Math.min(tr.top, lr?.top ?? tr.top)),
          bottom: toY(Math.max(tr.bottom, lr?.bottom ?? tr.bottom)),
        });
      });
      noteTextEls.forEach((noteEl, i) => {
        const srcLine = noteSrcLines[i];
        if (srcLine == null) return;
        const rectNote = (noteEl.parentElement?.querySelector("rect.note") ??
          noteEl.parentElement?.parentElement?.querySelector("rect.note")) as SVGElement | null;
        const r = (rectNote ?? noteEl).getBoundingClientRect();
        rows.push({ srcLine, top: toY(r.top), bottom: toY(r.bottom) });
      });
      rows.sort((a, b) => a.top - b.top);

      const minX = Math.min(...lifelines.map((l) => l.x));
      const maxX = Math.max(...lifelines.map((l) => l.x));
      const globalTop = Math.min(...lifelines.map((l) => l.y1));

      const headroom = 18;
      const footer = 10;
      const areas: SequenceBlockArea[] = blocks.map((blk) => {
        const inner = rows.filter((r) => r.srcLine > blk.startLine && r.srcLine < blk.endLine);
        let top: number;
        let bottom: number;
        if (inner.length > 0) {
          top = Math.min(...inner.map((r) => r.top));
          bottom = Math.max(...inner.map((r) => r.bottom));
        } else {
          const before = rows.filter((r) => r.srcLine < blk.startLine).slice(-1)[0];
          const after = rows.filter((r) => r.srcLine > blk.endLine)[0];
          top = before ? before.bottom + 8 : after ? after.top - 40 : globalTop + 20;
          bottom = after ? after.top - 8 : top + 36;
        }
        const padX = Math.max(4, 18 - blk.depth * 10);
        return {
          ...blk,
          x: minX - padX,
          y: top - headroom,
          width: maxX - minX + padX * 2,
          height: bottom - top + headroom + footer,
        };
      });

      setSequenceBlockAreas(areas);
      return true;
    };

    const tick = () => {
      if (compute()) return;
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        setSequenceBlockAreas([]);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    containerRef,
    code,
    svgContent,
    determineDiagramType,
    getSequenceBlockEntries,
    getSequenceMessageEntries,
    getSequenceLifelines,
    findNearestLineForText,
  ]);

  const insertSequenceMessageAtIndex = useCallback(
    (sourceCode: string, messageLine: string, messageIndex: number) => {
      const lines = sourceCode.split("\n");
      const messageEntries = getSequenceMessageEntries(sourceCode);
      const insertAt = messageEntries[messageIndex]?.index ?? lines.length;

      lines.splice(insertAt, 0, `    ${messageLine}`);
      return lines.join("\n");
    },
    [getSequenceMessageEntries],
  );

  const getSequenceMessageLineByIndex = useCallback(
    (idx: number) => {
      const entries = getSequenceMessageEntries(code);
      return entries[idx]?.line || null;
    },
    [code, getSequenceMessageEntries],
  );

  const triggerHoveredSequenceMessageSelection = useCallback(
    (startInlineEdit = false, explicitIndex?: number) => {
      const container = containerRef.current;
      if (!container) return;

      const messageTextEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];

      let textEl =
        typeof explicitIndex === "number" ? null : hoveredSequenceTargetsRef.current.textEl;
      const lineEl =
        typeof explicitIndex === "number"
          ? messageLineEls[explicitIndex] || null
          : textEl
            ? findNearestLineForText(textEl, messageLineEls)
            : hoveredSequenceTargetsRef.current.lineEl;
      const labelEls = getSequenceTextElsForLine(lineEl, messageTextEls, messageLineEls);
      textEl = textEl || labelEls[0] || null;
      if (!textEl && !lineEl) return;

      const centerY = (el: SVGElement | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      };

      let messageIndex =
        typeof explicitIndex === "number"
          ? explicitIndex
          : textEl
            ? messageLineEls.indexOf(findNearestLineForText(textEl, messageLineEls) as SVGElement)
            : -1;
      if (messageIndex < 0 && lineEl && messageTextEls.length > 0) {
        const lineCenterY = centerY(lineEl) ?? 0;
        let nearest = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < messageTextEls.length; i += 1) {
          const d = Math.abs((centerY(messageTextEls[i]) ?? 0) - lineCenterY);
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        messageIndex = nearest;
      }

      if (messageIndex < 0) return;

      const lineRect = lineEl?.getBoundingClientRect();
      const textRect = unionClientRects(labelEls) || textEl?.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;

      const left = Math.min(
        lineRect?.left ?? Number.POSITIVE_INFINITY,
        textRect?.left ?? Number.POSITIVE_INFINITY,
      );
      const top = Math.min(
        lineRect?.top ?? Number.POSITIVE_INFINITY,
        textRect?.top ?? Number.POSITIVE_INFINITY,
      );
      const right = Math.max(
        lineRect?.right ?? Number.NEGATIVE_INFINITY,
        textRect?.right ?? Number.NEGATIVE_INFINITY,
      );
      const bottom = Math.max(
        lineRect?.bottom ?? Number.NEGATIVE_INFINITY,
        textRect?.bottom ?? Number.NEGATIVE_INFINITY,
      );
      const paddingX = 12;
      const paddingY = 3;

      if (
        Number.isFinite(left) &&
        Number.isFinite(top) &&
        Number.isFinite(right) &&
        Number.isFinite(bottom)
      ) {
        setSelectionBox({
          x: (left - containerRect.left + container.scrollLeft) / scale - paddingX,
          y: (top - containerRect.top + container.scrollTop) / scale - paddingY,
          width: Math.max(0, (right - left) / scale + paddingX * 2),
          height: Math.max(0, (bottom - top) / scale + paddingY * 2),
        });
      }

      if (textRect) {
        setTextBox({
          x: (textRect.left - containerRect.left + container.scrollLeft) / scale,
          y: (textRect.top - containerRect.top + container.scrollTop) / scale,
          width: textRect.width / scale,
          height: textRect.height / scale,
        });
      }

      const nodeId = `SEQ_MSG_${messageIndex}`;
      setSelectedNodeIdWithRef(nodeId);
      if (textEl && !textEl.id) textEl.id = `seq-msg-${messageIndex}`;
      setSelectedSvgId(textEl?.id || lineEl?.id || null);

      if (startInlineEdit) {
        const msgLine = getSequenceMessageLineByIndex(messageIndex);
        const colonIdx = msgLine?.indexOf(":") ?? -1;
        const label = colonIdx !== -1 && msgLine ? msgLine.substring(colonIdx + 1).trim() : "";
        setEditingText(label.replace(/<br\s*\/?>/gi, "\n"));
        setIsInlineEditing(true);
      }
    },
    [
      containerRef,
      getSequenceMessageLineByIndex,
      findNearestLineForText,
      getSequenceTextElsForLine,
    ],
  );

  const triggerSequenceMessageHoverByIndex = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;
      const messageTextEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];
      const textEl = messageTextEls[index] || null;
      const lineEl = textEl ? findNearestLineForText(textEl, messageLineEls) : null;
      if (!textEl && !lineEl) return;

      hoveredSequenceTargetsRef.current.textEl?.classList.remove(
        "sequence-msg-hover-highlight-text",
      );
      hoveredSequenceTargetsRef.current.lineEl?.classList.remove(
        "sequence-msg-hover-highlight-line",
      );

      textEl?.classList.add("sequence-msg-hover-highlight-text");
      lineEl?.classList.add("sequence-msg-hover-highlight-line");
      hoveredSequenceTargetsRef.current = { textEl, lineEl };

      const textRect = textEl?.getBoundingClientRect();
      const lineRect = lineEl?.getBoundingClientRect();
      if (!textRect && !lineRect) {
        setHoveredSequenceMessageBox(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      const left = Math.min(
        textRect?.left ?? Number.POSITIVE_INFINITY,
        lineRect?.left ?? Number.POSITIVE_INFINITY,
      );
      const top = Math.min(
        textRect?.top ?? Number.POSITIVE_INFINITY,
        lineRect?.top ?? Number.POSITIVE_INFINITY,
      );
      const right = Math.max(
        textRect?.right ?? Number.NEGATIVE_INFINITY,
        lineRect?.right ?? Number.NEGATIVE_INFINITY,
      );
      const bottom = Math.max(
        textRect?.bottom ?? Number.NEGATIVE_INFINITY,
        lineRect?.bottom ?? Number.NEGATIVE_INFINITY,
      );
      // Equal padding (canvas units) — must match the click/recalc selection box builders
      // so the hover box and the selection box stay pixel-identical (one single border box).
      setHoveredSequenceMessageBox({
        x: (left - containerRect.left + container.scrollLeft) / scale - SEQ_MSG_SELECTION_PADDING.x,
        y: (top - containerRect.top + container.scrollTop) / scale - SEQ_MSG_SELECTION_PADDING.y,
        width: Math.max(0, (right - left) / scale + SEQ_MSG_SELECTION_PADDING.x * 2),
        height: Math.max(0, (bottom - top) / scale + SEQ_MSG_SELECTION_PADDING.y * 2),
      });
    },
    [containerRef, findNearestLineForText],
  );

  const parseSequenceMessageActors = useCallback((line: string) => {
    // Match all Mermaid sequence message operators (longest-first to avoid prefix conflicts):
    // bidirectional, dotted/solid filled-arrow, cross, and async-open variants. The sender group
    // is LAZY (`\S+?`): a greedy `\S+` would swallow the first dash of a double-dash operator
    // (e.g. `B-->>A` parses as sender `B-` + op `-->>`), so lazy matching is required to keep the
    // sender id intact for dotted/cross messages.
    const match = line
      .trim()
      .match(/^(\S+?)\s*(?:<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)\s*(\S+)\s*:/);
    if (!match) return null;
    return {
      from: match[1],
      to: match[2],
    };
  }, []);

  // Geometry of a sequence message's two endpoints (source = sender side, target = receiver
  // side) plus every lifeline's x — all in CANVAS coordinates (pre-transform, so the values are
  // pan/zoom-invariant: a point computed here stays correct as the user pans/zooms because it is
  // divided by the live scale). Consumers (EditorCanvas) render drag handles at these positions
  // inside the TransformComponent and resolve drop targets against `lifelines`.
  //   - `source`/`target` are placed AT the relevant lifeline x (snapped to the arrow), at the
  //     arrow's y. For self-messages (loop) the source sits at the loop top and target at the
  //     loop bottom, both on the actor's own lifeline.
  //   - `isSelf` is true when sender === receiver (self-loop).
  // Returns null when the selection can't be resolved (no DOM, unparsable line, missing lifelines).
  const getSequenceMessageEndpointGeometry = useCallback(
    (messageIndex: number) => {
      const container = containerRef.current;
      if (!container || !Number.isFinite(messageIndex) || messageIndex < 0) return null;

      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      if (!Number.isFinite(scale) || scale <= 0) return null;

      const toCanvasX = (vx: number) => (vx - containerRect.left + container.scrollLeft) / scale;
      const toCanvasY = (vy: number) => (vy - containerRect.top + container.scrollTop) / scale;

      const messageEntry = getSequenceMessageEntries(code)[messageIndex];
      if (!messageEntry) return null;
      const actors = parseSequenceMessageActors(messageEntry.line);
      if (!actors) return null;

      const lifelinesRaw = getSequenceLifelines();
      if (lifelinesRaw.length === 0) return null;
      const lifelines = lifelinesRaw.map((l) => ({ actorId: l.actorId, x: l.x }));

      const fromLL = lifelines.find((l) => l.actorId === actors.from);
      const toLL = lifelines.find((l) => l.actorId === actors.to);
      if (!fromLL || !toLL) return null;

      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];
      const refEl = messageLineEls[messageIndex] || null;
      if (!refEl) return null;
      const refRect = refEl.getBoundingClientRect();

      const isSelf = actors.from === actors.to;

      if (isSelf) {
        // Self-loop: both endpoints live on the actor's own lifeline; source at the top of the
        // arc, target (the arrowhead, what you'd drag away to make it a cross message) at the bottom.
        const topY = toCanvasY(refRect.top);
        const bottomY = toCanvasY(refRect.bottom);
        return {
          from: actors.from,
          to: actors.to,
          isSelf: true,
          source: { x: fromLL.x, y: topY },
          target: { x: toLL.x, y: bottomY },
          lifelines,
        };
      }

      // Cross message: the arrow is a horizontal line at refRect's vertical center spanning the two
      // lifelines. Endpoint x's come from the actual lifeline positions (snapped, exact) rather than
      // the line rect edges (which include the arrowhead overhang).
      const y = toCanvasY(refRect.top + refRect.height / 2);
      return {
        from: actors.from,
        to: actors.to,
        isSelf: false,
        source: { x: fromLL.x, y },
        target: { x: toLL.x, y },
        lifelines,
      };
    },
    [
      containerRef,
      code,
      getSequenceMessageEntries,
      parseSequenceMessageActors,
      getSequenceLifelines,
    ],
  );

  // Parse sequence notes with structure: Note [left|right|over] of [Participant]: [Text]
  const getSequenceNoteEntries = useCallback((sourceCode: string) => {
    const lines = sourceCode.split("\n");
    const entries: Array<{
      index: number;
      line: string;
      position: "left" | "right" | "over";
      participant: string;
      text: string;
    }> = [];
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed === "---") {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter) continue;

      // Match: "Note left|right of Participant: Text" OR "Note over Participant: Text"
      // The "of" keyword is optional for the "over" position (Mermaid uses "Note over X" not "Note over of X").
      const noteMatch = trimmed.match(
        /^Note\s+(left|right|over)\s+(?:of\s+)?(.+?)(?:\s*:\s*(.*))?$/i,
      );
      if (noteMatch) {
        const [, position, participant, text] = noteMatch;
        entries.push({
          index: i,
          line: lines[i],
          position: position.toLowerCase() as "left" | "right" | "over",
          participant: participant.trim(),
          text: text?.trim() || "new note",
        });
      }
    }

    return entries;
  }, []);

  // Insert a note at a specific message index
  const insertSequenceNoteAtIndex = useCallback(
    (
      sourceCode: string,
      position: "left" | "right" | "over",
      participant: string,
      messageIndex: number,
    ) => {
      const lines = sourceCode.split("\n");
      const messageEntries = getSequenceMessageEntries(sourceCode);
      const insertAt = messageEntries[messageIndex]?.index ?? lines.length;

      const noteLine =
        position === "over"
          ? `    Note over ${participant}: new note`
          : `    Note ${position} of ${participant}: new note`;
      lines.splice(insertAt, 0, noteLine);
      return lines.join("\n");
    },
    [getSequenceMessageEntries],
  );

  // Update note position (e.g., from "left" to "right")
  const updateNotePosition = useCallback(
    (sourceCode: string, noteIndex: number, newPosition: "left" | "right" | "over") => {
      const noteEntries = getSequenceNoteEntries(sourceCode);
      if (noteIndex >= noteEntries.length) return sourceCode;

      const lines = sourceCode.split("\n");
      const noteEntry = noteEntries[noteIndex];
      // Use correct Mermaid syntax: "Note over X" (no "of") vs "Note left|right of X"
      const newLine =
        newPosition === "over"
          ? `    Note over ${noteEntry.participant}: ${noteEntry.text}`
          : `    Note ${newPosition} of ${noteEntry.participant}: ${noteEntry.text}`;
      lines[noteEntry.index] = newLine;

      return lines.join("\n");
    },
    [getSequenceNoteEntries],
  );

  // Delete a note
  const deleteSequenceNote = useCallback(
    (sourceCode: string, noteIndex: number) => {
      const noteEntries = getSequenceNoteEntries(sourceCode);
      if (noteIndex >= noteEntries.length) return sourceCode;

      const lines = sourceCode.split("\n");
      lines.splice(noteEntries[noteIndex].index, 1);

      return lines.join("\n");
    },
    [getSequenceNoteEntries],
  );

  // Select (or edit) a sequence note by its `.noteText` DOM index. Mirrors
  // triggerHoveredSequenceMessageSelection but for notes (selection box = rect.note full box,
  // text box = noteText). Used by the note grab overlay's no-drag mouseup path so notes can be
  // selected/edited even though the overlay intercepts the underlying SVG click.
  const triggerHoveredSequenceNoteSelection = useCallback(
    (startInlineEdit = false, index = -1) => {
      const container = containerRef.current;
      if (!container) return;
      const noteTextEls = Array.from(container.querySelectorAll(".noteText")) as SVGElement[];
      const textEl = noteTextEls[index] || null;
      if (!textEl) return;
      const parentGroup = textEl.parentElement;
      const rectNote = (parentGroup?.querySelector("rect.note") ??
        parentGroup?.parentElement?.querySelector("rect.note")) as SVGElement | null;
      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      const boxEl: SVGElement = rectNote || textEl;
      const rect = boxEl.getBoundingClientRect();
      const textRect = textEl.getBoundingClientRect();

      setSelectionBox({
        x: (rect.left - containerRect.left + container.scrollLeft) / scale,
        y: (rect.top - containerRect.top + container.scrollTop) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      });
      setTextBox({
        x: (textRect.left - containerRect.left + container.scrollLeft) / scale,
        y: (textRect.top - containerRect.top + container.scrollTop) / scale,
        width: textRect.width / scale,
        height: textRect.height / scale,
      });
      setSelectedNodeIdWithRef(`SEQ_NOTE_${index}`);
      setSelectedSvgId(textEl.id || rectNote?.id || null);

      if (startInlineEdit) {
        const noteEntry = getSequenceNoteEntries(code)[index];
        setEditingText(noteEntry?.text || "");
        setIsInlineEditing(true);
      }
    },
    [containerRef, code, getSequenceNoteEntries],
  );

  const getSequenceAnchorSlots = useCallback(
    (lifeline: { actorId: string; x: number; y1: number; y2: number }, hoverY?: number) => {
      const allLifelines = getSequenceLifelines();
      const globalTop =
        allLifelines.length > 0 ? Math.min(...allLifelines.map((l) => l.y1)) : lifeline.y1;
      const start = globalTop + 8;

      let boxTopLimit = lifeline.y2;
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        const bottomActors = Array.from(
          containerRef.current.querySelectorAll("rect.actor.actor-bottom"),
        ) as SVGElement[];
        if (bottomActors.length > 0) {
          const nearestBottom = bottomActors
            .map((el) => {
              const r = el.getBoundingClientRect();
              const x =
                (r.left - containerRect.left + containerRef.current!.scrollLeft + r.width / 2) /
                scale;
              const top = (r.top - containerRect.top + containerRef.current!.scrollTop) / scale;
              return { x, top, dx: Math.abs(x - lifeline.x) };
            })
            .sort((a, b) => a.dx - b.dx)[0];
          if (nearestBottom && nearestBottom.dx < 80) {
            boxTopLimit = Math.min(boxTopLimit, nearestBottom.top - 2);
          }
        }
      }

      const end = Math.max(start, Math.min(lifeline.y2 - 2, boxTopLimit));

      const rowAnchors: number[] = [];

      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        const messageLines = Array.from(
          containerRef.current.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
        ) as SVGGraphicsElement[];

        for (const line of messageLines) {
          const rect = line.getBoundingClientRect();
          const centerY =
            (rect.top - containerRect.top + containerRef.current.scrollTop + rect.height / 2) /
            scale;
          if (centerY >= globalTop && centerY <= lifeline.y2 + 28) {
            rowAnchors.push(Math.round(centerY));
          }
        }
      }

      const rows = [...new Set(rowAnchors)].sort((a, b) => a - b);

      // FLAT-SURFACE GRID — NOTE-INDEPENDENT:
      // Every lifeline is treated as a flat plane. The slot grid (above-first / midpoints /
      // below-last) is derived PURELY from the shared global message rows, so it is IDENTICAL
      // for every lifeline regardless of which lifeline is hovered. Notes have ZERO effect on
      // placement: their presence or absence never inserts, removes, shifts, or resizes a slot.
      // This guarantees uniform vertical alignment of the purple "+" buttons across all
      // lifelines (the "Order 1 rule" applied everywhere). Do NOT reintroduce note avoidance —
      // it breaks the flat-surface guarantee by making columns drift relative to one another.

      // Empty lifeline: one dynamic handle that follows hover and snaps to safe bounds.
      if (rows.length === 0) {
        const fallbackY = hoverY ?? (start + end) / 2;
        return [Math.round(Math.max(start, Math.min(end, fallbackY)))];
      }

      // Existing messages: one slot above the first, one midpoint between each adjacent pair,
      // one slot below the last.
      const VERTICAL_GRID_STEP = 56;
      const firstGap = 12;
      const lastGap =
        rows.length > 1
          ? Math.max(28, Math.round((rows[rows.length - 1] - rows[rows.length - 2]) / 2))
          : VERTICAL_GRID_STEP;
      const targetYs: number[] = [];
      targetYs.push(Math.round(rows[0] - firstGap));

      // The second slot (the first midpoint, between rows[0] and rows[1]) is nudged UP slightly so
      // it doesn't graze the first message arrow. This is a uniform, index-based offset — it shifts
      // identically on every lifeline, preserving the flat-surface guarantee (no note dependence).
      const SECOND_SLOT_LIFT = 6;
      for (let i = 0; i < rows.length - 1; i += 1) {
        const midpoint = Math.round((rows[i] + rows[i + 1]) / 2);
        targetYs.push(i === 0 ? midpoint - SECOND_SLOT_LIFT : midpoint);
      }

      targetYs.push(Math.round(rows[rows.length - 1] + lastGap));

      // The first slot sits at rows[0]-firstGap, which may be above `start` when the first
      // message is close to the actor box. We keep it as-is (only clamping to the lifeline
      // extent) so a + always appears ABOVE the first message; all other slots clamp to [start, end].
      const contextual = targetYs
        .map((y, i) => {
          if (i === 0) {
            return Math.max(globalTop, Math.min(end, y));
          }
          return Math.max(start, Math.min(end, y));
        })
        .sort((a, b) => a - b);

      if (contextual.length === 0) {
        return [Math.round(Math.max(start, Math.min(end, rows[0])))];
      }

      return [...new Set(contextual)];
    },
    [containerRef, getSequenceLifelines],
  );

  const getSelectedMessageOverlay = useCallback(
    (selectedId: string) => {
      if (!selectedId.startsWith("SEQ_MSG_") || !containerRef.current)
        return null as { actorId: string; x: number; slots: number[] } | null;
      const idx = parseInt(selectedId.replace("SEQ_MSG_", ""), 10);
      if (!Number.isFinite(idx)) return null;

      const msgLine = getSequenceMessageLineByIndex(idx);
      if (!msgLine) return null;
      const actors = parseSequenceMessageActors(msgLine);
      if (!actors?.from) return null;

      const lifelines = getSequenceLifelines();
      const lifeline = lifelines.find((l) => l.actorId === actors.from);
      if (!lifeline) return null;

      return {
        actorId: lifeline.actorId,
        x: lifeline.x,
        slots: getSequenceAnchorSlots(lifeline),
      };
    },
    [
      containerRef,
      getSequenceMessageLineByIndex,
      parseSequenceMessageActors,
      getSequenceLifelines,
      getSequenceAnchorSlots,
    ],
  );

  const getSequenceInsertIndexForAnchor = useCallback(
    (anchorY: number) => {
      if (!containerRef.current) return Number.MAX_SAFE_INTEGER;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;

      const messageLineEls = Array.from(
        containerRef.current.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGGraphicsElement[];

      const messageYsFromLines = messageLineEls
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return (
            (rect.top - containerRect.top + containerRef.current!.scrollTop + rect.height / 2) /
            scale
          );
        })
        .filter((y) => Number.isFinite(y));

      const baseYs =
        messageYsFromLines.length > 0
          ? messageYsFromLines
          : (
              Array.from(
                containerRef.current.querySelectorAll(".messageText"),
              ) as SVGGraphicsElement[]
            )
              .map((m) => {
                const rect = m.getBoundingClientRect();
                return (
                  (rect.top -
                    containerRect.top +
                    containerRef.current!.scrollTop +
                    rect.height / 2) /
                  scale
                );
              })
              .filter((y) => Number.isFinite(y));

      if (baseYs.length === 0) return 0;

      const msgYs = [...baseYs].sort((a, b) => a - b);

      let idx = 0;
      while (idx < msgYs.length && msgYs[idx] < anchorY) {
        idx += 1;
      }
      return idx;
    },
    [containerRef],
  );

  const normalizeId = useCallback(
    (id: string) => {
      // Class-diagram relationship edge ids are kept verbatim (`CLASS_EDGE_id_<Src>_<Dst>_<N>`);
      // the trailing `_<N>` must NOT be stripped as a render suffix.
      if (id.startsWith("CLASS_EDGE_")) return id;
      // ER-diagram relationship edge ids are kept verbatim too (`ER_EDGE_id_<src>_<dst>_<N>`).
      if (id.startsWith("ER_EDGE_")) return id;
      // State-diagram transition edge ids are kept verbatim too (`STATE_EDGE_edge<N>`).
      if (id.startsWith("STATE_EDGE_")) return id;
      let cleanId = id.replace("-hit-target", "");

      // 1. Remove render ID prefix if present
      if (renderIdRef.current && cleanId.includes(renderIdRef.current)) {
        const prefixRegex = new RegExp(`^.*?-?${renderIdRef.current}-`);
        cleanId = cleanId.replace(prefixRegex, "");
      }

      // Also remove generic svg- or flowchart- prefixes that might be added
      cleanId = cleanId.replace(/^svg-/, "").replace(/^flowchart-/, "");

      // 2. Check if it is an edge ID pattern: e.g., L_n2_n4_2 or L-n2-n4-3
      // We want to match L, followed by src, followed by dst, followed by a raw index.
      const edgeMatch = cleanId.match(/^L[_-]([a-zA-Z0-9]+)[_-]([a-zA-Z0-9]+)[_-](\d+)$/);
      if (edgeMatch) {
        const src = edgeMatch[1];
        const dst = edgeMatch[2];
        const rawIndex = parseInt(edgeMatch[3], 10);
        // Canonicalize edge ID to use underscores and even rawIndex
        const canonicalIndex = 2 * Math.floor(rawIndex / 2);
        return `L_${src}_${dst}_${canonicalIndex}`;
      }

      // 3. For non-edge IDs, strip trailing render suffixes like -1, _2
      cleanId = cleanId.replace(/[-_]\d+$/, "");

      return cleanId;
    },
    [renderIdRef],
  );

  const recalculateSelection = useCallback(() => {
    if (!selectedNodeId || !containerRef.current) return;
    // Block-label inline edit (`SEQ_BLK_<line>`) manages its own selection/text box directly in
    // handleEditClick and clears it on submit; it has no persistent SVG element to re-resolve, so
    // skip recalc (otherwise the "couldn't find element" branch would clear the box mid-edit).
    if (selectedNodeId.startsWith("SEQ_BLK_")) return;

    // Search for the element corresponding to selectedNodeId
    let foundElement: SVGElement | null = null;
    let foundRawSvgId: string | null = null;

    // Class-diagram relationship edges: re-resolve by the stable `data-id` (the render id prefix
    // changes every re-render, but `id_<Src>_<Dst>_<N>` does not). Measure the real `path.relation`
    // (not the transparent hit-target) so the selection box hugs the visible connector.
    if (selectedNodeId.startsWith("CLASS_EDGE_")) {
      const dataId = selectedNodeId.replace("CLASS_EDGE_", "");
      const path = containerRef.current.querySelector(
        `path.relation[data-id="${dataId}"]`,
      ) as SVGElement | null;
      if (path) {
        foundElement = path;
        foundRawSvgId = path.id || null;
      }
    } else if (selectedNodeId.startsWith("ER_EDGE_")) {
      // ER relationship edges: re-resolve by the stable `data-id`; measure the real
      // `path.relationshipLine` (not the transparent hit-target) so the box hugs the visible line.
      const dataId = selectedNodeId.replace("ER_EDGE_", "");
      const path = containerRef.current.querySelector(
        `path.relationshipLine[data-id="${dataId}"]`,
      ) as SVGElement | null;
      if (path) {
        foundElement = path;
        foundRawSvgId = path.id || null;
      }
    } else if (selectedNodeId.startsWith("STATE_EDGE_")) {
      // State transitions: re-resolve by the stable `data-id` (`edge<N>`); measure the real
      // `path.transition` (not the transparent hit-target) so the box hugs the visible line.
      const dataId = selectedNodeId.replace("STATE_EDGE_", "");
      const path = containerRef.current.querySelector(
        `path.transition[data-id="${dataId}"]`,
      ) as SVGElement | null;
      if (path) {
        foundElement = path;
        foundRawSvgId = path.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_ACTOR_")) {
      const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
      const actorDisplayName = resolveSequenceDisplayNameFromActorId(actorId);

      // First, preserve the exact clicked actor element (top or bottom) when possible. The clicked
      // element's id is twin-unique (it embeds the element's top/left in `seq-actor-<id>-<l>-<t>`),
      // so resolving it back guarantees the SAME instance the user clicked stays selected. The
      // class check accepts BOTH `actor` (rect headers + Entity/Database/Queue `g.actor` groups)
      // AND `actor-man` (the Actor/Boundary/Control stick-figure groups, which do NOT carry the
      // bare `actor` class) — without `actor-man` here, clicking a complex top header fell through
      // to the geometry fallback below and snapped to the WRONG twin (the bottom footer).
      if (selectedSvgId) {
        const exactEl = containerRef.current.querySelector(
          `#${CSS.escape(selectedSvgId)}`,
        ) as SVGElement | null;
        if (
          exactEl &&
          (exactEl.classList?.contains("actor") || exactEl.classList?.contains("actor-man"))
        ) {
          foundElement = exactEl;
          foundRawSvgId = exactEl.id || null;
        }
      }

      // Prefer geometry-based matching from actorId -> lifeline x.
      let bestRect: Element | null = null;
      const lifeline = getSequenceLifelines().find((l) => l.actorId === actorId);
      if (!foundElement && lifeline) {
        const selectedCenterY = selectionBox ? selectionBox.y + selectionBox.height / 2 : null;
        const actorElements = Array.from(
          containerRef.current.querySelectorAll(".actor, .actor-man"),
        ) as SVGElement[];
        const byX = actorElements
          .map((el) => {
            const b = el.getBoundingClientRect();
            const centerX = b.left + b.width / 2;
            const centerY = b.top + b.height / 2;
            const containerRect = containerRef.current!.getBoundingClientRect();
            const scale = containerRect.width / containerRef.current!.offsetWidth;
            const canvasX =
              (centerX - containerRect.left + containerRef.current!.scrollLeft) / scale;
            const canvasY = (centerY - containerRect.top + containerRef.current!.scrollTop) / scale;
            return {
              el,
              top: b.top,
              centerX: canvasX,
              centerY: canvasY,
              dx: Math.abs(canvasX - lifeline.x),
              dy: selectedCenterY === null ? 0 : Math.abs(canvasY - selectedCenterY),
            };
          })
          .filter(
            (item) => Number.isFinite(item.centerX) && Number.isFinite(item.dx) && item.dx < 120,
          )
          .sort((a, b) => a.dx - b.dx || a.dy - b.dy || a.top - b.top);
        if (byX[0]) {
          const minDx = byX[0].dx;
          const sameTrack = byX
            .filter((item) => Math.abs(item.dx - minDx) < 1.5)
            .sort((a, b) => a.dy - b.dy || a.top - b.top);
          bestRect = (sameTrack[0] || byX[0]).el;
        }
      }

      // Fallback to text-based matching when geometry resolution fails.
      if (!foundElement && !bestRect) {
        const selectedCenterY = selectionBox ? selectionBox.y + selectionBox.height / 2 : null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const g of Array.from(containerRef.current.querySelectorAll("g"))) {
          const directTexts = Array.from(g.children).filter(
            (c): c is Element => c.tagName === "text",
          );
          if (directTexts.some((t) => t.textContent?.trim() === actorDisplayName)) {
            const rectEl = g.querySelector("rect") || g;
            const b = (rectEl as SVGElement).getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();
            const scale = containerRect.width / containerRef.current.offsetWidth;
            const centerY =
              (b.top - containerRect.top + containerRef.current.scrollTop + b.height / 2) / scale;
            const score = selectedCenterY === null ? b.top : Math.abs(centerY - selectedCenterY);
            if (score < bestScore) {
              bestScore = score;
              bestRect = rectEl;
            }
          }
        }
      }

      if (!foundElement && bestRect) {
        foundElement = bestRect as SVGElement;
        if (!bestRect.id) {
          const b = (bestRect as SVGElement).getBoundingClientRect();
          (bestRect as SVGElement).id =
            `seq-actor-${actorId.replace(/[^a-zA-Z0-9_]/g, "")}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        foundRawSvgId = (bestRect as SVGElement).id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_MSG_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
      const allMsgs = Array.from(containerRef.current.querySelectorAll(".messageText"));
      if (allMsgs[idx]) {
        foundElement = allMsgs[idx] as SVGElement;
        if (!foundElement.id) foundElement.id = `seq-msg-${idx}`;
        foundRawSvgId = foundElement.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
      const allNotes = Array.from(containerRef.current.querySelectorAll(".noteText"));
      if (allNotes[idx]) {
        foundElement = allNotes[idx] as SVGElement;
        if (!foundElement.id) foundElement.id = `seq-note-${idx}`;
        foundRawSvgId = foundElement.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_")) {
      // Legacy fallback
      const name = selectedNodeId.replace("SEQ_", "");
      const candidates = containerRef.current.querySelectorAll(".actor, .messageText, .noteText");
      for (const candidate of Array.from(candidates)) {
        if (candidate.textContent?.trim() === name) {
          foundElement = candidate as SVGElement;
          foundRawSvgId = candidate.id || null;
          break;
        }
      }
    } else {
      // It's a flowchart node, cluster, or link
      if (selectedSvgId) {
        const exact = containerRef.current.querySelector(
          `#${CSS.escape(selectedSvgId)}`,
        ) as SVGElement | null;
        if (exact) {
          foundElement = exact;
          foundRawSvgId = exact.id || null;
        }
      }

      if (foundElement) {
        // Exact raw SVG id match wins. This preserves selection identity when multiple
        // elements normalize to the same clean id (e.g. duplicate subgraph titles).
      } else {
        let candidatesList: SVGElement[] = [];
        if (isEdgeId(selectedNodeId)) {
          const edgeLabels = Array.from(containerRef.current.querySelectorAll(".edgeLabel"));
          const flowchartLinks = Array.from(
            containerRef.current.querySelectorAll(
              "path.flowchart-link:not(.flowchart-link-hit-target)",
            ),
          );
          const otherNodes = Array.from(containerRef.current.querySelectorAll(".node, .cluster"));
          candidatesList = [...edgeLabels, ...flowchartLinks, ...otherNodes] as SVGElement[];
        } else {
          candidatesList = Array.from(
            containerRef.current.querySelectorAll(
              ".node, .cluster, path.flowchart-link:not(.flowchart-link-hit-target), .edgeLabel",
            ),
          ) as SVGElement[];
        }

        for (const candidate of candidatesList) {
          let nodeId = candidate.id;
          if (!nodeId && candidate.classList?.contains("edgeLabel")) {
            const dataIdEl = candidate.querySelector("[data-id]");
            if (dataIdEl) {
              const rawId = dataIdEl.getAttribute("data-id");
              if (rawId) {
                const canonical = normalizeId(rawId);
                // Only snap selection to labeled edge labels (non-empty text).
                // For empty/unlabeled edge labels, do not set nodeId so that the loop
                // bypasses this candidate and selects the path element instead.
                const hasText = candidate.textContent?.trim() !== "";
                if (hasText) {
                  const paths = Array.from(
                    containerRef.current.querySelectorAll(
                      "path.flowchart-link:not(.flowchart-link-hit-target)",
                    ),
                  );
                  const matchingPath = paths.find((p) => p.id && normalizeId(p.id) === canonical);
                  if (matchingPath) {
                    nodeId = matchingPath.id;
                  }
                }
              }
            }
          }

          if (nodeId) {
            const cleanId = normalizeId(nodeId);

            if (cleanId === selectedNodeId) {
              foundElement = candidate;
              if (candidate.classList?.contains("edgeLabel") && !candidate.id) {
                candidate.id = `edge-label-${cleanId}`;
              }
              foundRawSvgId = candidate.id || null;
              break;
            }
          }
        }
      }
    }

    if (foundElement && containerRef.current) {
      let rect = foundElement.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;

      let elementToMeasure = foundElement;
      const innerText = foundElement.querySelector(
        ".label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label",
      );
      if (innerText) {
        elementToMeasure = innerText as SVGElement;
      } else if (
        foundElement.tagName === "text" ||
        foundElement.tagName === "foreignObject" ||
        foundElement.classList?.contains("label")
      ) {
        elementToMeasure = foundElement;
      }
      let textRect = elementToMeasure.getBoundingClientRect();

      // For sequence messages, preserve the larger combined selection bounds (line + label)
      // so the outer message selection frame remains stable after recalc.
      if (selectedNodeId.startsWith("SEQ_MSG_")) {
        const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
        if (Number.isFinite(idx) && idx >= 0) {
          const allMsgTexts = Array.from(
            containerRef.current.querySelectorAll(".messageText"),
          ) as SVGElement[];
          const allMsgLines = Array.from(
            containerRef.current.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ),
          ) as SVGElement[];

          const pairedLine = allMsgLines[idx] || findNearestLineForText(foundElement, allMsgLines);
          const pairedTextEls = getSequenceTextElsForLine(pairedLine, allMsgTexts, allMsgLines);
          const pairedText = pairedTextEls[0] || foundElement;

          const lineRect = pairedLine?.getBoundingClientRect();
          const labelRect =
            unionClientRects(pairedTextEls) ||
            (pairedText as SVGElement | null)?.getBoundingClientRect();
          if (lineRect || labelRect) {
            const left = Math.min(
              lineRect?.left ?? Number.POSITIVE_INFINITY,
              labelRect?.left ?? Number.POSITIVE_INFINITY,
            );
            const top = Math.min(
              lineRect?.top ?? Number.POSITIVE_INFINITY,
              labelRect?.top ?? Number.POSITIVE_INFINITY,
            );
            const right = Math.max(
              lineRect?.right ?? Number.NEGATIVE_INFINITY,
              labelRect?.right ?? Number.NEGATIVE_INFINITY,
            );
            const bottom = Math.max(
              lineRect?.bottom ?? Number.NEGATIVE_INFINITY,
              labelRect?.bottom ?? Number.NEGATIVE_INFINITY,
            );
            rect = {
              left,
              top,
              right,
              bottom,
              width: Math.max(0, right - left),
              height: Math.max(0, bottom - top),
              x: left,
              y: top,
              toJSON: () => ({}),
            } as DOMRect;
            textRect = (labelRect || lineRect)!;
          }
        }
      }

      // For sequence notes, use rect.note for the full-box selection outline.
      // foundElement is .noteText; we walk up to find the sibling rect.note.
      if (selectedNodeId.startsWith("SEQ_NOTE_")) {
        const parentGroup = foundElement.parentElement;
        const rectNote = (parentGroup?.querySelector("rect.note") ??
          parentGroup?.parentElement?.querySelector("rect.note")) as SVGElement | null;
        if (rectNote) {
          rect = rectNote.getBoundingClientRect();
          textRect = foundElement.getBoundingClientRect();
        }
      }

      // Sequence messages get equal padding so the selection box matches the hover box.
      const msgPadX = selectedNodeId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.x : 0;
      const msgPadY = selectedNodeId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.y : 0;
      const newSelectionBox = {
        x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale - msgPadX,
        y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale - msgPadY,
        width: rect.width / scale + msgPadX * 2,
        height: rect.height / scale + msgPadY * 2,
      };

      const newTextBox = {
        x: (textRect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
        y: (textRect.top - containerRect.top + containerRef.current.scrollTop) / scale,
        width: textRect.width / scale,
        height: textRect.height / scale,
      };

      setSelectionBox(newSelectionBox);
      setTextBox(newTextBox);
      setSelectedSvgId(foundRawSvgId);
    } else {
      // If we couldn't find the selected element in the new SVG, clear the selection
      setSelectionBox(null);
      setTextBox(null);
      setSelectedNodeIdWithRef(null);
      setSelectedSvgId(null);
    }
  }, [
    selectedNodeId,
    selectedSvgId,
    selectionBox,
    containerRef,
    renderIdRef,
    normalizeId,
    resolveSequenceDisplayNameFromActorId,
    getSequenceLifelines,
  ]);

  // Effect to recalculate selection on code or svgContent (re-render) change
  useEffect(() => {
    if (!selectedNodeId) return;

    const timeoutId = setTimeout(() => {
      recalculateSelection();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [code, svgContent, selectedNodeId, recalculateSelection]);

  // Effect to recalculate selection on container or mermaid-container resize (e.g. dragging panel splitter or window resize)
  useEffect(() => {
    if (!selectedNodeId || !containerRef.current) return;

    const observer = new ResizeObserver(() => {
      recalculateSelection();
    });

    const mermaidContainer = containerRef.current.querySelector(".mermaid-container");

    observer.observe(containerRef.current);
    if (mermaidContainer) {
      observer.observe(mermaidContainer);
    }

    return () => {
      observer.disconnect();
    };
  }, [selectedNodeId, containerRef, recalculateSelection, svgContent]);

  const getClickedNode = useCallback(
    (target: Element) => {
      const isSequenceMessageLineElement = (el: SVGElement | null) => {
        if (!el?.classList) return false;
        return Array.from(el.classList).some((c) => c.startsWith("messageLine"));
      };

      let currentNode: SVGElement | null = target as SVGElement;
      let foundNodeClass = false;
      let nodeId = null;

      while (currentNode && currentNode.tagName !== "svg") {
        if (
          currentNode.classList?.contains("node") ||
          currentNode.classList?.contains("cluster") ||
          currentNode.classList?.contains("statediagram-cluster")
        ) {
          foundNodeClass = true;
          nodeId = currentNode.id;
          break;
        }
        if (
          currentNode.classList?.contains("flowchart-link") ||
          currentNode.classList?.contains("flowchart-link-hit-target") ||
          currentNode.classList?.contains("edgeLabel")
        ) {
          foundNodeClass = true;
          nodeId = currentNode.id;
          if (!nodeId) {
            if (currentNode.classList?.contains("edgeLabel")) {
              const dataIdEl = currentNode.querySelector("[data-id]");
              if (dataIdEl) {
                const rawId = dataIdEl.getAttribute("data-id");
                if (rawId) {
                  const canonical = normalizeId(rawId);
                  const paths = Array.from(
                    containerRef.current?.querySelectorAll(
                      "path.flowchart-link:not(.flowchart-link-hit-target)",
                    ) || [],
                  );
                  const path = paths.find((p) => p.id && normalizeId(p.id) === canonical);
                  if (path && path.id) nodeId = path.id;
                }
              }
            } else {
              const path =
                currentNode.parentElement?.querySelector(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ) || currentNode.closest(".edgeLabel")?.previousElementSibling;
              if (path && path.id) nodeId = path.id;
            }
          }
          break;
        }
        // Class-diagram relationship edges. The relation path (and its wide transparent hit-target
        // clone) carries a stable `data-id`. Only a UML RELATIONSHIP (`id_<Src>_<Dst>_<N>`) is
        // selectable as an edge → surface it as `CLASS_EDGE_<dataId>` (kept verbatim, not
        // normalized) so the class edge toolbar can resolve it. A note↔class attachment edge
        // (`data-id="edgeNote<N>"`) is deliberately NOT selected (it has no relationship type /
        // cardinality, so the toolbar would render empty); it is still double-clickable to edit the
        // connected note's text via the LiveMaidEditor router.
        if (
          currentNode.classList?.contains("relation") ||
          currentNode.classList?.contains("class-relation-hit-target")
        ) {
          const dataId = currentNode.getAttribute("data-id");
          if (dataId && dataId.startsWith("id_")) {
            foundNodeClass = true;
            nodeId = `CLASS_EDGE_${dataId}`;
            break;
          }
        }
        // ER-diagram relationship edges. Mermaid renders each as `path.relationshipLine` with a
        // stable `data-id="id_<srcSvgId>_<dstSvgId>_<N>"` (and we clone a wide transparent
        // `er-relation-hit-target`). Surface it as `ER_EDGE_<dataId>` (kept verbatim, not
        // normalized) so the ER edge toolbar can resolve it via the trailing `_<N>` index.
        if (
          currentNode.classList?.contains("relationshipLine") ||
          currentNode.classList?.contains("er-relation-hit-target")
        ) {
          const dataId = currentNode.getAttribute("data-id");
          if (dataId && dataId.startsWith("id_")) {
            foundNodeClass = true;
            nodeId = `ER_EDGE_${dataId}`;
            break;
          }
        }
        // State-diagram transitions. Mermaid renders each as `path.transition` with a code-order
        // `data-id="edge<N>"` (and we clone a wide transparent `state-transition-hit-target`). Note-
        // edges carry a `note-edge` class and a `<src>-<src>----note-<N>` data-id and are NOT
        // selectable. Surface a real transition as `STATE_EDGE_<dataId>` (kept verbatim) so the state
        // edge toolbar can resolve it via the `edge<N>` index.
        if (
          currentNode.classList?.contains("transition") ||
          currentNode.classList?.contains("state-transition-hit-target")
        ) {
          const dataId = currentNode.getAttribute("data-id");
          if (dataId && /^edge\d+$/.test(dataId) && !currentNode.classList?.contains("note-edge")) {
            foundNodeClass = true;
            nodeId = `STATE_EDGE_${dataId}`;
            break;
          }
        }
        // Sequence diagram elements: actors. Match both the plain `actor` class (rect headers and
        // the Entity/Database/Queue <g class="actor"> groups) AND `actor-man` (the Actor/Boundary/
        // Control stick-figure <g class="actor-man"> groups, which do NOT carry the bare `actor`
        // class). With CSS `pointer-events: bounding-box` on these groups, a click in their interior
        // whitespace lands on the group element itself, so resolving it here makes the whole shape
        // selectable. (`actor-line` lifelines are excluded — classList.contains('actor') is a token
        // match and never matches 'actor-line'.)
        if (
          currentNode.classList?.contains("actor") ||
          currentNode.classList?.contains("actor-man")
        ) {
          foundNodeClass = true;

          const containerEl = containerRef.current;
          if (!containerEl) break;

          const actorDisplayName = getSvgTextDisplayName(currentNode);
          const clickedRect = currentNode.getBoundingClientRect();
          const containerRect = containerEl.getBoundingClientRect();
          const scale = containerRect.width / containerEl.offsetWidth;
          const clickedX =
            (clickedRect.left -
              containerRect.left +
              containerEl.scrollLeft +
              clickedRect.width / 2) /
            scale;

          const lifelines = getSequenceLifelines();
          const nearest = lifelines
            .map((l) => ({ actorId: l.actorId, d: Math.abs(l.x - clickedX) }))
            .sort((a, b) => a.d - b.d)[0];

          // Resolve by actor label first; geometry is only a fallback when label resolution is ambiguous.
          const resolvedByName = actorDisplayName
            ? resolveSequenceActorIdFromDisplayName(actorDisplayName)
            : null;
          const hasResolvedLifeline = Boolean(
            resolvedByName && lifelines.some((lifeline) => lifeline.actorId === resolvedByName),
          );

          // AMBIGUOUS LABEL GUARD: when MULTIPLE participants share the same display label (e.g. two
          // participants both aliased "New Boundary"), label-first resolution always returns the
          // FIRST match — so clicking the right "New Boundary" would wrongly select the left one.
          // In that case geometry (nearest lifeline to the clicked X) is the only reliable signal,
          // so prefer it. Unique labels keep using the robust label-first path.
          const normalizedClickedLabel = normalizeSequenceLabel(actorDisplayName);
          const labelMatchCount = actorDisplayName
            ? getSequenceParticipantEntries().filter(
                (entry) =>
                  normalizeSequenceLabel(entry.alias) === normalizedClickedLabel ||
                  normalizeSequenceLabel(entry.id) === normalizedClickedLabel,
              ).length
            : 0;
          const labelIsAmbiguous = labelMatchCount > 1;

          const actorId =
            labelIsAmbiguous && nearest?.actorId
              ? nearest.actorId
              : hasResolvedLifeline
                ? (resolvedByName as string)
                : nearest?.actorId || resolvedByName || actorDisplayName;
          nodeId = `SEQ_ACTOR_${actorId}`;
          break;
        }
        // Sequence message text
        if (currentNode.classList?.contains("messageText")) {
          foundNodeClass = true;
          const allMsgLines = Array.from(
            containerRef.current?.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ) || [],
          ) as SVGElement[];
          const lineEl = findNearestLineForText(currentNode, allMsgLines);
          const idx = lineEl ? allMsgLines.indexOf(lineEl) : 0;
          nodeId = `SEQ_MSG_${idx >= 0 ? idx : 0}`;
          break;
        }
        // Sequence message line
        if (isSequenceMessageLineElement(currentNode)) {
          foundNodeClass = true;
          const allMsgLines = Array.from(
            containerRef.current?.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ) || [],
          ) as SVGElement[];
          const idx = allMsgLines.indexOf(currentNode);
          nodeId = `SEQ_MSG_${idx}`;
          break;
        }
        // Sequence note text (clicking the label text)
        if (currentNode.classList?.contains("noteText")) {
          foundNodeClass = true;
          const allNotes = Array.from(containerRef.current?.querySelectorAll(".noteText") || []);
          const idx = allNotes.indexOf(currentNode);
          nodeId = `SEQ_NOTE_${idx >= 0 ? idx : 0}`;
          break;
        }
        // Sequence note rect (clicking the yellow background — rect.note)
        if (
          currentNode.tagName?.toLowerCase() === "rect" &&
          currentNode.classList?.contains("note")
        ) {
          foundNodeClass = true;
          // Find the nearest .noteText sibling in the same parent group to resolve the index
          const allNoteRects = Array.from(
            containerRef.current?.querySelectorAll("rect.note") || [],
          );
          const rectIdx = allNoteRects.indexOf(currentNode);
          // .noteText elements are in 1:1 correspondence with rect.note elements
          const allNoteTexts = Array.from(
            containerRef.current?.querySelectorAll(".noteText") || [],
          );
          const idx = rectIdx >= 0 && rectIdx < allNoteTexts.length ? rectIdx : 0;
          // Remap currentNode to the paired .noteText so selection/textBox logic finds the label
          if (allNoteTexts[idx]) {
            currentNode = allNoteTexts[idx] as SVGElement;
          }
          nodeId = `SEQ_NOTE_${idx}`;
          break;
        }
        currentNode = currentNode.parentElement as SVGElement | null;
      }

      if (foundNodeClass && currentNode && containerRef.current) {
        const cleanId = nodeId
          ? nodeId.startsWith("SEQ_") ||
            nodeId.startsWith("CLASS_EDGE_") ||
            nodeId.startsWith("ER_EDGE_") ||
            nodeId.startsWith("STATE_EDGE_")
            ? nodeId
            : normalizeId(nodeId)
          : null;

        // If it's an edge and we clicked the path itself, check if there is an .edgeLabel in the container for this edge.
        // If so, snap the currentNode to that label so that our selection/text boxes align perfectly on the label text.
        if (
          cleanId &&
          isEdgeId(cleanId) &&
          (currentNode.classList?.contains("flowchart-link") ||
            currentNode.classList?.contains("flowchart-link-hit-target"))
        ) {
          const edgeLabels = Array.from(containerRef.current.querySelectorAll(".edgeLabel"));
          const matchingLabel = edgeLabels.find((labelEl) => {
            const dIdEl = labelEl.querySelector("[data-id]");
            const hasText = labelEl.textContent?.trim() !== "";
            return (
              hasText &&
              dIdEl &&
              dIdEl.getAttribute("data-id") &&
              normalizeId(dIdEl.getAttribute("data-id")!) === cleanId
            );
          });
          if (matchingLabel) {
            currentNode = matchingLabel as SVGElement;
          }
        }

        if (
          cleanId &&
          isEdgeId(cleanId) &&
          currentNode.classList?.contains("edgeLabel") &&
          !currentNode.id
        ) {
          currentNode.id = `edge-label-${cleanId}`;
        }

        if (cleanId && cleanId.startsWith("SEQ_ACTOR_") && !currentNode.id) {
          const b = currentNode.getBoundingClientRect();
          const actorKey = cleanId.replace("SEQ_ACTOR_", "").replace(/[^a-zA-Z0-9_]/g, "");
          currentNode.id = `seq-actor-${actorKey}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        if (
          cleanId &&
          (cleanId.startsWith("SEQ_MSG_") || cleanId.startsWith("SEQ_NOTE_")) &&
          !currentNode.id
        ) {
          const seqIdx = cleanId.split("_").pop();
          currentNode.id = `seq-${cleanId.startsWith("SEQ_MSG_") ? "msg" : "note"}-${seqIdx}`;
        }

        let pathElementToMeasure = currentNode;
        if (currentNode.classList?.contains("flowchart-link-hit-target")) {
          const next = currentNode.nextElementSibling;
          const prev = currentNode.previousElementSibling;
          if (
            next &&
            (next.classList?.contains("flowchart-link") || next.classList?.contains("path"))
          ) {
            pathElementToMeasure = next as SVGElement;
          } else if (
            prev &&
            (prev.classList?.contains("flowchart-link") || prev.classList?.contains("path"))
          ) {
            pathElementToMeasure = prev as SVGElement;
          } else if (containerRef.current && cleanId) {
            const paths = Array.from(
              containerRef.current.querySelectorAll(
                "path.flowchart-link:not(.flowchart-link-hit-target)",
              ),
            );
            for (const p of paths) {
              if (p.id && normalizeId(p.id) === cleanId) {
                pathElementToMeasure = p as SVGElement;
                break;
              }
            }
          }
        }

        if (
          cleanId &&
          !currentNode.id &&
          (currentNode.classList?.contains("node") || currentNode.classList?.contains("cluster"))
        ) {
          const b = currentNode.getBoundingClientRect();
          const kind = currentNode.classList?.contains("cluster") ? "cluster" : "node";
          const key = cleanId.replace(/[^a-zA-Z0-9_]/g, "_");
          currentNode.id = `${kind}-${key}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }

        let rawSvgId = currentNode.id;
        let rect = pathElementToMeasure.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;

        let elementToMeasure = pathElementToMeasure;

        // For sequence actors (including the specialised vector shapes), measure the EXACT clicked
        // instance (top header vs bottom footer) — never a broad `rect.actor` query that could resolve
        // to another actor or the other twin.
        if (cleanId && cleanId.startsWith("SEQ_ACTOR_")) {
          const tag = currentNode.tagName.toLowerCase();
          if (
            tag === "g" &&
            (currentNode.classList?.contains("actor") ||
              currentNode.classList?.contains("actor-man"))
          ) {
            // Complex shape: the clicked node IS the per-twin group (Actor/Boundary/Control =
            // g.actor-man, Entity/Database/Queue = g.actor). It has no inner rect.actor, so its own
            // bounding box is the precise clicked-instance box.
            elementToMeasure = currentNode;
            rect = currentNode.getBoundingClientRect();
          } else if (tag === "rect" && currentNode.classList?.contains("actor")) {
            // Standard rect header clicked directly — that rect is the exact twin.
            elementToMeasure = currentNode;
            rect = currentNode.getBoundingClientRect();
          } else {
            // Narrow text label clicked: use the rect.actor in the SAME tight <g> wrapper (scoped to
            // direct siblings so it can't reach into another actor/twin); fall back to the clicked
            // element's own box.
            const siblingRect = currentNode.parentElement?.querySelector(
              ":scope > rect.actor",
            ) as SVGElement | null;
            if (siblingRect) {
              elementToMeasure = siblingRect;
              rect = siblingRect.getBoundingClientRect();
            } else {
              elementToMeasure = currentNode;
              rect = currentNode.getBoundingClientRect();
            }
          }
        } else {
          // For non-actor elements, use the existing logic
          const innerText = currentNode.querySelector(
            ".label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label",
          );
          if (innerText) {
            elementToMeasure = innerText as SVGElement;
          } else if (
            currentNode.tagName === "text" ||
            currentNode.tagName === "foreignObject" ||
            currentNode.classList?.contains("label")
          ) {
            elementToMeasure = currentNode;
          }
        }

        let textRect = elementToMeasure.getBoundingClientRect();

        // For sequence messages, always select text + underlying connection together.
        if (cleanId && cleanId.startsWith("SEQ_MSG_")) {
          const idx = parseInt(cleanId.replace("SEQ_MSG_", ""), 10);
          const allMsgTexts = Array.from(
            containerRef.current.querySelectorAll(".messageText"),
          ) as SVGElement[];
          const allMsgLines = Array.from(
            containerRef.current.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ),
          ) as SVGElement[];

          const pairedText =
            allMsgTexts[idx] ||
            (currentNode.classList?.contains("messageText") ? currentNode : null);
          const pairedLine = pairedText
            ? findNearestLineForText(pairedText as SVGElement, allMsgLines)
            : isSequenceMessageLineElement(currentNode)
              ? currentNode
              : allMsgLines[idx] || null;
          const pairedTextEls = getSequenceTextElsForLine(pairedLine, allMsgTexts, allMsgLines);
          if (pairedTextEls[0] && !pairedTextEls[0].id) pairedTextEls[0].id = `seq-msg-${idx}`;

          const lineRect = pairedLine?.getBoundingClientRect();
          const labelRect = unionClientRects(pairedTextEls) || pairedText?.getBoundingClientRect();
          if (lineRect || labelRect) {
            const left = Math.min(
              lineRect?.left ?? Number.POSITIVE_INFINITY,
              labelRect?.left ?? Number.POSITIVE_INFINITY,
            );
            const top = Math.min(
              lineRect?.top ?? Number.POSITIVE_INFINITY,
              labelRect?.top ?? Number.POSITIVE_INFINITY,
            );
            const right = Math.max(
              lineRect?.right ?? Number.NEGATIVE_INFINITY,
              labelRect?.right ?? Number.NEGATIVE_INFINITY,
            );
            const bottom = Math.max(
              lineRect?.bottom ?? Number.NEGATIVE_INFINITY,
              labelRect?.bottom ?? Number.NEGATIVE_INFINITY,
            );
            rect = {
              left,
              top,
              right,
              bottom,
              width: Math.max(0, right - left),
              height: Math.max(0, bottom - top),
              x: left,
              y: top,
              toJSON: () => ({}),
            } as DOMRect;
            textRect = (labelRect || lineRect)!;
            rawSvgId =
              (pairedTextEls[0] as SVGElement | null)?.id ||
              (pairedText as SVGElement | null)?.id ||
              (pairedLine as SVGElement | null)?.id ||
              rawSvgId;
          }
        }

        // For sequence notes, use the full rect.note box for the selection outline.
        // The foundElement is .noteText (for editing), but visually we want the yellow box bounds.
        if (cleanId && cleanId.startsWith("SEQ_NOTE_")) {
          const idx = parseInt(cleanId.replace("SEQ_NOTE_", ""), 10);
          const allNoteTexts = Array.from(
            containerRef.current.querySelectorAll(".noteText"),
          ) as SVGElement[];
          const noteTextEl =
            allNoteTexts[idx] || (currentNode.classList?.contains("noteText") ? currentNode : null);
          if (noteTextEl) {
            const parentGroup = noteTextEl.parentElement;
            const rectNote = (parentGroup?.querySelector("rect.note") ??
              parentGroup?.parentElement?.querySelector("rect.note")) as SVGElement | null;
            if (rectNote) {
              rect = rectNote.getBoundingClientRect();
              textRect = noteTextEl.getBoundingClientRect();
            }
          }
        }

        // Sequence messages get equal padding so the selection box matches the hover box.
        const msgPadX = cleanId && cleanId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.x : 0;
        const msgPadY = cleanId && cleanId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.y : 0;
        const newSelectionBox = {
          x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale - msgPadX,
          y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale - msgPadY,
          width: rect.width / scale + msgPadX * 2,
          height: rect.height / scale + msgPadY * 2,
        };

        const newTextBox = {
          x: (textRect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
          y: (textRect.top - containerRect.top + containerRef.current.scrollTop) / scale,
          width: textRect.width / scale,
          height: textRect.height / scale,
        };

        return { cleanId, rawSvgId, newSelectionBox, newTextBox };
      }
      return null;
    },
    [
      containerRef,
      normalizeId,
      resolveSequenceActorIdFromDisplayName,
      getSequenceLifelines,
      getSvgTextDisplayName,
      getSequenceParticipantEntries,
      findNearestLineForText,
      getSequenceTextElsForLine,
      normalizeSequenceLabel,
    ],
  );

  const inlineInputRef = useRef<HTMLTextAreaElement>(null);
  // commitEditRef is a ref slot that LiveMaidEditor fills with handleEditSubmit.
  // The hook calls it before any cross-element or background transition so that
  // typed edits are committed to the diagram code before the selection changes.
  const commitEditRef = useRef<(() => void) | null>(null);
  const DOUBLE_CLICK_MS = 300;
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  // Set to true when click(detail=2) already handled the dblclick gesture so the capture-phase
  // native dblclick listener knows to skip — prevents double-invocation of handleEditClick.
  const dblClickHandledRef = useRef(false);
  // requestAnimationFrame handle for throttling mousemove
  const mouseMoveRafRef = useRef<number | null>(null);
  const mouseMoveInnerRef = useRef<
    ((x: number, y: number, t: EventTarget | null, r: DOMRect | null) => void) | null
  >(null);

  const handleEditClick = useCallback(
    (e: React.MouseEvent | Event) => {
      if ("stopPropagation" in e) e.stopPropagation();

      const currentType = determineDiagramType(code);
      if (!(currentType === "graph" || currentType === "flowchart" || currentType === "sequence")) {
        return;
      }

      // Double-clicking a `rect` highlight's colored background opens the recolor popover (highlights
      // carry only a color, no text label). Detected here — NOT in EditorCanvas's React onDoubleClick
      // — because react-zoom-pan-pinch swallows the synthetic dblclick on SVG rects; this path is
      // reached via the document-level capture dblclick listener that also drives label/message edit.
      if (
        currentType === "sequence" &&
        "clientX" in e &&
        "clientY" in e &&
        openHighlightRecolorRef.current
      ) {
        const hl = resolveSequenceHighlightTarget(e.clientX, e.clientY);
        if (hl) {
          if (isInlineEditing) {
            commitEditRef.current?.();
            setIsInlineEditing(false);
          }
          openHighlightRecolorRef.current(hl.lineIndex, hl.color, e.clientX, e.clientY);
          return;
        }
      }

      // Resolve actual SVG element via elementsFromPoint to bypass overlay divs.
      // EXCEPTION: when invoked from a floating toolbar (e.g. the Rename button), the cursor is
      // over the toolbar — NOT the diagram element — so elementsFromPoint would resolve to whatever
      // SVG sits behind the toolbar (e.g. an actor header) and edit the WRONG element. In that case
      // we keep the currently-selected node and its existing selection/text boxes.
      const fromToolbar = Boolean(
        (e.target as Element | null)?.closest?.("[data-inline-toolbar], [data-scale-lock]"),
      );
      let targetElement = e.target as Element;
      if (!fromToolbar && "clientX" in e && "clientY" in e) {
        const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
        const svgElement = elementsAtPoint.find(
          (el) =>
            el.tagName.toLowerCase() !== "div" && el.namespaceURI === "http://www.w3.org/2000/svg",
        );
        if (svgElement) {
          targetElement = svgElement;
        } else {
          const firstEl = elementsAtPoint[0];
          if (firstEl) targetElement = firstEl;
        }
      }

      // Logic-block / highlight label rename: double-clicking a block's label box (`.loopText` for
      // the opener label like `loop Retry`, `.sectionTitle` for an `else`/`and`/`option` divider)
      // enters inline edit on that label and rewrites ONLY the label portion of the source line.
      // Handled before the generic node resolver so it never falls through to flowchart-node logic.
      const blockTarget = fromToolbar ? null : resolveSequenceBlockLabelTarget(targetElement);
      if (blockTarget) {
        const container = containerRef.current;
        const labelEl = targetElement.closest?.(".loopText, .sectionTitle") as SVGElement | null;
        if (!container || !labelEl) return;
        const blockNodeId = `SEQ_BLK_${blockTarget.lineIndex}`;

        if (isInlineEditing) {
          if (blockNodeId === selectedNodeIdRef.current) return; // already editing this label
          commitEditRef.current?.();
          setIsInlineEditing(false);
        }

        const r = labelEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scale = containerRect.width / container.offsetWidth;
        const padX = 8;
        const padY = 4;
        setSelectionBox({
          x: (r.left - containerRect.left + container.scrollLeft) / scale - padX,
          y: (r.top - containerRect.top + container.scrollTop) / scale - padY,
          width: r.width / scale + padX * 2,
          height: r.height / scale + padY * 2,
        });
        setTextBox({
          x: (r.left - containerRect.left + container.scrollLeft) / scale,
          y: (r.top - containerRect.top + container.scrollTop) / scale,
          width: r.width / scale,
          height: r.height / scale,
        });
        setSelectedNodeIdWithRef(blockNodeId);
        setSelectedSvgId(null);

        const lineStr = code.split("\n")[blockTarget.lineIndex] || "";
        const labelMatch = lineStr
          .trim()
          .match(/^(?:loop|alt|opt|par|critical|break|else|and|option)\b[ \t]*(.*)$/i);
        setEditingText(labelMatch ? labelMatch[1].trim() : "");
        setIsInlineEditing(true);
        setTimeout(() => {
          if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
          }
        }, 10);
        return;
      }

      const result = fromToolbar ? null : getClickedNode(targetElement);
      // Use ref for selectedNodeId to avoid stale closure
      let targetNodeId = selectedNodeIdRef.current;

      // STATE MACHINE: handle EDIT_MODE → EDIT_MODE transitions (cross-element or empty-space double-click)
      if (isInlineEditing) {
        if (!result) {
          // Double-click on empty space while editing → commit and go to IDLE
          commitEditRef.current?.();
          setIsInlineEditing(false);
          return;
        }
        if (result.cleanId === selectedNodeIdRef.current) {
          return; // Same element — already in EDIT_MODE, no-op
        }
        // Cross-element double-click → commit current edit, then enter EDIT_MODE for new element
        commitEditRef.current?.();
        setIsInlineEditing(false);
      }

      if (result) {
        setSelectionBox(result.newSelectionBox);
        setTextBox(result.newTextBox);
        setSelectedNodeIdWithRef(result.cleanId);
        setSelectedSvgId(result.rawSvgId);
        targetNodeId = result.cleanId;
      }

      if (!targetNodeId) return;

      let currentText = targetNodeId;

      if (targetNodeId.startsWith("SEQ_ACTOR_")) {
        // Read the current display label from the actor declaration
        const actorId = targetNodeId.replace("SEQ_ACTOR_", "");
        const lines = code.split("\n");
        let foundLabel = actorId;
        for (const line of lines) {
          const trimmed = line.trim();
          const match = trimmed.match(
            /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i,
          );
          if (match) {
            const id = match[1];
            const alias = match[2];
            if (id === actorId) {
              foundLabel = alias?.trim() || id;
              break;
            }
          }
        }
        currentText = foundLabel;
      } else if (targetNodeId.startsWith("SEQ_MSG_")) {
        const idx = parseInt(targetNodeId.replace("SEQ_MSG_", ""), 10);
        const msgLines = getSequenceMessageEntries(code).map((entry) => entry.line);
        if (msgLines[idx]) {
          const colonIdx = msgLines[idx].indexOf(":");
          currentText =
            colonIdx !== -1
              ? msgLines[idx]
                  .substring(colonIdx + 1)
                  .trim()
                  .replace(/<br\s*\/?>/gi, "\n")
              : "";
        }
      } else if (targetNodeId.startsWith("SEQ_NOTE_")) {
        const idx = parseInt(targetNodeId.replace("SEQ_NOTE_", ""), 10);
        const noteLines = code.split("\n").filter((l) => {
          const t = l.trim();
          return t.startsWith("Note ") || t.startsWith("note ");
        });
        if (noteLines[idx]) {
          const colonIdx = noteLines[idx].indexOf(":");
          currentText = colonIdx !== -1 ? noteLines[idx].substring(colonIdx + 1).trim() : "";
        }
      } else if (targetNodeId.startsWith("SEQ_")) {
        currentText = targetNodeId.replace("SEQ_", "");
        currentText = currentText.replace(/<br\/>/g, "\n");
      } else if (isEdgeId(targetNodeId)) {
        const { src, dst, occurrenceIndex } = parseEdgeId(targetNodeId);
        if (src && dst) {
          const lines = code.split("\n");
          let currentOccurrence = 0;
          for (const line of lines) {
            const trimmed = line.trim();
            if (
              !trimmed ||
              trimmed.startsWith("%%") ||
              trimmed.startsWith("subgraph") ||
              trimmed.startsWith("end")
            ) {
              continue;
            }
            const linkLineRegex = new RegExp(
              `(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`,
              "i",
            );
            const match = line.match(linkLineRegex);
            if (match) {
              if (currentOccurrence === occurrenceIndex) {
                const middlePart = match[2];
                const barMatch = middlePart.match(/\|([^|]*)\|/);
                const quoteMatch = middlePart.match(/"([^"]*)"/);
                if (quoteMatch) {
                  currentText = quoteMatch[1];
                } else if (barMatch) {
                  currentText = barMatch[1];
                } else {
                  currentText = "";
                }
                break;
              }
              currentOccurrence++;
            }
          }
        }
      } else {
        const nodeRegex = new RegExp(
          `(^|[^a-zA-Z0-9_])(${targetNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
          "m",
        );
        const match = code.match(nodeRegex);
        if (match && match[3]) {
          currentText = match[3];
        } else {
          const innerText = result?.rawSvgId
            ? document.querySelector(
                `#${result.rawSvgId} .label, #${result.rawSvgId} text, #${result.rawSvgId} foreignObject, #${result.rawSvgId} .nodeLabel`,
              )
            : null;
          if (innerText && innerText.textContent) {
            currentText = innerText.textContent.trim();
          }
        }
      }

      setEditingText(currentText);
      setIsInlineEditing(true);
      setTimeout(() => {
        if (inlineInputRef.current) {
          inlineInputRef.current.focus();
          inlineInputRef.current.select();
        }
      }, 10);
    },
    [
      code,
      getClickedNode,
      setSelectedNodeIdWithRef,
      determineDiagramType,
      getSequenceMessageEntries,
      isInlineEditing,
      resolveSequenceBlockLabelTarget,
      resolveSequenceHighlightTarget,
    ],
  );

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const debugClicks = (() => {
        if (typeof window === "undefined") return false;
        const w = window as Window & { __LM_DEBUG_CLICKS?: boolean };
        return (
          Boolean(w.__LM_DEBUG_CLICKS) ||
          window.localStorage.getItem("livemaid:debug-clicks") === "1"
        );
      })();

      const debugLog = (...args: unknown[]) => {
        if (debugClicks) console.log("[canvas-click]", ...args);
      };

      if (isLocked) return;

      const target = e.target as HTMLElement;
      if (
        target.closest("[data-scale-lock]") ||
        target.closest("[data-scale-lock-border]") ||
        target.closest("[data-inline-toolbar]")
      ) {
        debugLog("ignored-ui-target", target.tagName);
        return;
      }

      const clicked = getClickedNode(target);
      debugLog("target", target.tagName, {
        id: target.id,
        clicked: clicked?.cleanId ?? null,
        inlineEditing: isInlineEditing,
      });

      // Robust double-click entry: some Mermaid SVG/foreignObject targets do not
      // consistently dispatch React onDoubleClick. Use click count from the shared
      // handler so double-click on the currently selected element always enters edit mode.
      if (
        e.detail >= 2 &&
        clicked &&
        clicked.cleanId === selectedNodeIdRef.current &&
        !isInlineEditing
      ) {
        debugLog("enter-edit-mode-double-click", clicked.cleanId);
        handleEditClick(e);
        return;
      }

      // State transition rule:
      // - Same element while editing: keep editing.
      // - Different element/background while editing: commit current edit, then continue selection flow.
      if (isInlineEditing) {
        if (clicked && clicked.cleanId === selectedNodeIdRef.current) {
          debugLog("stay-in-edit-mode", clicked.cleanId);
          return;
        }
        debugLog("commit-edit-before-transition", {
          from: selectedNodeIdRef.current,
          to: clicked?.cleanId ?? null,
        });
        commitEditRef.current?.();
        setIsInlineEditing(false);
      }

      if (clicked) {
        debugLog("select", clicked.cleanId);
        setSelectedNodeIdWithRef(clicked.cleanId);
        setSelectedSvgId(clicked.rawSvgId);
        setSelectionBox(clicked.newSelectionBox);
        setTextBox(clicked.newTextBox);
      } else {
        // Message band fallback: clicking the empty connection area (between the line
        // and label) selects the message, mirroring how clicking the yellow note area
        // selects the note. Reuses getClickedNode on the band's messageText so the
        // selection box/text box are computed identically to a direct line/text click.
        const container = containerRef.current;
        if (container && determineDiagramType(code) === "sequence") {
          const containerRect = container.getBoundingClientRect();
          const scale = containerRect.width / container.offsetWidth;
          const canvasX = (e.clientX - containerRect.left + container.scrollLeft) / scale;
          const canvasY = (e.clientY - containerRect.top + container.scrollTop) / scale;
          const band = findSequenceMessageBandAtPoint(canvasX, canvasY);
          if (band) {
            const bandClicked = getClickedNode(band.el);
            if (bandClicked) {
              debugLog("select-band", bandClicked.cleanId);
              setSelectedNodeIdWithRef(bandClicked.cleanId);
              setSelectedSvgId(bandClicked.rawSvgId);
              setSelectionBox(bandClicked.newSelectionBox);
              setTextBox(bandClicked.newTextBox);
              return;
            }
          }
        }
        debugLog("clear-selection");
        setSelectedNodeIdWithRef(null);
        setSelectedSvgId(null);
        setSelectionBox(null);
        setTextBox(null);
      }
    },
    [
      getClickedNode,
      isLocked,
      isInlineEditing,
      setSelectedNodeIdWithRef,
      setIsInlineEditing,
      handleEditClick,
      code,
      containerRef,
      determineDiagramType,
      findSequenceMessageBandAtPoint,
    ],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Throttle to one execution per animation frame — prevents expensive DOM work
    // (getBoundingClientRect, SVG traversal, lifeline calculations) from running on
    // every pixel of mouse movement.
    if (mouseMoveRafRef.current !== null) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const eventTarget = e.target;
    // Capture the container rect SYNCHRONOUSLY at event time so that the RAF
    // callback uses a rect that is consistent with the clientX/clientY values.
    // If we defer getBoundingClientRect() to RAF time, a CSS animation or
    // velocity-based pan that runs between the event and the RAF can shift the
    // container, producing a systematic offset in the computed canvas position.
    const containerRect = containerRef.current?.getBoundingClientRect() ?? null;
    mouseMoveRafRef.current = requestAnimationFrame(() => {
      mouseMoveRafRef.current = null;
      mouseMoveInnerRef.current?.(clientX, clientY, eventTarget, containerRect);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const _handleMouseMoveInner = useCallback(
    (
      clientX: number,
      clientY: number,
      eventTarget: EventTarget | null,
      capturedContainerRect: DOMRect | null,
    ) => {
      const container = containerRef.current;
      if (!container) return;
      // Use the rect captured synchronously at event time. Falling back to a fresh
      // getBoundingClientRect() only when no pre-captured rect is provided (e.g.,
      // callers that don't go through the RAF throttle path).
      const containerRectForScale = capturedContainerRect ?? container.getBoundingClientRect();
      const scale = containerRectForScale.width / container.offsetWidth;
      const diagramType = determineDiagramType(code);
      const e = { clientX, clientY, target: eventTarget } as React.MouseEvent<HTMLDivElement>;

      const mouseX = (e.clientX - containerRectForScale.left + container.scrollLeft) / scale;
      const mouseY = (e.clientY - containerRectForScale.top + container.scrollTop) / scale;

      if (diagramType === "sequence") {
        // Floating-UI guard (mirror of handleSequenceHoverOver): the mousemove path
        // also drives sequence hover, and unlike onMouseOver it keeps firing while the
        // cursor sits over the inline toolbar. Without this, moving onto the style bar
        // hit-tests the message band BEHIND it and renders that message's hover overlay
        // (the "back connection" accidentally highlighting). Bail and clear hover when
        // the pointer is over any floating UI so the toolbar stays clean.
        const overFloatingUi =
          typeof document !== "undefined" && document.elementsFromPoint
            ? document
                .elementsFromPoint(e.clientX, e.clientY)
                .some(
                  (el) =>
                    el.closest?.("[data-inline-toolbar]") ||
                    el.closest?.("[data-scale-lock]") ||
                    el.closest?.("[data-scale-lock-border]"),
                )
            : false;
        if (overFloatingUi) {
          setHoveredSequenceActorBox(null);
          setHoveredSequenceNoteBox(null);
          setHoveredFlowchartNodeBox(null);
          clearSequenceMessageHoverHighlight();
          return;
        }
        // Actor header hover — COORDINATE hit-test (not e.target.closest). The participant grab
        // overlay (seq-actor-reorder-handle, pointer-events:auto) covers the header, so e.target
        // becomes that div and a closest('.actor') lookup would miss → the hover box would flicker
        // off and unmount the overlay. Hit-testing the header element bounds by viewport coordinates
        // keeps the box stable under the overlay (same technique as note hover). Candidates: rect.actor
        // (plain participant + bottom footers), g.actor (Entity/Database/Queue), g.actor-man
        // (Actor/Boundary/Control). The smallest containing box wins so a parent group never shadows
        // a more specific child.
        const actorCandidates = Array.from(
          container.querySelectorAll("rect.actor, g.actor, g.actor-man"),
        ) as SVGElement[];
        let boundsEl: SVGElement | null = null;
        let bestArea = Number.POSITIVE_INFINITY;
        for (const cand of actorCandidates) {
          const r = cand.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          ) {
            const area = r.width * r.height;
            if (area < bestArea) {
              bestArea = area;
              boundsEl = cand;
            }
          }
        }

        if (boundsEl) {
          const actorRect = boundsEl.getBoundingClientRect();
          setHoveredSequenceActorBox({
            x: (actorRect.left - containerRectForScale.left + container.scrollLeft) / scale,
            y: (actorRect.top - containerRectForScale.top + container.scrollTop) / scale,
            width: actorRect.width / scale,
            height: actorRect.height / scale,
          });
        } else {
          setHoveredSequenceActorBox(null);
        }
        // Note hover detection: use rect.note for full-box bounds
        const noteRectEl = (e.target as Element | null)?.closest("rect.note") as SVGElement | null;
        const noteTextEl = (e.target as Element | null)?.closest(".noteText") as SVGElement | null;
        let noteBoxEl: SVGElement | null = noteRectEl;
        if (!noteBoxEl && noteTextEl) {
          noteBoxEl =
            (noteTextEl.parentElement?.querySelector("rect.note") as SVGElement | null) ??
            (noteTextEl.parentElement?.parentElement?.querySelector(
              "rect.note",
            ) as SVGElement | null);
        }
        // Coordinate fallback: when the cursor is over the note's reorder grab overlay (or any
        // non-note element), e.target is no longer the note, so the closest() lookups above miss.
        // Hit-test rect.note boxes by viewport coordinates so the note hover (and its grab overlay)
        // stays stable instead of flickering on/off as the overlay covers the note.
        if (!noteBoxEl) {
          const noteRects = Array.from(container.querySelectorAll("rect.note")) as SVGElement[];
          for (const rn of noteRects) {
            const r = rn.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              noteBoxEl = rn;
              break;
            }
          }
        }
        if (noteBoxEl) {
          const noteRect = noteBoxEl.getBoundingClientRect();
          setHoveredSequenceNoteBox({
            x: (noteRect.left - containerRectForScale.left + container.scrollLeft) / scale,
            y: (noteRect.top - containerRectForScale.top + container.scrollTop) / scale,
            width: noteRect.width / scale,
            height: noteRect.height / scale,
          });
        } else {
          setHoveredSequenceNoteBox(null);
        }
        setHoveredFlowchartNodeBox(null);
        // Message hover: prefer the exact SVG line/text target. When the cursor is
        // anywhere else inside a message's band (the empty connection area), fall back
        // to that band's messageText so the entire connection is hoverable — the same
        // full-area behavior notes get via rect.note. The trigger overlay stays
        // pointer-events:none, so header/footer clicks are never swallowed.
        const directMsgTarget = (e.target as Element | null)?.closest(
          '.messageText, [class^="messageLine"], [class*=" messageLine"]',
        );
        if (directMsgTarget) {
          updateSequenceMessageHoverHighlight(e.target);
        } else {
          const band = findSequenceMessageBandAtPoint(mouseX, mouseY);
          if (band) {
            updateSequenceMessageHoverHighlight(band.el);
          } else {
            updateSequenceMessageHoverHighlight(e.target);
          }
        }
      } else if (diagramType === "flowchart" || diagramType === "graph") {
        setHoveredSequenceActorBox(null);
        setHoveredSequenceNoteBox(null);
        clearSequenceMessageHoverHighlight();
        // Show hover highlight on flowchart nodes.
        // Fallback: tiny rendered nodes can miss direct target resolution and surface as svg/container.
        let nodeTarget = (e.target as Element | null)?.closest(".node") as SVGElement | null;
        if (!nodeTarget) {
          const candidates = Array.from(
            container.querySelectorAll(".node"),
          ) as SVGGraphicsElement[];
          const pad = 8;
          let best: { el: SVGGraphicsElement; area: number } | null = null;
          for (const el of candidates) {
            const r = el.getBoundingClientRect();
            const inside =
              clientX >= r.left - pad &&
              clientX <= r.right + pad &&
              clientY >= r.top - pad &&
              clientY <= r.bottom + pad;
            if (!inside) continue;
            const area = Math.max(1, r.width * r.height);
            if (!best || area < best.area) {
              best = { el, area };
            }
          }
          nodeTarget = best ? (best.el as SVGElement) : null;
        }

        if (nodeTarget && !isInlineEditing) {
          const nodeRect = nodeTarget.getBoundingClientRect();
          const hoverBox = {
            x: (nodeRect.left - containerRectForScale.left + container.scrollLeft) / scale,
            y: (nodeRect.top - containerRectForScale.top + container.scrollTop) / scale,
            width: nodeRect.width / scale,
            height: nodeRect.height / scale,
          };
          setHoveredFlowchartNodeBox(hoverBox);
        } else {
          setHoveredFlowchartNodeBox(null);
        }
      } else {
        setHoveredSequenceActorBox(null);
        setHoveredSequenceNoteBox(null);
        setHoveredFlowchartNodeBox(null);
        clearSequenceMessageHoverHighlight();
      }

      if (diagramType === "sequence") {
        const lifelines = getSequenceLifelines();

        if (connectionState.active && connectionState.startNodeId?.startsWith("SEQ_ACTOR_")) {
          const sourceActorId = connectionState.startNodeId.replace("SEQ_ACTOR_", "");
          const sourceLifeline = lifelines.find((l) => l.actorId === sourceActorId);
          if (!sourceLifeline) return;

          const sourceSlots = getSequenceAnchorSlots(sourceLifeline);
          const anchorY = connectionState.anchorY ?? findNearestSlot(sourceSlots, mouseY);
          const snappedAnchorY = findNearestSlot(sourceSlots, anchorY);

          const snapThreshold = 28 / scale;
          let snapTargetId: string | null = null;
          let snapTargetPos: { x: number; y: number } | null = null;
          for (const lifeline of lifelines) {
            if (Math.abs(lifeline.x - mouseX) <= snapThreshold) {
              snapTargetId = `SEQ_ACTOR_${lifeline.actorId}`;
              snapTargetPos = { x: lifeline.x, y: snappedAnchorY };
              break;
            }
          }

          setConnectionState((prev) => ({
            ...prev,
            isDragging: true,
            mousePos: {
              x: snapTargetPos?.x ?? mouseX,
              y: snappedAnchorY,
            },
            anchorY: snappedAnchorY,
            snapTargetId,
            snapTargetPos,
          }));
          setSequenceLifelineOverlay(null);
          return;
        }

        // Compute adaptive threshold based on lifeline spacing to prevent false triggers
        // on dense diagrams (many participants). With 16+ participants zoomed out,
        // a fixed 44px threshold matches almost everywhere — so we cap at 45% of spacing.
        const sortedByX = [...lifelines].sort((a, b) => a.x - b.x);
        const minSpacing =
          sortedByX.length > 1
            ? Math.min(...sortedByX.slice(1).map((l, i) => l.x - sortedByX[i].x))
            : Infinity;
        const hoverThreshold = Number.isFinite(minSpacing) ? Math.min(44, minSpacing * 0.45) : 44;

        // Find the nearest lifeline (not just the first within threshold)
        const nearestLifeline = lifelines.reduce<{ l: (typeof lifelines)[0] | null; dist: number }>(
          (best, l) => {
            if (mouseY < l.y1 - 8 || mouseY > l.y2 + 30) return best;
            const dist = Math.abs(l.x - mouseX);
            return dist < best.dist ? { l, dist } : best;
          },
          { l: null, dist: hoverThreshold },
        ).l;
        if (nearestLifeline) {
          // Keep the participant HEADER itself freely clickable: when the cursor is directly over a
          // participant shape (the rect, the Actor/Boundary/Control `g.actor-man` stick figures, the
          // Entity/Database/Queue `g.actor` groups, or the label text), suppress the lifeline `+`
          // overlay. Otherwise the topmost `+` button (which can overlap the header box) sits on top
          // of these narrow `fill:none` shapes and steals the click meant to SELECT the participant.
          const overActorHeader = Array.from(
            container.querySelectorAll("rect.actor, g.actor, g.actor-man, text.actor"),
          ).some((el) => {
            const r = (el as Element).getBoundingClientRect();
            return (
              clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
            );
          });
          if (overActorHeader) {
            setSequenceLifelineOverlay(null);
          } else {
            setSequenceLifelineOverlay({
              actorId: nearestLifeline.actorId,
              x: nearestLifeline.x,
              slots: getSequenceAnchorSlots(nearestLifeline, mouseY),
            });
          }
        } else if (!connectionState.active) {
          setSequenceLifelineOverlay(null);
        }
      } else {
        setSequenceLifelineOverlay(null);
        setHoveredSequenceActorBox(null);
        setHoveredSequenceNoteBox(null);
      }

      if (connectionState.active && connectionState.startNodeId) {
        setConnectionState((prev) => ({
          ...prev,
          isDragging: true,
          mousePos: {
            x: mouseX,
            y: mouseY,
          },
        }));
      }
    },
    [
      connectionState.active,
      connectionState.startNodeId,
      connectionState.anchorY,
      containerRef,
      code,
      determineDiagramType,
      findNearestSlot,
      getSequenceAnchorSlots,
      getSequenceLifelines,
      selectedNodeId,
      getSelectedMessageOverlay,
      updateSequenceMessageHoverHighlight,
      clearSequenceMessageHoverHighlight,
    ],
  );
  // Keep mouseMoveInnerRef always pointing at the latest version (avoids stale closure in RAF)
  mouseMoveInnerRef.current = _handleMouseMoveInner;

  const handleAddNodeFromSelected = useCallback(
    (
      startId: string | null,
      targetNodeId?: string,
      shape?: ShapeOption,
      sequenceInsertIndex?: number,
    ) => {
      if (!startId) return;

      const diagramType = determineDiagramType(code);
      let newCode = code;

      const getNextNodeId = (codeStr: string, prefix: string = "n"): string => {
        let i = 1;
        while (new RegExp(`(^|[^a-zA-Z0-9_])${prefix}${i}([^a-zA-Z0-9_]|$)`, "m").test(codeStr))
          i++;
        return `${prefix}${i}`;
      };

      if (diagramType === "flowchart" || diagramType === "graph") {
        if (targetNodeId && targetNodeId !== startId) {
          newCode += `\n    ${startId} --> ${targetNodeId}`;
        } else {
          const prefix = startId.match(/^([a-zA-Z]+)/)?.[1] || "n";
          const newNodeId = getNextNodeId(code, prefix);
          const label = "New Node";
          let nodeDef = "";
          if (shape) {
            if (shape.isText) {
              nodeDef = `${newNodeId}["Text Block"]\n    ${newNodeId}@{ shape: text }`;
            } else if (shape.expanded) {
              nodeDef = `${newNodeId}@{ shape: ${shape.expanded}, label: "${label}" }`;
            } else if (shape.b) {
              const brackets = shape.b as [string, string];
              nodeDef = `${newNodeId}${brackets[0]}${label}${brackets[1]}`;
            } else {
              nodeDef = `${newNodeId}[${label}]`;
            }
          } else {
            nodeDef = `${newNodeId}[${label}]`;
          }

          if (shape && (shape.expanded || shape.isText)) {
            newCode += `\n    ${nodeDef}\n    ${startId} --> ${newNodeId}`;
          } else {
            newCode += `\n    ${startId} --> ${nodeDef}`;
          }
        }
      } else if (diagramType === "sequence") {
        const actor = startId.replace("SEQ_ACTOR_", "");
        if (targetNodeId && targetNodeId !== startId && targetNodeId.startsWith("SEQ_ACTOR_")) {
          const targetActor = targetNodeId.replace("SEQ_ACTOR_", "");
          const messageLine = `${actor}->>${targetActor}: new msg`;
          if (
            typeof sequenceInsertIndex === "number" &&
            Number.isFinite(sequenceInsertIndex) &&
            sequenceInsertIndex >= 0
          ) {
            newCode = insertSequenceMessageAtIndex(newCode, messageLine, sequenceInsertIndex);
          } else {
            newCode += `\n    ${messageLine}`;
          }
        } else if (targetNodeId && targetNodeId === startId) {
          const selfLoopLine = `${actor}->>${actor}: new msg`;
          if (
            typeof sequenceInsertIndex === "number" &&
            Number.isFinite(sequenceInsertIndex) &&
            sequenceInsertIndex >= 0
          ) {
            newCode = insertSequenceMessageAtIndex(newCode, selfLoopLine, sequenceInsertIndex);
          } else {
            newCode += `\n    ${selfLoopLine}`;
          }
        } else {
          newCode += `\n    ${actor}->>NewActor: new msg`;
        }
      }

      handleCodeChange(newCode);
    },
    [code, handleCodeChange, determineDiagramType, insertSequenceMessageAtIndex],
  );

  const startSequenceConnection = useCallback(
    (actorId: string, anchorY: number) => {
      const lifeline = getSequenceLifelines().find((l) => l.actorId === actorId);
      setConnectionState({
        active: true,
        startNodeId: `SEQ_ACTOR_${actorId}`,
        startPos: lifeline ? { x: lifeline.x, y: anchorY } : null,
        mousePos: { x: 0, y: anchorY },
        isDragging: false,
        snapTargetId: null,
        snapTargetPos: null,
        anchorY,
      });
    },
    [getSequenceLifelines],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      clearSequenceMessageHoverHighlight();
      setHoveredFlowchartNodeBox(null);
      if (connectionState.active && connectionState.startNodeId) {
        const diagramType = determineDiagramType(code);
        if (connectionState.isDragging) {
          if (diagramType === "sequence" && connectionState.startNodeId.startsWith("SEQ_ACTOR_")) {
            const targetId = connectionState.snapTargetId;
            if (targetId) {
              const insertIndex =
                connectionState.anchorY !== null
                  ? getSequenceInsertIndexForAnchor(connectionState.anchorY)
                  : undefined;
              handleAddNodeFromSelected(
                connectionState.startNodeId,
                targetId,
                undefined,
                insertIndex,
              );
            }
          } else {
            const result = getClickedNode(e.target as Element);
            if (result && result.cleanId && result.cleanId !== connectionState.startNodeId) {
              handleAddNodeFromSelected(connectionState.startNodeId, result.cleanId);
            } else if (!result) {
              // Dropped on empty space - trigger the shape selector
              if (diagramType === "flowchart" || diagramType === "graph") {
                if (containerRef.current) {
                  const viewport = containerRef.current.closest(".relative.overflow-hidden");
                  const rect = viewport
                    ? viewport.getBoundingClientRect()
                    : containerRef.current.getBoundingClientRect();
                  setShapePicker({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    startNodeId: connectionState.startNodeId,
                  });
                }
              }
            }
          }
        }
        setConnectionState({
          active: false,
          startNodeId: null,
          startPos: null,
          mousePos: null,
          isDragging: false,
          snapTargetId: null,
          snapTargetPos: null,
          anchorY: null,
        });
      }
      setSequenceLifelineOverlay(null);
    },
    [
      connectionState,
      getClickedNode,
      handleAddNodeFromSelected,
      code,
      determineDiagramType,
      containerRef,
      getSequenceInsertIndexForAnchor,
      clearSequenceMessageHoverHighlight,
    ],
  );

  useEffect(() => {
    return () => {
      clearSequenceMessageHoverHighlight();
      setHoveredSequenceActorBox(null);
      setHoveredSequenceNoteBox(null);
    };
  }, [clearSequenceMessageHoverHighlight]);

  // Synchronized hover highlighting for edge paths and their labels
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const getCanonicalEdgeId = (el: HTMLElement | SVGElement | null): string | null => {
      if (!el) return null;

      // 1. If it has class edgeLabel or is inside one, find the data-id
      const labelEl = el.closest(".edgeLabel");
      if (labelEl) {
        const dataIdEl = labelEl.querySelector("[data-id]");
        if (dataIdEl) {
          const rawId = dataIdEl.getAttribute("data-id");
          if (rawId) return normalizeId(rawId);
        }
      }

      // 2. If it's a path or flowchart-link or hit target
      let current: SVGElement | null = el as SVGElement;
      while (current && current.tagName !== "svg") {
        if (current.id) {
          const cleanId = normalizeId(current.id);
          if (isEdgeId(cleanId)) {
            return cleanId;
          }
        }
        current = current.parentElement as SVGElement | null;
      }
      return null;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const canonicalEdgeId = getCanonicalEdgeId(target);

      if (canonicalEdgeId) {
        // Clear any existing hover highlights first to prevent stale highlights
        container.querySelectorAll(".edge-hover-highlight").forEach((el) => {
          el.classList.remove("edge-hover-highlight");
        });

        // Highlight matched visible paths
        const allPaths = container.querySelectorAll("path.flowchart-link, path.path");
        allPaths.forEach((path: Element) => {
          if (
            path.id &&
            normalizeId(path.id) === canonicalEdgeId &&
            !path.classList.contains("flowchart-link-hit-target")
          ) {
            path.classList.add("edge-hover-highlight");
          }
        });

        // Highlight matched labels
        const allLabels = container.querySelectorAll(".edgeLabel");
        allLabels.forEach((label: Element) => {
          const dataIdEl = label.querySelector("[data-id]");
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute("data-id");
            if (rawId && normalizeId(rawId) === canonicalEdgeId) {
              label.classList.add("edge-hover-highlight");
            }
          }
        });
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const relatedTarget = e.relatedTarget as HTMLElement;

      const currentCanonicalId = getCanonicalEdgeId(target);
      const relatedCanonicalId = getCanonicalEdgeId(relatedTarget);

      // If we are moving within the same edge, don't clear highlights
      if (currentCanonicalId && currentCanonicalId === relatedCanonicalId) {
        return;
      }

      // Otherwise, clear highlights
      container.querySelectorAll(".edge-hover-highlight").forEach((el) => {
        el.classList.remove("edge-hover-highlight");
      });

      // If we moved to another edge, highlight it
      if (relatedCanonicalId) {
        const allPaths = container.querySelectorAll("path.flowchart-link, path.path");
        allPaths.forEach((path: Element) => {
          if (
            path.id &&
            normalizeId(path.id) === relatedCanonicalId &&
            !path.classList.contains("flowchart-link-hit-target")
          ) {
            path.classList.add("edge-hover-highlight");
          }
        });

        const allLabels = container.querySelectorAll(".edgeLabel");
        allLabels.forEach((label: Element) => {
          const dataIdEl = label.querySelector("[data-id]");
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute("data-id");
            if (rawId && normalizeId(rawId) === relatedCanonicalId) {
              label.classList.add("edge-hover-highlight");
            }
          }
        });
      }
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
    };
  }, [containerRef, svgContent, normalizeId]);

  // Capture-phase native dblclick listener: fires BEFORE any child element handlers,
  // bypassing toolbar buttons that call e.stopPropagation() on 'click' (not 'dblclick').
  // This ensures double-clicking when the toolbar overlaps the node still enters EDIT_MODE.
  // handleEditClick is idempotent — if already in EDIT_MODE for the same node, it no-ops.
  const handleEditClickRef = useRef(handleEditClick);
  handleEditClickRef.current = handleEditClick; // always current; updated every render

  useEffect(() => {
    if (isLocked) return;

    const handleNativeDblClick = (e: MouseEvent) => {
      // Only handle dblclicks within the canvas container (not toolbar overlays outside it, etc.)
      const container = containerRef.current;
      if (!container || !container.contains(e.target as Node)) return;

      // If click(detail=2) already handled this dblclick gesture, skip to avoid double-invocation.
      // (The capture listener fires AFTER click(detail=2) has already entered EDIT_MODE.)
      if (dblClickHandledRef.current) {
        dblClickHandledRef.current = false;
        return;
      }
      handleEditClickRef.current(e as unknown as React.MouseEvent);
    };

    // Register on document (capture phase) — above react-zoom-pan-pinch's TransformWrapper which
    // intercepts dblclick at its own capture listener (even when doubleClick.disabled=true).
    document.addEventListener("dblclick", handleNativeDblClick, true);
    return () => document.removeEventListener("dblclick", handleNativeDblClick, true);
  }, [isLocked]); // re-runs if locked state changes

  return {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds: [] as string[],
    setSelectedNodeIds: (_: string[]) => {},
    selectedSvgId,
    setSelectedSvgId,
    selectionBox,
    setSelectionBox,
    textBox,
    setTextBox,
    editingText,
    setEditingText,
    isInlineEditing,
    setIsInlineEditing,
    connectionState,
    setConnectionState,
    sequenceLifelineOverlay,
    hoveredSequenceActorBox,
    hoveredSequenceMessageBox,
    hoveredSequenceNoteBox,
    hoveredFlowchartNodeBox,
    sequenceMessageTriggerAreas,
    sequenceBlockAreas,
    getSequenceBlockEntries,
    resolveSequenceHighlightTarget,
    openHighlightRecolorRef,
    dragState: null as null,
    setDragState: (_: unknown) => {},
    startSequenceConnection,
    inlineInputRef,
    commitEditRef,
    getClickedNode,
    handleSvgClick,
    handleMouseMove,
    handleMouseUp,
    handleSequenceHoverOver,
    handleSequenceHoverOut,
    handleEditClick,
    handleAddNodeFromSelected,
    triggerHoveredSequenceMessageSelection,
    triggerSequenceMessageHoverByIndex,
    triggerHoveredSequenceNoteSelection,
    getSequenceMessageEndpointGeometry,
    getSequenceLifelines,
    shapePicker,
    setShapePicker,
    // Note handling functions
    getSequenceNoteEntries,
    insertSequenceNoteAtIndex,
    updateNotePosition,
    deleteSequenceNote,
    getSequenceInsertIndexForAnchor,
  };
}
