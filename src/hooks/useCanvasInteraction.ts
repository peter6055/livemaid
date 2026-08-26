import { useState, useCallback, useRef, MutableRefObject, useEffect } from "react";
import { isEdgeId } from "@/lib/diagrams/utils";
import type { ShapeOption } from "@/lib/diagrams/flowchart";
import { getSortedSequenceNoteTextElements } from "@/lib/diagrams/sequence/notes";

import {
  buildSequenceMessageTriggerAreas,
  buildSequenceMessageVisualModel,
  findOwningLineForSequenceLabel,
  getSequenceBlockEntries,
  getSequenceMessageEntries,
  getVisibleSequenceMessageTexts,
  parseSequenceMessageActors,
  type SequenceBlockArea,
  type SequenceMessageVisual,
} from "@/lib/diagrams/sequence/geometry";
import {
  getSequenceParticipantEntries as getSequenceParticipantEntriesPure,
  normalizeSequenceLabel as normalizeSequenceLabelPure,
  getSequenceNoteEntries as getSequenceNoteEntriesPure,
  insertSequenceMessageAtIndex as insertSequenceMessageAtIndexPure,
  insertSequenceNoteAtIndex as insertSequenceNoteAtIndexPure,
  updateNotePosition as updateNotePositionPure,
  deleteSequenceNote as deleteSequenceNotePure,
} from "@/lib/diagrams/sequence/mutations";
import {
  isSequenceMessageHoverSuppressedByFloatingUi,
  useSequenceHover,
} from "@/hooks/useSequenceHover";
import { useSequenceConnectHandlers } from "@/components/editor/SequenceInteractions";
import { useSelectionState, type RecalcDeps } from "@/hooks/useSelectionState";
import { useNodeResolution } from "@/hooks/useNodeResolution";
import { useSequenceSelection } from "@/hooks/useSequenceSelection";
import { useInlineEditing } from "@/hooks/useInlineEditing";

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
  onShapeCommentPlace,
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
  onShapeCommentPlace?: (
    nodeId: string,
    selectionBox: { x: number; y: number; width: number; height: number },
  ) => void;
}) {
  const sequenceMessageVisualsRef = useRef<SequenceMessageVisual[]>([]);
  const recalcDepsRef = useRef<RecalcDeps | null>(null);
  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIdRef,
    setSelectedNodeIdWithRef,
    selectedSvgId,
    setSelectedSvgId,
    selectedSvgIdRef,
    setSelectedSvgIdWithRef,
    selectionBox,
    setSelectionBox,
    normalizeId,
    recalculateSelectionRef,
  } = useSelectionState({
    renderIdRef,
    code,
    svgContent,
    containerRef,
    sequenceMessageVisualsRef,
    recalcDepsRef,
  });
  const [textBox, setTextBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
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

  // getClickedNodeRef: populated after useNodeResolution runs further down.
  // Safe because handleEditClick (which reads it) only fires on user interaction.
  const getClickedNodeRef = useRef<
    (target: Element) => {
      cleanId: string | null;
      rawSvgId: string;
      newSelectionBox: { x: number; y: number; width: number; height: number };
      newTextBox: { x: number; y: number; width: number; height: number };
    } | null
  >(() => null);

  // pendingEditTargetRef is shared between handleSvgClick (writes) and handleEditClick (reads).
  const pendingEditTargetRef = useRef<{
    cleanId: string | null;
    rawSvgId: string;
    newSelectionBox: { x: number; y: number; width: number; height: number };
    newTextBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const {
    editingText,
    setEditingText,
    isInlineEditing,
    setIsInlineEditing,
    isInlineEditingRef,
    inlineInputRef,
    commitEditRef,
    handleEditClick,
  } = useInlineEditing({
    code,
    containerRef,
    determineDiagramType,
    getClickedNodeRef,
    setSelectedNodeIdWithRef,
    setSelectedSvgIdWithRef,
    selectedNodeIdRef,
    selectedSvgIdRef,
    setSelectionBox,
    setTextBox,
    normalizeId,
    pendingEditTargetRef,
  });

  const {
    hoveredSequenceActorBox,
    setHoveredSequenceActorBox,
    hoveredSequenceMessageBox,
    hoveredSequenceNoteBox,
    setHoveredSequenceNoteBox,
    hoveredSequenceMessageIndex,
    hoveredSequenceTargetsRef,
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
  } = useSequenceHover({
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
  });

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
    return getSequenceParticipantEntriesPure(code);
  }, [code]);

  const normalizeSequenceLabel = useCallback((value: string | null | undefined) => {
    return normalizeSequenceLabelPure(value);
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

    // Text glyphs (text.actor / tspan) carry the `actor` class but are NOT the shape. Resolve
    // them to the compact shape so the seq-actor- id + selection/editing boxes hug the real
    // object: prefer a sibling rect.actor (plain participants), then the closest ancestor group
    // (g.actor-man / g.actor for Actor/Boundary/Control/Entity/Database/Queue), then any ancestor
    // rect.actor. Database/queue render the label in a wrapper sibling to the cylinder group, so
    // when the ancestor walk fails we fall back to geometry: the actor shape whose horizontal
    // center matches the glyph's column (vertical closeness then disambiguates the top/bottom twin).
    if (candidate.tagName === "text" || candidate.tagName === "tspan") {
      const siblingRect = candidate.parentElement?.querySelector(
        ":scope > rect.actor",
      ) as SVGElement | null;
      if (siblingRect) return siblingRect;
      const group = candidate.closest("g.actor-man, g.actor") as SVGElement | null;
      if (group) return group;
      const ancestorRect = candidate.closest("rect.actor") as SVGElement | null;
      if (ancestorRect) return ancestorRect;
      const c = candidate.getBoundingClientRect();
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      let best: Element | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const el of Array.from(container.querySelectorAll("rect.actor, g.actor, g.actor-man"))) {
        const b = el.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) continue;
        const dx = Math.abs(b.left + b.width / 2 - cx);
        const dy = Math.abs(b.top + b.height / 2 - cy);
        const score = dx < 10 ? dy : dx * 4 + dy;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) return best;
      return candidate;
    }

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

  // Map a clicked Mermaid block-label element (`.loopText` for an opener label, `.sectionTitle`
  // for an else/and/option divider label) back to its SOURCE line so the label can be renamed
  // inline. Mermaid does NOT paint these labels in source order (inner/nested blocks paint first),
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
      return insertSequenceMessageAtIndexPure(sourceCode, messageLine, messageIndex);
    },
    [],
  );

  const getSequenceMessageLineByIndex = useCallback(
    (idx: number) => {
      const entries = getSequenceMessageEntries(code);
      return entries[idx]?.line || null;
    },
    [code, getSequenceMessageEntries],
  );

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
    return getSequenceNoteEntriesPure(sourceCode);
  }, []);

  const { triggerHoveredSequenceMessageSelection, triggerHoveredSequenceNoteSelection } =
    useSequenceSelection({
      code,
      containerRef,
      setSelectedNodeIdWithRef,
      setSelectedSvgIdWithRef,
      setSelectionBox,
      setTextBox,
      getSequenceNoteEntries,
      getSequenceMessageLineByIndex,
      inlineInputRef,
      setEditingText,
      setIsInlineEditing,
      findNearestLineForText,
      clearSequenceMessageHoverHighlight,
      hoveredSequenceTargetsRef,
      sequenceMessageVisualsRef,
    });

  function getSortedNoteTextEls(container: ParentNode | null | undefined) {
    return getSortedSequenceNoteTextElements(container);
  }

  // Populate recalcDepsRef for useSelectionState's recalculateSelection callback.
  // All shared functions are now defined; the ref is read at invocation time.
  recalcDepsRef.current = {
    setTextBox,
    getSequenceParticipantEntries,
    resolveCompactActorElement,
    getSortedNoteTextEls,
    getSequenceLifelines,
    getSequenceTextElsForLine,
  };

  // Insert a note at a specific message index
  const insertSequenceNoteAtIndex = useCallback(
    (
      sourceCode: string,
      position: "left" | "right" | "over",
      participant: string,
      messageIndex: number,
    ) => {
      return insertSequenceNoteAtIndexPure(sourceCode, position, participant, messageIndex);
    },
    [],
  );

  // Update note position (e.g., from "left" to "right")
  const updateNotePosition = useCallback(
    (sourceCode: string, noteIndex: number, newPosition: "left" | "right" | "over") => {
      return updateNotePositionPure(sourceCode, noteIndex, newPosition);
    },
    [],
  );

  // Delete a note
  const deleteSequenceNote = useCallback((sourceCode: string, noteIndex: number) => {
    return deleteSequenceNotePure(sourceCode, noteIndex);
  }, []);
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

  const { getClickedNode } = useNodeResolution({
    code,
    containerRef,
    determineDiagramType,
    normalizeId,
    resolveSequenceActorIdFromDisplayName,
    getSequenceLifelines,
    getSvgTextDisplayName,
    getSequenceParticipantEntries,
    findNearestLineForText,
    getSequenceTextElsForLine,
    normalizeSequenceLabel,
    resolveCompactActorElement,
    getSortedNoteTextEls,
    sequenceMessageVisualsRef,
  });

  // Populate the ref now that useNodeResolution has defined getClickedNode.
  getClickedNodeRef.current = getClickedNode;

  // requestAnimationFrame handle for throttling mousemove
  const mouseMoveRafRef = useRef<number | null>(null);
  const mouseMoveInnerRef = useRef<
    ((x: number, y: number, t: EventTarget | null, r: DOMRect | null) => void) | null
  >(null);

  const DOUBLE_CLICK_MS = 500;
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  // Set to true when click(detail=2) already handled the dblclick gesture so the capture-phase
  // native dblclick listener knows to skip — prevents double-invocation of handleEditClick.
  const dblClickHandledRef = useRef(false);

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
        target.closest("[data-inline-editor]") ||
        target.closest("[data-class-text-editor]") ||
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

      // Comment mode takes priority over selection: clicking a shape while adding a
      // comment should attach the comment to that shape, not select it.
      if (isCommentMode && clicked?.cleanId && onShapeCommentPlace) {
        onShapeCommentPlace(clicked.cleanId, clicked.newSelectionBox);
        return;
      }

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
            if (bandClicked?.cleanId) {
              if (isCommentMode && onShapeCommentPlace) {
                onShapeCommentPlace(bandClicked.cleanId, bandClicked.newSelectionBox);
                return;
              }
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
      onShapeCommentPlace,
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

  const { startSequenceConnection, clearConnectionState, finalizeSequenceConnection } =
    useSequenceConnectHandlers({
      connectionStateRef,
      sequenceConnectionCommittedRef,
      setConnectionState,
      getSequenceLifelines,
      setSequenceLifelineOverlay,
      getSequenceInsertIndexForAnchor,
      handleAddNodeFromSelected,
    });

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
    setSelectedNodeIds: () => {},
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
    setDragState: () => {},
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
