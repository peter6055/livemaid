import { useState, useCallback, useRef, MutableRefObject, useEffect, useLayoutEffect } from "react";
import {
  isEdgeId,
  parseEdgeId,
  getLinkLabelFromMiddle,
  matchFlowchartLinkLine,
} from "@/lib/diagrams/utils";
import type { ShapeOption } from "@/lib/diagrams/flowchart";
import {
  getSequenceNoteRectForText,
  getSequenceNoteTextElementAtIndex,
  getSortedSequenceNoteTextElements,
} from "@/lib/diagrams/sequenceNotes";
import { findMindmapSvgElementByNodeId, mindmapNodeIdFromSvgElement } from "@/lib/diagrams/mindmap";

// Padding (canvas units) added around a sequence message's raw line+label bounds to
// produce the unified hover/selection border box. The hover box and the selection box
// MUST both use this exact value so they stay pixel-identical (one single border box).
const SEQ_MSG_SELECTION_PADDING = { x: 0, y: 1 };
// Padding (canvas units) for the clickable/hoverable hit-test band. Kept SMALLER than the
// visible box padding (especially vertically) so the interactive area is tighter than the
// drawn box, preventing accidental clicks on adjacent message rows.
const SEQ_MSG_HITTEST_PADDING = { x: 0, y: 1 };

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

// Mermaid renders multi-line sequence messages using a <switch> element containing both
// a visible <foreignObject class="messageText"> and multiple invisible <text class="messageText">
// elements (one per line via byTspan fallback). querySelectorAll(".messageText") returns ALL of
// them, breaking the 1:1 message-to-element mapping. This helper filters to only visible elements
// (non-zero bounding rect), restoring the correct count.
export function getVisibleSequenceMessageTexts(container: HTMLElement): SVGElement[] {
  const allTexts = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
  return allTexts.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

export interface SequenceMessageVisual {
  index: number;
  sourceLineIndex: number;
  lineEl: SVGElement | null;
  labelEls: SVGElement[];
  lineRect: DOMRect | null;
  labelRect: DOMRect | null;
  selectionBox: { x: number; y: number; width: number; height: number };
  textBox: { x: number; y: number; width: number; height: number } | null;
  hitBox: { x: number; y: number; width: number; height: number };
}

function getSequenceMessageLabelRoots(container: HTMLElement): SVGElement[] {
  const candidates = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
  const roots = new Set<SVGElement>();

  for (const el of candidates) {
    const foreignObject = el.closest("foreignObject.messageText") as SVGElement | null;
    if (foreignObject) {
      const rect = foreignObject.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        roots.add(foreignObject);
      }
      continue;
    }

    const textEl = el.closest("text.messageText") as SVGElement | null;
    if (textEl) {
      const rect = textEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        roots.add(textEl);
      }
    }
  }

  return [...roots];
}

export function findOwningLineForSequenceLabel(
  labelEl: SVGElement,
  lineEls: SVGElement[],
): SVGElement | null {
  if (lineEls.length === 0) return null;
  const labelRect = labelEl.getBoundingClientRect();
  const labelCenterX = labelRect.left + labelRect.width / 2;
  const labelTop = labelRect.top;

  const belowCandidates = lineEls
    .map((lineEl) => {
      const rect = lineEl.getBoundingClientRect();
      const lineCenterY = rect.top + rect.height / 2;

      const horizontalGap =
        labelCenterX < rect.left
          ? rect.left - labelCenterX
          : labelCenterX > rect.right
            ? labelCenterX - rect.right
            : 0;

      return {
        lineEl,
        lineCenterY,
        horizontalGap,
      };
    })
    .filter((item) => item.lineCenterY >= labelTop - 2)
    .sort((a, b) => a.lineCenterY - b.lineCenterY || a.horizontalGap - b.horizontalGap);

  if (belowCandidates[0]) return belowCandidates[0].lineEl;

  // Fallback for multi-line byTspan rows that sit slightly below their own arrow line:
  // the filter above excludes that arrow (lineCenterY < labelTop), so score all lines.
  const textX = labelRect.left + labelRect.width / 2;
  const textY = labelRect.top + labelRect.height / 2;
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
    const underPenalty = lineY < textY ? 15 : 0;
    const score = dy * 3 + dx + underPenalty;
    if (score < best) {
      best = score;
      nearest = lineEl;
    }
  }
  return nearest;
}

function findSequenceMessageVisualAtClientPoint(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  code: string,
  getSequenceMessageEntries: (sourceCode: string) => Array<{ index: number; line: string }>,
  existingVisuals?: SequenceMessageVisual[],
): SequenceMessageVisual | null {
  const rect = container.getBoundingClientRect();
  const scale = rect.width / container.offsetWidth;

  const canvasX = (clientX - rect.left + container.scrollLeft) / scale;
  const canvasY = (clientY - rect.top + container.scrollTop) / scale;

  const visuals =
    existingVisuals ??
    buildSequenceMessageVisualModel(
      container,
      code,
      getSequenceMessageEntries,
      findOwningLineForSequenceLabel,
    );

  return (
    visuals.find((v) => {
      const b = v.hitBox;
      return (
        canvasX >= b.x && canvasX <= b.x + b.width && canvasY >= b.y && canvasY <= b.y + b.height
      );
    }) ?? null
  );
}

function isSequenceMessageHoverSuppressedByFloatingUi(clientX: number, clientY: number): boolean {
  if (typeof document === "undefined" || !document.elementsFromPoint) return false;
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof HTMLElement)) continue;
    // Message hit overlay owns hover — ignore deeper floating UI in the stack.
    if (el.dataset.seqMsgIndex != null || el.closest("[data-seq-msg-index]")) return false;
    if (el.closest("[data-seq-msg-hover-outline]")) return false;
    if (getComputedStyle(el).pointerEvents === "none") continue;
    return Boolean(
      el.closest?.("[data-inline-toolbar]") ||
      el.closest?.("[data-scale-lock]") ||
      el.closest?.("[data-scale-lock-border]"),
    );
  }
  return false;
}

