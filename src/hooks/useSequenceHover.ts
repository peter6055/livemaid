import { useCallback, useEffect, useLayoutEffect, useRef, useState, MutableRefObject } from "react";
import {
  buildSequenceMessageVisualModel,
  findOwningLineForSequenceLabel,
  findSequenceMessageVisualAtClientPoint,
  getSequenceMessageEntries,
  type SequenceMessageVisual,
} from "@/lib/diagrams/sequence/geometry";

export function isSequenceMessageHoverSuppressedByFloatingUi(
  clientX: number,
  clientY: number,
): boolean {
  if (typeof document === "undefined" || !document.elementsFromPoint) return false;
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof HTMLElement)) continue;
    // Message hit overlay owns hover — ignore deeper floating UI in the stack.
    if (el.dataset.seqMsgIndex != null || el.closest("[data-seq-msg-index]")) return false;
    if (el.closest("[data-seq-msg-hover-outline]")) return false;
    if (getComputedStyle(el).pointerEvents === "none") continue;
    return Boolean(
      el.closest?.("[data-inline-editor]") ||
      el.closest?.("[data-class-text-editor]") ||
      el.closest?.("[data-inline-toolbar]") ||
      el.closest?.("[data-scale-lock]") ||
      el.closest?.("[data-scale-lock-border]"),
    );
  }
  return false;
}

/**
 * Sequence-diagram hover state: actor/message/note hover boxes plus message-band
 * hit-testing and hover highlight application. Extracted verbatim from
 * useCanvasInteraction (Phase 3 of the canvas-interaction split).
 */