export function buildSequenceMessageVisualModel(
  container: HTMLElement,
  code: string,
  getSequenceMessageEntries: (sourceCode: string) => Array<{ index: number; line: string }>,
  findOwningLine: (labelEl: SVGElement, lineEls: SVGElement[]) => SVGElement | null,
): SequenceMessageVisual[] {
  const entries = getSequenceMessageEntries(code);
  if (entries.length === 0) return [];

  const messageLineEls = Array.from(
    container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
  ) as SVGElement[];

  const labelRoots = getSequenceMessageLabelRoots(container);
  const visibleTexts = getVisibleSequenceMessageTexts(container);

  const containerRect = container.getBoundingClientRect();
  const scale = containerRect.width / container.offsetWidth;
  const toCanvasX = (vx: number) => (vx - containerRect.left + container.scrollLeft) / scale;
  const toCanvasY = (vy: number) => (vy - containerRect.top + container.scrollTop) / scale;
  const toCanvasRect = (r: DOMRect | null) =>
    r
      ? {
          x: toCanvasX(r.left),
          y: toCanvasY(r.top),
          width: r.width / scale,
          height: r.height / scale,
        }
      : null;

  const visuals: SequenceMessageVisual[] = [];

  for (let i = 0; i < messageLineEls.length && i < entries.length; i += 1) {
    const lineEl = messageLineEls[i];
    const entry = entries[i];
    const lineRect = lineEl.getBoundingClientRect();

    const labelEls = [
      ...new Set([
        ...labelRoots.filter((labelEl) => findOwningLine(labelEl, messageLineEls) === lineEl),
        ...visibleTexts.filter((labelEl) => findOwningLine(labelEl, messageLineEls) === lineEl),
      ]),
    ];

    const labelRect = labelEls.length > 0 ? unionClientRects(labelEls) : null;

    const srcLineRect = lineRect ? toCanvasRect(lineRect)! : null;
    const srcLabelRect = labelRect ? toCanvasRect(labelRect) : null;

    const selectionPaddingX = SEQ_MSG_SELECTION_PADDING.x;
    const selectionPaddingY = SEQ_MSG_SELECTION_PADDING.y;

    const selLeft = Math.min(
      srcLineRect?.x ?? Number.POSITIVE_INFINITY,
      srcLabelRect?.x ?? Number.POSITIVE_INFINITY,
    );
    const selTop = Math.min(
      srcLineRect?.y ?? Number.POSITIVE_INFINITY,
      srcLabelRect?.y ?? Number.POSITIVE_INFINITY,
    );
    const selRight = Math.max(
      (srcLineRect?.x ?? Number.NEGATIVE_INFINITY) + (srcLineRect?.width ?? 0),
      (srcLabelRect?.x ?? Number.NEGATIVE_INFINITY) + (srcLabelRect?.width ?? 0),
    );
    const selBottom = Math.max(
      (srcLineRect?.y ?? Number.NEGATIVE_INFINITY) + (srcLineRect?.height ?? 0),
      (srcLabelRect?.y ?? Number.NEGATIVE_INFINITY) + (srcLabelRect?.height ?? 0),
    );

    const selectionBox = {
      x: selLeft - selectionPaddingX,
      y: selTop - selectionPaddingY,
      width: Math.max(0, selRight - selLeft + selectionPaddingX * 2),
      height: Math.max(0, selBottom - selTop + selectionPaddingY * 2),
    };

    const textBox = srcLabelRect ? { ...srcLabelRect } : null;

    const hitPaddingX = SEQ_MSG_HITTEST_PADDING.x;
    const hitPaddingY = SEQ_MSG_HITTEST_PADDING.y;
    const hitBox = {
      x: selLeft - hitPaddingX,
      y: selTop - hitPaddingY,
      width: Math.max(0, selRight - selLeft + hitPaddingX * 2),
      height: Math.max(0, selBottom - selTop + hitPaddingY * 2),
    };

    visuals.push({
      index: i,
      sourceLineIndex: entry.index,
      lineEl,
      labelEls,
      lineRect,
      labelRect,
      selectionBox,
      textBox,
      hitBox,
    });
  }

  return visuals;
}