export function useSequenceHover({
  code,
  svgContent,
  containerRef,
  determineDiagramType,
  isInlineEditing,
  selectedNodeIdRef,
  selectedNodeId,
  selectionBox,
  sequenceMessageTriggerAreas,
  findNearestLineForText,
  sequenceMessageVisualsRef,
}: {
  code: string;
  svgContent?: string;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  determineDiagramType: (code: string) => string;
  isInlineEditing: boolean;
  selectedNodeIdRef: MutableRefObject<string | null>;
  selectedNodeId: string | null;
  selectionBox: { x: number; y: number; width: number; height: number } | null;
  sequenceMessageTriggerAreas: Array<{
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  findNearestLineForText: (textEl: SVGElement, lineEls: SVGElement[]) => SVGElement | null;
  sequenceMessageVisualsRef: MutableRefObject<SequenceMessageVisual[]>;
}) {
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

  const [hoveredSequenceMessageIndex, setHoveredSequenceMessageIndex] = useState<number | null>(
    null,
  );
  const hoveredSequenceMessageIndexRef = useRef<number | null>(null);
  const hoveredSequenceTargetsRef = useRef<{
    labelEls: SVGElement[];
    lineEl: SVGElement | null;
  }>({ labelEls: [], lineEl: null });
  const lastSequencePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const applySequenceMessageHoverClasses = useCallback(
    (index: number | null) => {
      const selectedId = selectedNodeIdRef.current;
      const selectedIndex = selectedId?.startsWith("SEQ_MSG_")
        ? parseInt(selectedId.replace("SEQ_MSG_", ""), 10)
        : null;

      if (index === null) {
        hoveredSequenceTargetsRef.current.labelEls.forEach((el) => {
          el.classList.remove("sequence-msg-hover-highlight-text");
        });
        hoveredSequenceTargetsRef.current.lineEl?.classList.remove(
          "sequence-msg-hover-highlight-line",
        );
        hoveredSequenceTargetsRef.current = { labelEls: [], lineEl: null };
        return;
      }

      if (index === selectedIndex) {
        hoveredSequenceTargetsRef.current.labelEls.forEach((el) => {
          el.classList.remove("sequence-msg-hover-highlight-text");
        });
        hoveredSequenceTargetsRef.current.lineEl?.classList.remove(
          "sequence-msg-hover-highlight-line",
        );
        hoveredSequenceTargetsRef.current = { labelEls: [], lineEl: null };
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      let visuals = sequenceMessageVisualsRef.current;
      if (visuals.length === 0) {
        visuals = buildSequenceMessageVisualModel(
          container,
          code,
          getSequenceMessageEntries,
          findOwningLineForSequenceLabel,
        );
        sequenceMessageVisualsRef.current = visuals;
      }
      const visual = visuals[index];
      if (!visual) return;

      const prevLabelEls = hoveredSequenceTargetsRef.current.labelEls;
      const prevLineEl = hoveredSequenceTargetsRef.current.lineEl;
      const sameLine = prevLineEl === visual.lineEl;
      const sameLabels =
        sameLine &&
        prevLabelEls.length === visual.labelEls.length &&
        prevLabelEls.every((el, i) => el === visual.labelEls[i]);
      if (sameLabels) return;

      prevLabelEls.forEach((el) => {
        el.classList.remove("sequence-msg-hover-highlight-text");
      });
      prevLineEl?.classList.remove("sequence-msg-hover-highlight-line");

      visual.labelEls.forEach((el) => {
        el.classList.add("sequence-msg-hover-highlight-text");
      });
      visual.lineEl?.classList.add("sequence-msg-hover-highlight-line");
      hoveredSequenceTargetsRef.current = { labelEls: visual.labelEls, lineEl: visual.lineEl };
    },
    [containerRef, code, getSequenceMessageEntries],
  );

  const setHoveredSequenceMessage = useCallback(
    (index: number | null) => {
      const prevIndex = hoveredSequenceMessageIndexRef.current;

      if (index === null) {
        if (prevIndex === null) return;
        hoveredSequenceMessageIndexRef.current = null;
        setHoveredSequenceMessageIndex(null);
        setHoveredSequenceMessageBox(null);
        applySequenceMessageHoverClasses(null);
        return;
      }

      const selectedId = selectedNodeIdRef.current;
      const selectedIndex = selectedId?.startsWith("SEQ_MSG_")
        ? parseInt(selectedId.replace("SEQ_MSG_", ""), 10)
        : null;
      if (index === selectedIndex) {
        if (prevIndex !== null) {
          hoveredSequenceMessageIndexRef.current = null;
          setHoveredSequenceMessageIndex(null);
        }
        setHoveredSequenceMessageBox(null);
        applySequenceMessageHoverClasses(null);
        return;
      }

      let visual = sequenceMessageVisualsRef.current[index];
      if (!visual) {
        const container = containerRef.current;
        if (container) {
          const visuals = buildSequenceMessageVisualModel(
            container,
            code,
            getSequenceMessageEntries,
            findOwningLineForSequenceLabel,
          );
          sequenceMessageVisualsRef.current = visuals;
          visual = visuals[index];
        }
      }

      const sameIndex = prevIndex === index;
      hoveredSequenceMessageIndexRef.current = index;
      if (!sameIndex) {
        setHoveredSequenceMessageIndex(index);
      }
      setHoveredSequenceMessageBox(visual?.selectionBox ?? null);
      applySequenceMessageHoverClasses(index);
    },
    [containerRef, code, getSequenceMessageEntries, applySequenceMessageHoverClasses],
  );

  // Live hit-test: returns the message whose connection band (line + label, with
  // padding) contains the given canvas-space point. Computed directly from the DOM
  // so it is reliable on cold load, independent of any precomputed-areas state.
  const findSequenceMessageBandAtPoint = useCallback(
    (canvasX: number, canvasY: number): { index: number; el: SVGElement } | null => {
      const container = containerRef.current;
      if (!container) return null;

      let visuals = sequenceMessageVisualsRef.current;
      if (visuals.length === 0) {
        visuals = buildSequenceMessageVisualModel(
          container,
          code,
          getSequenceMessageEntries,
          findOwningLineForSequenceLabel,
        );
        sequenceMessageVisualsRef.current = visuals;
      }

      let bestVisual: SequenceMessageVisual | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const v of visuals) {
        const hb = v.hitBox;
        if (
          canvasX >= hb.x &&
          canvasX <= hb.x + hb.width &&
          canvasY >= hb.y &&
          canvasY <= hb.y + hb.height
        ) {
          const dist = Math.abs(canvasY - (hb.y + hb.height / 2));
          if (dist < bestDist) {
            bestDist = dist;
            bestVisual = v;
          }
        }
      }

      if (bestVisual) {
        const el = bestVisual.labelEls[0] || bestVisual.lineEl;
        return el ? { index: bestVisual.index, el: el as SVGElement } : null;
      }
      return null;
    },
    [containerRef, findNearestLineForText, code, getSequenceMessageEntries],
  );

  const clearSequenceMessageHoverHighlight = useCallback(() => {
    setHoveredSequenceMessage(null);
  }, [setHoveredSequenceMessage]);

  useLayoutEffect(() => {
    const idx = hoveredSequenceMessageIndexRef.current;
    if (idx === null) return;
    applySequenceMessageHoverClasses(idx);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      const after = hoveredSequenceMessageIndexRef.current;
      if (after !== null) applySequenceMessageHoverClasses(after);
      raf2 = requestAnimationFrame(() => {
        const after2 = hoveredSequenceMessageIndexRef.current;
        if (after2 !== null) applySequenceMessageHoverClasses(after2);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [
    svgContent,
    hoveredSequenceMessageIndex,
    selectedNodeId,
    selectionBox,
    sequenceMessageTriggerAreas,
    applySequenceMessageHoverClasses,
  ]);

  const resolveHoveredSequenceMessageIndexAtPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      if (typeof document !== "undefined" && document.elementsFromPoint) {
        const hitOverlay = document
          .elementsFromPoint(clientX, clientY)
          .find(
            (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.seqMsgIndex != null,
          );
        if (hitOverlay) {
          const idx = parseInt(hitOverlay.dataset.seqMsgIndex!, 10);
          if (Number.isFinite(idx)) return idx;
        }
      }

      const container = containerRef.current;
      if (!container) return null;
      const visual = findSequenceMessageVisualAtClientPoint(
        clientX,
        clientY,
        container,
        code,
        getSequenceMessageEntries,
        sequenceMessageVisualsRef.current.length > 0
          ? sequenceMessageVisualsRef.current
          : undefined,
      );
      return visual?.index ?? null;
    },
    [containerRef, code, getSequenceMessageEntries],
  );

  const handleSequenceMessageHoverEnter = useCallback(
    (index: number) => {
      if (determineDiagramType(code) !== "sequence" || isInlineEditing) return;
      setHoveredSequenceMessage(index);
    },
    [code, determineDiagramType, isInlineEditing, setHoveredSequenceMessage],
  );

  const handleSequenceMessageHoverMove = useCallback(
    (index: number) => {
      if (hoveredSequenceMessageIndexRef.current !== index) {
        setHoveredSequenceMessage(index);
      }
    },
    [setHoveredSequenceMessage],
  );

  const handleSequenceMessageHoverLeave = useCallback(
    (index: number, e: React.PointerEvent<HTMLDivElement>) => {
      const related = e.relatedTarget;
      if (
        related instanceof Element &&
        (related.closest("[data-seq-msg-index]") || e.currentTarget.contains(related))
      ) {
        return;
      }
      if (hoveredSequenceMessageIndexRef.current === index) {
        setHoveredSequenceMessage(null);
      }
    },
    [setHoveredSequenceMessage],
  );

  const syncSequenceMessageHoverAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const hoveredIndex = resolveHoveredSequenceMessageIndexAtPoint(clientX, clientY);
      if (hoveredIndex !== null) {
        setHoveredSequenceMessage(hoveredIndex);
        return;
      }
      if (isSequenceMessageHoverSuppressedByFloatingUi(clientX, clientY)) {
        setHoveredSequenceMessage(null);
        return;
      }
      setHoveredSequenceMessage(null);
    },
    [resolveHoveredSequenceMessageIndexAtPoint, setHoveredSequenceMessage],
  );

  // Hit overlays remount after selection / Mermaid re-render without a fresh pointerenter.
  // Re-sync from the last known pointer position so hover does not vanish mid-session.
  useEffect(() => {
    if (determineDiagramType(code) !== "sequence") return;
    const pt = lastSequencePointerRef.current;
    if (!pt) return;
    syncSequenceMessageHoverAtPoint(pt.clientX, pt.clientY);
  }, [
    sequenceMessageTriggerAreas,
    selectedNodeId,
    svgContent,
    code,
    syncSequenceMessageHoverAtPoint,
    determineDiagramType,
  ]);

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
      const overFloatingUi = isSequenceMessageHoverSuppressedByFloatingUi(e.clientX, e.clientY);
      if (overFloatingUi) {
        clearSequenceMessageHoverHighlight();
        setHoveredSequenceNoteBox(null);
        return;
      }

      updateSequenceNoteHover(e.clientX, e.clientY);
    },
    [
      code,
      determineDiagramType,
      clearSequenceMessageHoverHighlight,
      setHoveredSequenceNoteBox,
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

      updateSequenceNoteHover(e.clientX, e.clientY);
    },
    [code, determineDiagramType, clearSequenceMessageHoverHighlight, updateSequenceNoteHover],
  );

  const triggerSequenceMessageHoverByIndex = useCallback(
    (index: number) => {
      setHoveredSequenceMessage(index);
    },
    [setHoveredSequenceMessage],
  );

  return {
    hoveredSequenceActorBox,
    setHoveredSequenceActorBox,
    hoveredSequenceMessageBox,
    hoveredSequenceNoteBox,
    setHoveredSequenceNoteBox,
    hoveredSequenceMessageIndex,
    hoveredSequenceTargetsRef,
    sequenceMessageVisualsRef,
    lastSequencePointerRef,
    findSequenceMessageBandAtPoint,
    clearSequenceMessageHoverHighlight,
    resolveHoveredSequenceMessageIndexAtPoint,
    syncSequenceMessageHoverAtPoint,
    handleSequenceMessageHoverEnter,
    handleSequenceMessageHoverMove,
    handleSequenceMessageHoverLeave,
    triggerSequenceMessageHoverByIndex,
    handleSequenceHoverOver,
    handleSequenceHoverOut,
  };
}