export function buildSequenceMessageTriggerAreas(
  visuals: SequenceMessageVisual[],
  padding: { x: number; y: number },
): Array<{ index: number; x: number; y: number; width: number; height: number }> {
  const expanded = visuals.map((v) => {
    const base = v.hitBox;
    return {
      index: v.index,
      x: base.x - padding.x,
      y: base.y - padding.y,
      width: Math.max(0, base.width + padding.x * 2),
      height: Math.max(0, base.height + padding.y * 2),
    };
  });

  const sorted = [...expanded].sort((a, b) => {
    const aCenter = a.y + a.height / 2;
    const bCenter = b.y + b.height / 2;
    return aCenter - bCenter || a.index - b.index;
  });

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const currentBottom = current.y + current.height;
    if (currentBottom <= next.y) continue;

    const currentCenter = current.y + current.height / 2;
    const nextCenter = next.y + next.height / 2;
    const boundary = (currentCenter + nextCenter) / 2;
    const clampedBoundary = Math.min(Math.max(boundary, current.y), next.y + next.height);

    current.height = Math.max(0, clampedBoundary - current.y);
    const nextBottom = next.y + next.height;
    next.y = clampedBoundary;
    next.height = Math.max(0, nextBottom - next.y);
  }

  return expanded;
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
  isCommentMode = false,
  onCanvasCommentPlace,
}: {
  code: string;
  svgContent?: string;
  renderIdRef: MutableRefObject<string | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  isLocked: boolean;
  handleCodeChange: (code: string) => void;
  determineDiagramType: (code: string) => string;
  isCommentMode?: boolean;
  onCanvasCommentPlace?: (position: { x: number; y: number }) => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  // Keep ref in sync with state
  const setSelectedNodeIdWithRef = useCallback((id: string | null) => {
    selectedNodeIdRef.current = id;
    setSelectedNodeId(id);
  }, []);
  const [selectedSvgId, setSelectedSvgId] = useState<string | null>(null);
  const selectedSvgIdRef = useRef<string | null>(null);
  const setSelectedSvgIdWithRef = useCallback((id: string | null) => {
    selectedSvgIdRef.current = id;
    setSelectedSvgId(id);
  }, []);
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
  const isInlineEditingRef = useRef(isInlineEditing);
  useEffect(() => {
    isInlineEditingRef.current = isInlineEditing;
  }, [isInlineEditing]);
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
  const connectionStateRef = useRef(connectionState);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

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
  const [sequenceLayoutVersion, setSequenceLayoutVersion] = useState(0);
  const sequenceConnectionCommittedRef = useRef(false);
  const [sequenceBlockAreas, setSequenceBlockAreas] = useState<SequenceBlockArea[]>([]);
  const [hoveredSequenceMessageIndex, setHoveredSequenceMessageIndex] = useState<number | null>(
    null,
  );
  const hoveredSequenceMessageIndexRef = useRef<number | null>(null);
  const sequenceMessageVisualsRef = useRef<SequenceMessageVisual[]>([]);
  const hoveredSequenceTargetsRef = useRef<{
    labelEls: SVGElement[];
    lineEl: SVGElement | null;
  }>({ labelEls: [], lineEl: null });
  const lastSequencePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const findNearestLineForText = useCallback(
    (textEl: SVGElement, lineEls: SVGElement[]) => findOwningLineForSequenceLabel(textEl, lineEls),
    [],
  );

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
    [code, isInlineEditing, setHoveredSequenceMessage],
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

  // Cold-load race: same as sequenceBlockAreas — containerRef attaches a frame after svgContent
  // is set, so retry on rAF until the DOM is measurable.
  useEffect(() => {
    if (determineDiagramType(code) !== "sequence") {
      setSequenceMessageTriggerAreas([]);
      sequenceMessageVisualsRef.current = [];
      return;
    }

    let rafId = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 150;

    const compute = (): boolean => {
      const container = containerRef.current;
      if (!container) return false;

      const visuals = buildSequenceMessageVisualModel(
        container,
        code,
        getSequenceMessageEntries,
        findOwningLineForSequenceLabel,
      );
      if (visuals.length === 0) return false;

      sequenceMessageVisualsRef.current = visuals;

      const areas = buildSequenceMessageTriggerAreas(visuals, { x: 0, y: 5 });

      setSequenceMessageTriggerAreas(areas);
      return true;
    };

    const tick = () => {
      if (compute()) return;
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        setSequenceMessageTriggerAreas([]);
        sequenceMessageVisualsRef.current = [];
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
    sequenceLayoutVersion,
    determineDiagramType,
    getSequenceMessageEntries,
  ]);

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

  // If a candidate element is a broad actor wrapper whose bounds span header + lifeline +
  // footer, resolve to the compact visible header element nearest the selection. Otherwise
  // retain the candidate unchanged.
  const resolveCompactActorElement = (
    container: HTMLElement | null,
    candidate: Element | null,
    candidateSvgId: string | null,
  ): Element | null => {
    if (!container || !candidate) return candidate;
    const candidateBounds = candidate.getBoundingClientRect();
    if (candidateBounds.width <= 0 || candidateBounds.height <= 0) return candidate;

    const lifelines = container.querySelectorAll("line.actor-line");
    let containsLifeline = false;
    for (const line of lifelines) {
      const lineBounds = line.getBoundingClientRect();
      if (
        lineBounds.top >= candidateBounds.top - 1 &&
        lineBounds.bottom <= candidateBounds.bottom + 1 &&
        lineBounds.left >= candidateBounds.left - 1 &&
        lineBounds.right <= candidateBounds.right + 1
      ) {
        containsLifeline = true;
        break;
      }
    }
    if (!containsLifeline) return candidate;

    const compactElements = Array.from(
      container.querySelectorAll("rect.actor, g.actor-man"),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.top >= candidateBounds.top - 1 &&
        r.bottom <= candidateBounds.bottom + 1 &&
        r.left >= candidateBounds.left - 1 &&
        r.right <= candidateBounds.right + 1
      );
    });
    if (compactElements.length === 0) return candidate;

    if (candidateSvgId) {
      const matched = compactElements.find((el) => el.id === candidateSvgId);
      if (matched) return matched;
    }
    compactElements.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return compactElements[0];
  };

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

      const noteTextEls = getSortedNoteTextEls(container);

      const msgVisuals =
        sequenceMessageVisualsRef.current.length > 0
          ? sequenceMessageVisualsRef.current
          : buildSequenceMessageVisualModel(
              container,
              code,
              getSequenceMessageEntries,
              findOwningLineForSequenceLabel,
            );

      const codeLines = code.split("\n");
      const noteSrcLines = codeLines
        .map((l, idx) => ({ l: l.trim(), idx }))
        .filter(({ l }) => /^note\b/i.test(l))
        .map(({ idx }) => idx);

      type Row = { srcLine: number; top: number; bottom: number };
      const rows: Row[] = [];
      for (const v of msgVisuals) {
        const lr = v.lineRect;
        const lcr = v.labelRect;
        const top = toY(Math.min(lr?.top ?? Infinity, lcr?.top ?? Infinity));
        const bottom = toY(Math.max(lr?.bottom ?? -Infinity, lcr?.bottom ?? -Infinity));
        if (Number.isFinite(top) && Number.isFinite(bottom)) {
          rows.push({ srcLine: v.sourceLineIndex, top, bottom });
        }
      }
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
      clearSequenceMessageHoverHighlight();

      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];

      const messageIndex =
        typeof explicitIndex === "number"
          ? explicitIndex
          : (() => {
              const hoverLine = hoveredSequenceTargetsRef.current.lineEl;
              if (hoverLine) {
                const idx = messageLineEls.indexOf(hoverLine);
                return idx >= 0 ? idx : -1;
              }
              const hoverText = hoveredSequenceTargetsRef.current.labelEls[0];
              if (hoverText) {
                const owningLine = findOwningLineForSequenceLabel(hoverText, messageLineEls);
                if (owningLine) {
                  return messageLineEls.indexOf(owningLine);
                }
              }
              return -1;
            })();

      if (messageIndex < 0) return;

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
      const visual = visuals[messageIndex];
      if (!visual) return;

      setSelectionBox(visual.selectionBox);
      setTextBox(visual.textBox);

      const nodeId = `SEQ_MSG_${messageIndex}`;
      setSelectedNodeIdWithRef(nodeId);

      const textEl = visual.labelEls[0] || null;
      const lineEl = visual.lineEl;
      if (textEl && !textEl.id) textEl.id = `seq-msg-${messageIndex}`;
      setSelectedSvgIdWithRef(textEl?.id || lineEl?.id || null);

      if (startInlineEdit) {
        const msgLine = getSequenceMessageLineByIndex(messageIndex);
        const colonIdx = msgLine?.indexOf(":") ?? -1;
        const label = colonIdx !== -1 && msgLine ? msgLine.substring(colonIdx + 1).trim() : "";
        setEditingText(label.replace(/<br\s*\/?>/gi, "\n"));
        setIsInlineEditing(true);
        setTimeout(() => {
          if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
          }
        }, 10);
      }
    },
    [
      clearSequenceMessageHoverHighlight,
      containerRef,
      getSequenceMessageLineByIndex,
      findNearestLineForText,
      getSequenceMessageEntries,
      code,
      setSelectedNodeIdWithRef,
    ],
  );

  const triggerSequenceMessageHoverByIndex = useCallback(
    (index: number) => {
      setHoveredSequenceMessage(index);
    },
    [setHoveredSequenceMessage],
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

      const toCanvasY = (vy: number) => (vy - containerRect.top + container.scrollTop) / scale;
      void sequenceLayoutVersion;

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
      sequenceLayoutVersion,
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

  function getSortedNoteTextEls(container: ParentNode | null | undefined) {
    return getSortedSequenceNoteTextElements(container);
  }

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
      const textEl = getSequenceNoteTextElementAtIndex(container, index);
      if (!textEl) return;
      const rectNote = getSequenceNoteRectForText(textEl);
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
      setSelectedSvgIdWithRef(textEl.id || rectNote?.id || null);

      if (startInlineEdit) {
        const noteEntry = getSequenceNoteEntries(code)[index];
        setEditingText((noteEntry?.text || "").replace(/<br\s*\/?>/gi, "\n"));
        setIsInlineEditing(true);
        setTimeout(() => {
          if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
          }
        }, 10);
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
          : getVisibleSequenceMessageTexts(containerRef.current)
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
      if (id.startsWith("MINDMAP_")) return id;
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
    } else if (selectedNodeId.startsWith("MINDMAP_")) {
      const node = findMindmapSvgElementByNodeId(code, containerRef.current, selectedNodeId);
      if (node) {
        foundElement = node;
        foundRawSvgId = node.id || null;
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
      const visuals =
        sequenceMessageVisualsRef.current.length > 0
          ? sequenceMessageVisualsRef.current
          : buildSequenceMessageVisualModel(
              containerRef.current,
              code,
              getSequenceMessageEntries,
              findOwningLineForSequenceLabel,
            );
      const visual = visuals[idx];
      if (visual) {
        foundElement = (visual.labelEls[0] || visual.lineEl) as SVGElement;
        if (foundElement && !foundElement.id) foundElement.id = `seq-msg-${idx}`;
        foundRawSvgId = foundElement?.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
      const allNotes = getSortedNoteTextEls(containerRef.current);
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
          if (candidate.classList?.contains("edgeLabel")) {
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

    // For sequence actors, ensure the resolved element is a compact header (not a broad
    // wrapper spanning header + lifeline + footer) so selectedSvgId preserves the exact
    // top/header instance and the selection box hugs the visible header shape.
    if (selectedNodeId.startsWith("SEQ_ACTOR_") && foundElement && containerRef.current) {
      const resolved = resolveCompactActorElement(
        containerRef.current,
        foundElement,
        selectedSvgId,
      );
      if (resolved !== foundElement) {
        foundElement = resolved as SVGElement;
        if (!foundElement.id) {
          const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
          const b = foundElement.getBoundingClientRect();
          foundElement.id = `seq-actor-${actorId.replace(/[^a-zA-Z0-9_]/g, "")}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        foundRawSvgId = foundElement.id || null;
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
          const allMsgTexts = getVisibleSequenceMessageTexts(containerRef.current);
          const allMsgLines = Array.from(
            containerRef.current.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ),
          ) as SVGElement[];

          const pairedLine =
            allMsgLines[idx] || findOwningLineForSequenceLabel(foundElement, allMsgLines);
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
      setSelectedSvgIdWithRef(foundRawSvgId);
    } else {
      // If we couldn't find the selected element in the new SVG, clear the selection
      setSelectionBox(null);
      setTextBox(null);
      setSelectedNodeIdWithRef(null);
      setSelectedSvgIdWithRef(null);
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

  // When a sequence message is selected, mark its SVG elements with
  // `data-seq-selected="true"` so CSS can suppress the native :hover
  // highlight (which would otherwise create a duplicate visual indicator
  // alongside the React selection overlay).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous selection markers
    container
      .querySelectorAll('[data-seq-selected="true"]')
      .forEach((el) => el.removeAttribute("data-seq-selected"));

    if (!selectedNodeId?.startsWith("SEQ_MSG_")) return;

    const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
    if (!Number.isFinite(idx) || idx < 0) return;

    const allMsgTexts = getVisibleSequenceMessageTexts(container);
    const allMsgLines = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
    ) as SVGElement[];

    const lineEl = allMsgLines[idx];
    if (!lineEl) return;

    // Mark all text elements paired with this message line (handles multi-line labels)
    const pairedTexts = getSequenceTextElsForLine(lineEl, allMsgTexts, allMsgLines);
    pairedTexts.forEach((el) => el.setAttribute("data-seq-selected", "true"));

    // Mark the line element and its child strokes
    lineEl.setAttribute("data-seq-selected", "true");
    lineEl.querySelectorAll("line, path").forEach((el) => {
      el.setAttribute("data-seq-selected", "true");
    });
  }, [selectedNodeId, containerRef, getSequenceTextElsForLine, svgContent]);

  // Effect to recalculate selection on code or svgContent (re-render) change
  useEffect(() => {
    if (!selectedNodeId) return;

    const timeoutId = setTimeout(() => {
      recalculateSelection();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [code, svgContent, selectedNodeId, recalculateSelection]);

  const recalculateSelectionRef = useRef(recalculateSelection);
  useEffect(() => {
    recalculateSelectionRef.current = recalculateSelection;
  }, [recalculateSelection]);

  // Effect to recalculate sequence geometry on container or mermaid-container resize
  // (e.g. dragging panel splitter or window resize). Sequence overlays cache DOM-derived
  // canvas coordinates, so resize must invalidate the visual model even when code/svg are unchanged.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const observer = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        sequenceMessageVisualsRef.current = [];
        setSequenceLayoutVersion((version) => version + 1);
        recalculateSelectionRef.current();
      });
    });

    const mermaidContainer = container.querySelector(".mermaid-container");

    observer.observe(container);
    if (mermaidContainer) {
      observer.observe(mermaidContainer);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [containerRef, svgContent]);

  const getClickedNode = useCallback(
    (target: Element) => {
      const isSequenceMessageLineElement = (el: SVGElement | null) => {
        if (!el?.classList) return false;
        return Array.from(el.classList).some((c) => c.startsWith("messageLine"));
      };

      let currentNode: SVGElement | null = target as SVGElement;
      let foundNodeClass = false;
      let nodeId = null;
      const currentDiagramType = determineDiagramType(code);

      while (currentNode && currentNode.tagName !== "svg") {
        if (currentDiagramType === "mindmap") {
          const mindmapNodeId = containerRef.current
            ? mindmapNodeIdFromSvgElement(code, containerRef.current, currentNode)
            : null;
          if (mindmapNodeId) {
            const group = currentNode.closest("g.mindmap-node, g.node, g[class*='mindmap']");
            foundNodeClass = true;
            nodeId = mindmapNodeId;
            currentNode = (group?.closest("g") ?? group ?? currentNode) as SVGElement;
            break;
          }
        }

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
          currentNode.classList?.contains("edgeLabel") ||
          currentNode.classList?.contains("edge-label-hit-target")
        ) {
          foundNodeClass = true;
          if (currentNode.classList?.contains("edge-label-hit-target")) {
            const dataId = currentNode.getAttribute("data-id");
            if (dataId) {
              const canonical = normalizeId(dataId);
              const paths = Array.from(
                containerRef.current?.querySelectorAll(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ) || [],
              );
              const path = paths.find((p) => p.id && normalizeId(p.id) === canonical);
              if (path && path.id) nodeId = path.id;
            }
            if (!nodeId) {
              const edgeLabel = currentNode.closest(".edgeLabel");
              if (edgeLabel) {
                const rawId =
                  edgeLabel.getAttribute("data-id") ??
                  edgeLabel.querySelector("[data-id]")?.getAttribute("data-id") ??
                  null;
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
            }
          } else if (currentNode.classList?.contains("edgeLabel")) {
            // Walk up to the <g class="edgeLabel"> container if we landed on
            // a child element (e.g. <span class="edgeLabel"> inside foreignObject).
            const edgeLabelG = currentNode.closest("g.edgeLabel") as Element | null;
            const labelEl = edgeLabelG || currentNode;
            const rawId =
              labelEl.getAttribute("data-id") ??
              labelEl.querySelector("[data-id]")?.getAttribute("data-id") ??
              null;
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
            if (!nodeId) {
              const path =
                labelEl.parentElement?.querySelector(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ) || (labelEl as Element).previousElementSibling;
              if (path && path.id) nodeId = path.id;
            }
            // Fallback: find edge path by matching position in edgeLabels container
            if (!nodeId && containerRef.current) {
              const labelsContainer = containerRef.current.querySelector(
                "g.edgeLabels",
              );
              if (labelsContainer) {
                const allLabels = Array.from(
                  labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                );
                const labelIdx = allLabels.indexOf(labelEl);
                if (labelIdx >= 0) {
                  const edgePathsContainer = containerRef.current.querySelector(
                    "g.edgePaths",
                  );
                  if (edgePathsContainer) {
                    const allPaths = Array.from(
                      edgePathsContainer.querySelectorAll(
                        "path.flowchart-link:not(.flowchart-link-hit-target)",
                      ),
                    );
                    if (labelIdx < allPaths.length && allPaths[labelIdx].id) {
                      nodeId = allPaths[labelIdx].id;
                    }
                  }
                }
              }
            }
          } else {
            nodeId = currentNode.id;
            if (!nodeId) {
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
          const lineEl = findOwningLineForSequenceLabel(currentNode, allMsgLines);
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
          const allNotes = getSortedNoteTextEls(containerRef.current || document.body);
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
          const allNoteTexts = getSortedNoteTextEls(containerRef.current || document.body);
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
            nodeId.startsWith("STATE_EDGE_") ||
            nodeId.startsWith("MINDMAP_")
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
            const rawId =
              labelEl.getAttribute("data-id") ??
              labelEl.querySelector("[data-id]")?.getAttribute("data-id") ??
              null;
            const hasText = labelEl.textContent?.trim() !== "";
            return hasText && rawId !== null && normalizeId(rawId) === cleanId;
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
          const resolved = containerRef.current
            ? resolveCompactActorElement(containerRef.current, currentNode, null)
            : currentNode;
          if (resolved !== currentNode) {
            currentNode = resolved as SVGElement;
          }
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
          const visuals =
            sequenceMessageVisualsRef.current.length > 0
              ? sequenceMessageVisualsRef.current
              : buildSequenceMessageVisualModel(
                  containerRef.current,
                  code,
                  getSequenceMessageEntries,
                  findOwningLineForSequenceLabel,
                );
          const visual = visuals[idx];
          if (visual) {
            const pairedTextEl = visual.labelEls[0] || null;
            if (pairedTextEl && !pairedTextEl.id) pairedTextEl.id = `seq-msg-${idx}`;

            const lineRect = visual.lineRect;
            const labelRect = visual.labelRect;
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
              rawSvgId = pairedTextEl?.id || visual.lineEl?.id || rawSvgId;
            }
          }
        }

        // For sequence notes, use the full rect.note box for the selection outline.
        // The foundElement is .noteText (for editing), but visually we want the yellow box bounds.
        if (cleanId && cleanId.startsWith("SEQ_NOTE_")) {
          const idx = parseInt(cleanId.replace("SEQ_NOTE_", ""), 10);
          const allNoteTexts = getSortedNoteTextEls(containerRef.current);
          const noteTextEl =
            allNoteTexts[idx] || (currentNode.classList?.contains("noteText") ? currentNode : null);
          if (noteTextEl) {
            const rectNote = getSequenceNoteRectForText(noteTextEl);
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
      code,
      determineDiagramType,
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
  const DOUBLE_CLICK_MS = 500;
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  // Set to true when click(detail=2) already handled the dblclick gesture so the capture-phase
  // native dblclick listener knows to skip — prevents double-invocation of handleEditClick.
  const dblClickHandledRef = useRef(false);
  // When handleSvgClick resolves a node via bounding-box heuristics (e.g. off-center edge labels
  // where elementsFromPoint hits the SVG background), we stash it here so handleEditClick can
  // use the resolved result instead of re-resolving via elementsFromPoint.
  const pendingEditTargetRef = useRef<{
    cleanId: string | null;
    rawSvgId: string;
    newSelectionBox: { x: number; y: number; width: number; height: number };
    newTextBox: { x: number; y: number; width: number; height: number };
  } | null>(null);
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

      // Resolve actual SVG element via elementsFromPoint to bypass overlay divs.
      // EXCEPTION: when invoked from a floating toolbar (e.g. the Rename button), the cursor is
      // over the toolbar — NOT the diagram element — so elementsFromPoint would resolve to whatever
      // SVG sits behind the toolbar (e.g. an actor header) and edit the WRONG element. In that case
      // we keep the currently-selected node and its existing selection/text boxes.
      // SECOND EXCEPTION: when invoked from handleSvgClick's double-click detection, the caller
      // may already have resolved the target via bounding-box heuristics (e.g. off-center edge
      // labels). We prefer that resolved result over elementsFromPoint since elementsFromPoint
      // bypasses pointer-events: none elements and hits the SVG background instead.
      const fromToolbar = Boolean(
        (e.target as Element | null)?.closest?.("[data-inline-toolbar], [data-scale-lock]"),
      );
      const pendingResult = pendingEditTargetRef.current;
      pendingEditTargetRef.current = null;

      let targetElement = e.target as Element;
      if (!fromToolbar && "clientX" in e && "clientY" in e) {
        const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
        const svgElementsAtPoint = elementsAtPoint.filter(
          (el) =>
            el.tagName.toLowerCase() !== "div" && el.namespaceURI === "http://www.w3.org/2000/svg",
        );
        // Find an element that is or has a .node ancestor.
        // elementsFromPoint returns elements from front-to-back (top of z-order first).
        // We want the first (topmost) element that is part of a node.
        const insideNode = svgElementsAtPoint.find(
          (el) => el.classList?.contains("node") || el.closest?.(".node"),
        );
        if (insideNode) {
          targetElement = insideNode;
        } else {
          const svgElement = svgElementsAtPoint[0];
          if (svgElement) {
            targetElement = svgElement;
          } else {
            const firstEl = elementsAtPoint[0];
            if (firstEl) targetElement = firstEl;
          }
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
        setSelectedSvgIdWithRef(null);

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

      let result = pendingResult ?? (fromToolbar ? null : getClickedNode(targetElement));
      if (
        result?.rawSvgId &&
        !fromToolbar &&
        "clientX" in e &&
        "clientY" in e &&
        containerRef.current
      ) {
        const selectedEl = containerRef.current.querySelector(
          `#${CSS.escape(result.rawSvgId)}`,
        ) as SVGElement | null;
        if (selectedEl?.classList?.contains("cluster")) {
          // Check if ANY node in the diagram is at the click point.
          // If so, prefer that node over the cluster (topmost element wins).
          const allNodes = Array.from(
            containerRef.current.querySelectorAll(".node"),
          ) as SVGElement[];
          for (const node of allNodes) {
            const rect = node.getBoundingClientRect();
            if (
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom
            ) {
              result = getClickedNode(node);
              break;
            }
          }
        }
      }

      // Use ref for selectedNodeId to avoid stale closure
      let targetNodeId = selectedNodeIdRef.current;

      // STATE MACHINE: handle EDIT_MODE → EDIT_MODE transitions (cross-element or empty-space double-click)
      if (isInlineEditing) {
        if (!result) {
          // For flowcharts/graphs, a null result on empty-space double-click is not meaningful
          // (it may happen when onDoubleClick fires after handleSvgClick already entered edit
          // mode and the click resolved to the SVG background). Only commit+exit for sequence.
          if (currentType === "sequence") {
            commitEditRef.current?.();
            setIsInlineEditing(false);
            return;
          }
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
        setSelectedSvgIdWithRef(result.rawSvgId);
        targetNodeId = result.cleanId;
      } else if (targetNodeId && containerRef.current && !fromToolbar) {
        // Edge label fallback: when the click resolved to the SVG background (because the
        // edgeLabel has pointer-events: none), we still have the valid targetNodeId from
        // the initial selection. Verify it exists in the DOM for text extraction, but
        // DON'T recompute selectionBox/textBox since they are already correct from the
        // prior selection (or will be restored by InlineTextEditor if needed).
        const candidates = Array.from(
          containerRef.current.querySelectorAll(
            ".node, .cluster, path.flowchart-link:not(.flowchart-link-hit-target), .edgeLabel",
          ),
        ) as SVGElement[];
        let foundMatch = false;
        for (const candidate of candidates) {
          let candidateId = candidate.id;
          if (candidate.classList?.contains("edgeLabel")) {
            const dataIdEl = candidate.querySelector("[data-id]");
            if (dataIdEl) {
              const rawId = dataIdEl.getAttribute("data-id");
              if (rawId) {
                const canonical = normalizeId(rawId);
                if (canonical === targetNodeId) {
                  candidateId = targetNodeId;
                }
              }
            }
          }
          if (candidateId && normalizeId(candidateId) === targetNodeId) {
            foundMatch = true;
            break;
          }
        }
        // If we can't find the candidate, targetNodeId is stale and we should bail
        if (!foundMatch) {
          return;
        }
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
          currentText =
            colonIdx !== -1
              ? noteLines[idx]
                  .substring(colonIdx + 1)
                  .trim()
                  .replace(/<br\s*\/?>/gi, "\n")
              : "";
        }
      } else if (targetNodeId.startsWith("SEQ_")) {
        currentText = targetNodeId.replace("SEQ_", "");
        currentText = currentText.replace(/<br\/>/g, "\n");
      } else if (isEdgeId(targetNodeId)) {
        // Distinguish a real edge (path / edgeLabel) from a node whose Mermaid
        // SVG id just happens to start with `L_` / `L-` / `e_` (e.g. a node
        // named `L_CF_AZ_CNAME`).
        const rawEl = result?.rawSvgId
          ? document.getElementById(result.rawSvgId)
          : selectedSvgIdRef.current
            ? document.getElementById(selectedSvgIdRef.current)
            : null;
        const isRealEdge =
          rawEl &&
          (rawEl.classList.contains("flowchart-link") ||
            rawEl.classList.contains("flowchart-link-hit-target") ||
            rawEl.classList.contains("edgeLabel"));

        if (isRealEdge) {
          // FIRST: Try to get the label from the SVG DOM (what the user
          // actually sees on the canvas). Mermaid renders edge labels in a
          // separate <g class="edgeLabels"> container, not as children of
          // the edge path.  Find the label by matching the edge-path's
          // position in <g class="edgePaths">.
          const effectiveRawSvgId = result?.rawSvgId ?? selectedSvgIdRef.current;
          if (effectiveRawSvgId && containerRef.current) {
            const edgePathsContainer = containerRef.current.querySelector(
              "g.edgePaths",
            );
            if (edgePathsContainer) {
              const allPaths = Array.from(
                edgePathsContainer.querySelectorAll(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ),
              );
              const labelsContainer = containerRef.current.querySelector(
                "g.edgeLabels",
              );
              const clickedPath = containerRef.current.querySelector(
                `#${CSS.escape(effectiveRawSvgId)}`,
              );
              let edgeIdx = -1;
              if (clickedPath) {
                if (clickedPath.classList.contains("flowchart-link-hit-target")) {
                  const actualPath = clickedPath.nextElementSibling as Element;
                  if (actualPath) edgeIdx = allPaths.indexOf(actualPath);
                } else if (clickedPath.classList.contains("flowchart-link")) {
                  edgeIdx = allPaths.indexOf(clickedPath);
                } else if (labelsContainer) {
                  // edgeLabel <g> — find by position in edgeLabels container
                  const allLabels = Array.from(
                    labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                  );
                  const labelG = clickedPath.closest("g.edgeLabel") as Element | null;
                  edgeIdx = labelG ? allLabels.indexOf(labelG) : allLabels.indexOf(clickedPath);
                }
              }
              if (edgeIdx >= 0 && labelsContainer) {
                const allLabels = Array.from(
                  labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                );
                const labelEl = allLabels[edgeIdx];
                if (labelEl) {
                  const labelDiv = labelEl.querySelector(
                    "foreignObject div, foreignObject span",
                  );
                  const labelText =
                    labelDiv?.textContent || labelEl.textContent;
                  if (labelText?.trim()) {
                    currentText = labelText.trim();
                  }
                }
              }
            }
          }

          // SECOND: If SVG lookup failed, fall back to the source-code regex.
          if (currentText === targetNodeId) {
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
                const match = matchFlowchartLinkLine(line, src, dst);
                if (match) {
                  if (currentOccurrence === occurrenceIndex) {
                    currentText = getLinkLabelFromMiddle(match[2]);
                    break;
                  }
                  currentOccurrence++;
                }
              }
            }
          }
        }
        // When the DOM element is not a real edge (it's a node), fall through
        // to the generic node-text extraction below so the user sees the actual
        // label instead of the raw SVG id.
      }
      if (
        !targetNodeId.startsWith("SEQ_") &&
        (!isEdgeId(targetNodeId) || currentText === targetNodeId)
      ) {
        const nodeRegex = new RegExp(
          `(^|[^a-zA-Z0-9_])(${targetNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
          "m",
        );
        const match = code.match(nodeRegex);
        if (match && match[3]) {
          currentText = match[3].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
        } else {
          const effectiveRawSvgId = result?.rawSvgId ?? selectedSvgIdRef.current;
          const innerText = effectiveRawSvgId
            ? document.querySelector(
                `#${effectiveRawSvgId} .label, #${effectiveRawSvgId} text, #${effectiveRawSvgId} foreignObject, #${effectiveRawSvgId} .nodeLabel`,
              )
            : null;
          if (innerText && innerText.textContent) {
            currentText = innerText.textContent.trim();
          }
          // Edge-label fallback: Mermaid renders edge labels in a separate
          // <g class="edgeLabels"> container (not as children of the edge path).
          // Find the label by matching the edge-path's position in the edgePaths
          // container (each edge has a hit-target + actual path, so label index
          // = path index / 2).
          if (
            currentText === targetNodeId &&
            effectiveRawSvgId &&
            isEdgeId(targetNodeId) &&
            containerRef.current
          ) {
            const edgePathsContainer = containerRef.current.querySelector(
              "g.edgePaths",
            );
            if (edgePathsContainer) {
              const allPaths = Array.from(
                edgePathsContainer.querySelectorAll(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ),
              );
              const clickedPath = containerRef.current.querySelector(
                `#${CSS.escape(effectiveRawSvgId)}`,
              );
              const edgeIdx = clickedPath
                ? allPaths.indexOf(
                    clickedPath.classList.contains("flowchart-link-hit-target")
                      ? (clickedPath.nextElementSibling as Element) ||
                          clickedPath
                      : clickedPath,
                  )
                : -1;
              if (edgeIdx >= 0) {
                const labelsContainer = containerRef.current.querySelector(
                  "g.edgeLabels",
                );
                if (labelsContainer) {
                  const allLabels = Array.from(
                    labelsContainer.querySelectorAll(
                      ":scope > g.edgeLabel",
                    ),
                  );
                  const labelEl = allLabels[edgeIdx];
                  if (labelEl) {
                    const labelDiv = labelEl.querySelector(
                      "foreignObject div, foreignObject span",
                    );
                    const labelText =
                      labelDiv?.textContent || labelEl.textContent;
                    if (labelText?.trim()) {
                      currentText = labelText.trim();
                    }
                  }
                }
              }
            }
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

      const target = e.target;
      if (!(target instanceof Element)) return;
      const container = containerRef.current;
      const containerRect = container?.getBoundingClientRect() ?? null;
      const scale = container && containerRect ? containerRect.width / container.offsetWidth : 1;
      const currentDiagramType = determineDiagramType(code);
      const canvasX = containerRect
        ? (e.clientX - containerRect.left + (container?.scrollLeft ?? 0)) / scale
        : 0;
      const canvasY = containerRect
        ? (e.clientY - containerRect.top + (container?.scrollTop ?? 0)) / scale
        : 0;
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

      const now = Date.now();
      const lastClick = lastClickRef.current;
      const isTimingDoubleClick = Boolean(
        clicked && lastClick?.id === clicked.cleanId && now - lastClick.time <= DOUBLE_CLICK_MS,
      );

      // Robust double-click entry: some Mermaid SVG/foreignObject targets do not
      // consistently dispatch React onDoubleClick or preserve click detail. Use click count
      // when available, then fall back to timing so repeated clicks on the same selected edge
      // still enter edit mode.
      if (
        (e.detail >= 2 || isTimingDoubleClick) &&
        clicked &&
        (clicked.cleanId === selectedNodeIdRef.current ||
          ((currentDiagramType === "flowchart" || currentDiagramType === "graph") &&
            isEdgeId(clicked.cleanId))) &&
        !isInlineEditing
      ) {
        debugLog("enter-edit-mode-double-click", clicked.cleanId);
        lastClickRef.current = null;
        pendingEditTargetRef.current = clicked;
        handleEditClick(e);
        return;
      }

      lastClickRef.current = clicked?.cleanId ? { id: clicked.cleanId, time: now } : null;

      // State transition rule:
      // - Same element while editing: keep editing.
      // - Different element/background while editing: commit current edit, then continue selection flow.
      // - For flowcharts, an empty-space result (!clicked) is never a meaningful "double-click on
      //   empty space" interaction because editing is always initiated from an explicit double-click
      //   or toolbar action. The result may be null when the click resolved to the svg background
      //   instead of a specific element (common when clicking off-centre on edge labels), so we
      //   skip the commit-and-exit for non-sequence diagrams.
      if (isInlineEditing) {
        if (clicked && clicked.cleanId === selectedNodeIdRef.current) {
          debugLog("stay-in-edit-mode", clicked.cleanId);
          // Prevent this mousedown from reaching document-level listeners (e.g.
          // InlineTextEditor's handleClickOutside) which would commit the edit and
          // close the editor immediately after opening it via the double-click.
          if ("stopPropagation" in e) e.stopPropagation();
          return;
        }
        if (!clicked && currentDiagramType !== "sequence") {
          debugLog("stay-in-edit-mode-null-result");
          return;
        }
        if (!clicked) {
          debugLog("commit-edit-on-empty-space");
          commitEditRef.current?.();
          setIsInlineEditing(false);
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
        clearSequenceMessageHoverHighlight();
        setSelectedNodeIdWithRef(clicked.cleanId);
        setSelectedSvgIdWithRef(clicked.rawSvgId);
        setSelectionBox(clicked.newSelectionBox);
        setTextBox(clicked.newTextBox);
      } else {
        // Message band fallback: clicking the empty connection area (between the line
        // and label) selects the message, mirroring how clicking the yellow note area
        // selects the note. Reuses getClickedNode on the band's messageText so the
        // selection box/text box are computed identically to a direct line/text click.
        if (container && currentDiagramType === "sequence") {
          const band = findSequenceMessageBandAtPoint(canvasX, canvasY);
          if (band) {
            const bandClicked = getClickedNode(band.el);
            if (bandClicked) {
              debugLog("select-band", bandClicked.cleanId);
              clearSequenceMessageHoverHighlight();
              setSelectedNodeIdWithRef(bandClicked.cleanId);
              setSelectedSvgIdWithRef(bandClicked.rawSvgId);
              setSelectionBox(bandClicked.newSelectionBox);
              setTextBox(bandClicked.newTextBox);
              return;
            }
          }
        }
        if (isCommentMode && onCanvasCommentPlace) {
          debugLog("place-canvas-comment", { canvasX, canvasY });
          onCanvasCommentPlace({ x: canvasX, y: canvasY });
          return;
        }
        debugLog("clear-selection");
        setSelectedNodeIdWithRef(null);
        setSelectedSvgIdWithRef(null);
        setSelectionBox(null);
        setTextBox(null);
      }
    },
    [
      clearSequenceMessageHoverHighlight,
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
      isCommentMode,
      onCanvasCommentPlace,
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
      const currentConnectionState = connectionStateRef.current;
      // Use the rect captured synchronously at event time. Falling back to a fresh
      // getBoundingClientRect() only when no pre-captured rect is provided (e.g.,
      // callers that don't go through the RAF throttle path).
      const containerRectForScale = capturedContainerRect ?? container.getBoundingClientRect();
      const scale = containerRectForScale.width / container.offsetWidth;
      const diagramType = determineDiagramType(code);
      const e = { clientX, clientY, target: eventTarget } as React.MouseEvent<HTMLDivElement>;

      if (isInlineEditing) {
        setHoveredSequenceActorBox(null);
        setHoveredSequenceNoteBox(null);
        setHoveredFlowchartNodeBox(null);
        setSequenceLifelineOverlay(null);
        clearSequenceMessageHoverHighlight();
        return;
      }

      const mouseX = (e.clientX - containerRectForScale.left + container.scrollLeft) / scale;
      const mouseY = (e.clientY - containerRectForScale.top + container.scrollTop) / scale;

      if (diagramType === "sequence") {
        lastSequencePointerRef.current = { clientX: e.clientX, clientY: e.clientY };
        // Floating-UI guard (mirror of handleSequenceHoverOver): the mousemove path
        // also drives sequence hover, and unlike onMouseOver it keeps firing while the
        // cursor sits over the inline toolbar. Without this, moving onto the style bar
        // hit-tests the message band BEHIND it and renders that message's hover overlay
        // (the "back connection" accidentally highlighting). Bail and clear hover when
        // the pointer is over any floating UI so the toolbar stays clean.
        const overFloatingUi = isSequenceMessageHoverSuppressedByFloatingUi(e.clientX, e.clientY);
        if (overFloatingUi) {
          setHoveredSequenceActorBox(null);
          setHoveredSequenceNoteBox(null);
          setHoveredFlowchartNodeBox(null);
          if (resolveHoveredSequenceMessageIndexAtPoint(e.clientX, e.clientY) === null) {
            clearSequenceMessageHoverHighlight();
          }
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
        syncSequenceMessageHoverAtPoint(e.clientX, e.clientY);
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

        if (
          currentConnectionState.active &&
          currentConnectionState.startNodeId?.startsWith("SEQ_ACTOR_")
        ) {
          setShapePicker(null);
          const sourceActorId = currentConnectionState.startNodeId.replace("SEQ_ACTOR_", "");
          const sourceLifeline = lifelines.find((l) => l.actorId === sourceActorId);
          if (!sourceLifeline) return;

          const sourceSlots = getSequenceAnchorSlots(sourceLifeline);
          const anchorY = currentConnectionState.anchorY ?? findNearestSlot(sourceSlots, mouseY);
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

          const nextConnectionState: ConnectionState = {
            ...connectionStateRef.current,
            isDragging: true,
            mousePos: {
              x: snapTargetPos?.x ?? mouseX,
              y: snappedAnchorY,
            },
            anchorY: snappedAnchorY,
            snapTargetId,
            snapTargetPos,
          };
          connectionStateRef.current = nextConnectionState;
          setConnectionState(nextConnectionState);
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
        } else if (!currentConnectionState.active) {
          setSequenceLifelineOverlay(null);
        }
      } else {
        setSequenceLifelineOverlay(null);
        setHoveredSequenceActorBox(null);
        setHoveredSequenceNoteBox(null);
      }

      if (currentConnectionState.active && currentConnectionState.startNodeId) {
        setShapePicker(null);
        const nextConnectionState: ConnectionState = {
          ...connectionStateRef.current,
          isDragging: true,
          mousePos: {
            x: mouseX,
            y: mouseY,
          },
        };
        connectionStateRef.current = nextConnectionState;
        setConnectionState(nextConnectionState);
      }
    },
    [
      containerRef,
      code,
      determineDiagramType,
      findNearestSlot,
      getSequenceAnchorSlots,
      getSequenceLifelines,
      selectedNodeId,
      getSelectedMessageOverlay,
      clearSequenceMessageHoverHighlight,
      resolveHoveredSequenceMessageIndexAtPoint,
      syncSequenceMessageHoverAtPoint,
      isInlineEditing,
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
      sequenceConnectionCommittedRef.current = false;
      const lifeline = getSequenceLifelines().find((l) => l.actorId === actorId);
      const nextConnectionState: ConnectionState = {
        active: true,
        startNodeId: `SEQ_ACTOR_${actorId}`,
        startPos: lifeline ? { x: lifeline.x, y: anchorY } : null,
        mousePos: { x: 0, y: anchorY },
        isDragging: false,
        snapTargetId: null,
        snapTargetPos: null,
        anchorY,
      };
      connectionStateRef.current = nextConnectionState;
      setConnectionState(nextConnectionState);
    },
    [getSequenceLifelines],
  );

  const clearConnectionState = useCallback(() => {
    const clearedConnectionState: ConnectionState = {
      active: false,
      startNodeId: null,
      startPos: null,
      mousePos: null,
      isDragging: false,
      snapTargetId: null,
      snapTargetPos: null,
      anchorY: null,
    };
    connectionStateRef.current = clearedConnectionState;
    setConnectionState(clearedConnectionState);
  }, []);

  const finalizeSequenceConnection = useCallback(() => {
    const currentConnectionState = connectionStateRef.current;
    if (
      !currentConnectionState.active ||
      !currentConnectionState.startNodeId?.startsWith("SEQ_ACTOR_")
    ) {
      return false;
    }

    if (sequenceConnectionCommittedRef.current) {
      clearConnectionState();
      setSequenceLifelineOverlay(null);
      return true;
    }

    sequenceConnectionCommittedRef.current = true;
    const targetId = currentConnectionState.snapTargetId;
    if (targetId) {
      const insertIndex =
        currentConnectionState.anchorY !== null
          ? getSequenceInsertIndexForAnchor(currentConnectionState.anchorY)
          : undefined;
      handleAddNodeFromSelected(
        currentConnectionState.startNodeId,
        targetId,
        undefined,
        insertIndex,
      );
    }

    clearConnectionState();
    setSequenceLifelineOverlay(null);
    return true;
  }, [clearConnectionState, getSequenceInsertIndexForAnchor, handleAddNodeFromSelected]);

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const currentConnectionState = connectionStateRef.current;
      setHoveredFlowchartNodeBox(null);
      if (currentConnectionState.active && currentConnectionState.startNodeId) {
        const diagramType = determineDiagramType(code);
        if (currentConnectionState.isDragging) {
          if (
            diagramType === "sequence" &&
            currentConnectionState.startNodeId.startsWith("SEQ_ACTOR_")
          ) {
            finalizeSequenceConnection();
            return;
          } else {
            const result = getClickedNode(e.target as Element);
            if (result && result.cleanId && result.cleanId !== currentConnectionState.startNodeId) {
              handleAddNodeFromSelected(currentConnectionState.startNodeId, result.cleanId);
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
                    startNodeId: currentConnectionState.startNodeId,
                  });
                }
              }
            }
          }
        }
        clearConnectionState();
      }
      setSequenceLifelineOverlay(null);

      if (determineDiagramType(code) === "sequence") {
        syncSequenceMessageHoverAtPoint(e.clientX, e.clientY);
      } else {
        clearSequenceMessageHoverHighlight();
      }
    },
    [
      clearConnectionState,
      finalizeSequenceConnection,
      getClickedNode,
      handleAddNodeFromSelected,
      code,
      determineDiagramType,
      containerRef,
      getSequenceInsertIndexForAnchor,
      clearSequenceMessageHoverHighlight,
      syncSequenceMessageHoverAtPoint,
    ],
  );

  useEffect(() => {
    const currentConnectionState = connectionStateRef.current;
    if (
      !currentConnectionState.active ||
      !currentConnectionState.isDragging ||
      !currentConnectionState.startNodeId?.startsWith("SEQ_ACTOR_")
    ) {
      return;
    }

    const onWindowMouseUp = () => {
      finalizeSequenceConnection();
    };

    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [connectionState, finalizeSequenceConnection]);

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
        const rawId =
          labelEl.getAttribute("data-id") ??
          labelEl.querySelector("[data-id]")?.getAttribute("data-id") ??
          null;
        if (rawId) return normalizeId(rawId);
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
      if (isInlineEditingRef.current) {
        container.querySelectorAll(".edge-hover-highlight").forEach((el) => {
          el.classList.remove("edge-hover-highlight");
        });
        return;
      }

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
          const rawId =
            label.getAttribute("data-id") ??
            label.querySelector("[data-id]")?.getAttribute("data-id") ??
            null;
          if (rawId && normalizeId(rawId) === canonicalEdgeId) {
            label.classList.add("edge-hover-highlight");
          }
        });
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (isInlineEditingRef.current) {
        container.querySelectorAll(".edge-hover-highlight").forEach((el) => {
          el.classList.remove("edge-hover-highlight");
        });
        return;
      }

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
          const rawId =
            label.getAttribute("data-id") ??
            label.querySelector("[data-id]")?.getAttribute("data-id") ??
            null;
          if (rawId && normalizeId(rawId) === relatedCanonicalId) {
            label.classList.add("edge-hover-highlight");
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
  }, [containerRef, svgContent, normalizeId, isInlineEditing]);

  // Capture-phase native dblclick listener: fires BEFORE any child element handlers,
  // bypassing toolbar buttons that call e.stopPropagation() on 'click' (not 'dblclick').
  // This ensures double-clicking when the toolbar overlaps the node still enters EDIT_MODE.
  // handleEditClick is idempotent — if already in EDIT_MODE for the same node, it no-ops.
  const handleEditClickRef = useRef(handleEditClick);
  handleEditClickRef.current = handleEditClick; // always current; updated every render

  useEffect(() => {
    if (isLocked) return;

    const handleNativeDblClick = (e: MouseEvent) => {
      const container = containerRef.current;
      const target = e.target as Node;

      // Handle dblclicks within the canvas container OR on the inline text
      // editor (which is rendered in a portal outside the container).  When
      // the user double-clicks an edge the second click may land on the
      // InlineTextEditor textarea that appeared after the first click — we
      // still want to enter (or stay in) edit mode for the selected edge.
      const insideCanvas = container?.contains(target) ?? false;
      const insideInlineEditor = (target as Element)?.closest?.("[data-scale-lock]");
      if (!insideCanvas && !insideInlineEditor) return;

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
    hoveredSequenceMessageIndex,
    hoveredSequenceNoteBox,
    hoveredFlowchartNodeBox,
    sequenceMessageTriggerAreas,
    sequenceBlockAreas,
    getSequenceBlockEntries,
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
    handleSequenceMessageHoverEnter,
    handleSequenceMessageHoverMove,
    handleSequenceMessageHoverLeave,
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
