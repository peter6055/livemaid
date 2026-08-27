"use client";

import { useState, type RefObject } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import {
  findTimelineSvgElementByNodeId,
  getTimelineDirection,
  getTimelineNode,
  parseTimeline,
  timelineRenderOrder,
  timelineSubtreeIds,
  type TimelineNodeKind,
  type TimelinePeriodNode,
  type TimelineSectionNode,
} from "@/lib/diagrams/timeline";
import { selectTimelineDropTarget } from "@/lib/diagrams/timeline/dropTarget";
import type {
  TimelineReorderNode,
  TimelineReorderSlot,
  TimelineSectionBounds,
} from "./canvasTypes";

interface TimelineReorderState {
  fromId: string;
  fromKind: TimelineNodeKind;
  cursorX: number;
  cursorY: number;
  nodes: TimelineReorderNode[];
  contentBounds: { minX: number; minY: number; maxX: number; maxY: number };
  slots: TimelineReorderSlot[];
  /** Node ids that travel with the dragged node (its whole subtree for sections/periods). */
  movingIds: string[];
  /** Styled ghost copy of the dragged node following the cursor. */
  ghost: { w: number; h: number; label: string; section?: boolean } | null;
  /** Accumulated auto-pan offset (content moved via setTransform) applied to captured coords. */
  pan: { dx: number; dy: number };
  targetId: string | null;
  placement: "before" | "after" | null;
  /** Bounding boxes of every section container, used for section highlight on period drag. */
  sectionBounds: TimelineSectionBounds[];
  /** Id of the section currently highlighted during a period boundary drag. */
  highlightedSectionId: string | null;
}

interface TimelineReorderMachineDeps {
  canvasShellRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  transformInstanceRef: RefObject<ReactZoomPanPinchRef | null>;
  code: string;
  selectedNodeId: string | null;
  handleSvgClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDeselect?: () => void;
  onTimelineMove?: (sourceId: string, targetId: string, placement: "before" | "after") => void;
}

/**
 * Owns the viewport-space timeline node reorder drag machine: its state atom and the mousedown
 * starter function. Moved verbatim out of EditorCanvas (via SequenceInteractions).
 */
export function useTimelineReorderMachine({
  canvasShellRef,
  containerRef,
  transformInstanceRef,
  code,
  selectedNodeId,
  handleSvgClick,
  onDeselect,
  onTimelineMove,
}: TimelineReorderMachineDeps) {
  // Viewport-space (canvasShellRef-relative) state for dragging a selected timeline node's grip to
  // reorder it before/after another node. Lives outside the TransformWrapper; canvas panning is
  // disabled while active (mirrors seqReorder). `nodes` holds every node's live screen-space box so
  // target resolution and the drop indicator share one consistent coordinate system.
  const [timelineReorder, setTimelineReorder] = useState<TimelineReorderState | null>(null);
  // Begin dragging a timeline node to reorder it before/after another node (sequence-style
  // direct-drag — no select-first). Node boxes are captured live from the DOM in viewport
  // (canvasShellRef-relative) space so pan/zoom never distorts coordinates (panning is also
  // disabled while active). Drops are same-kind only (section → section, period → period,
  // event → event). Sections and periods keep the boundary/gap drop behaviour; child events get
  // a column-centered guide inside the hovered parent period column (issue #8). Click without
  // drag selects the node (handle is excluded from the document-capture selector).
  const startTimelineReorderDrag = (e: React.MouseEvent<HTMLDivElement>, fromId: string) => {
    e.stopPropagation();
    const shell = canvasShellRef.current;
    const container = containerRef.current;
    if (!shell || !container) return;
    const shellRect = shell.getBoundingClientRect();
    const horizontal = getTimelineDirection(code) === "LR";
    const nodes: TimelineReorderNode[] = [];
    for (const entry of timelineRenderOrder(code)) {
      const el = findTimelineSvgElementByNodeId(code, container, entry.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      nodes.push({
        id: entry.id,
        kind: entry.kind,
        x: r.left - shellRect.left,
        y: r.top - shellRect.top,
        w: r.width,
        h: r.height,
      });
    }

    const selectFromNode = () => {
      const el = findTimelineSvgElementByNodeId(code, container, fromId);
      if (!el) return;
      const syntheticEvent = {
        target: el,
        currentTarget: container,
        detail: e.detail,
        clientX: e.clientX,
        clientY: e.clientY,
        stopPropagation: () => {},
        preventDefault: () => {},
      } as unknown as React.MouseEvent<HTMLDivElement>;
      handleSvgClick(syntheticEvent);
    };

    const source = nodes.find((n) => n.id === fromId);
    if (!source || nodes.length < 2) {
      selectFromNode();
      return;
    }

    const startClientX = e.clientX;
    const startClientY = e.clientY;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    const contentBounds = { minX, minY, maxX, maxY };
    const contentW = Math.max(0, maxX - minX);
    const contentH = Math.max(0, maxY - minY);

    // Map every event to its parent period node so the drag can resolve the "column" (the
    // unioned bounds of a period and its events) that a target event belongs to.
    const eventParent = new Map<string, string>();
    const periodNodes = new Map<string, TimelineReorderNode>();
    const parsedTimeline = parseTimeline(code);
    const walkPeriod = (period: TimelinePeriodNode) => {
      const pnode = nodes.find((n) => n.id === period.id);
      if (pnode) periodNodes.set(period.id, pnode);
      for (const ev of period.events) eventParent.set(ev.id, period.id);
    };
    for (const section of parsedTimeline.sections) {
      for (const period of section.periods) walkPeriod(period);
    }
    for (const period of parsedTimeline.defaultPeriods) walkPeriod(period);

    // Compute bounding boxes for each section (section node + its periods + their events).
    const sectionBounds: TimelineSectionBounds[] = [];
    const periodToSection = new Map<string, TimelineSectionNode>();
    for (const sec of parsedTimeline.sections) {
      for (const p of sec.periods) periodToSection.set(p.id, sec);
    }
    for (const sec of parsedTimeline.sections) {
      const sn = nodes.find((n) => n.id === sec.id);
      if (!sn) continue;
      let sx1 = sn.x,
        sy1 = sn.y,
        sx2 = sn.x + sn.w,
        sy2 = sn.y + sn.h;
      for (const p of sec.periods) {
        const pn = nodes.find((n) => n.id === p.id);
        if (!pn) continue;
        sx1 = Math.min(sx1, pn.x);
        sy1 = Math.min(sy1, pn.y);
        sx2 = Math.max(sx2, pn.x + pn.w);
        sy2 = Math.max(sy2, pn.y + pn.h);
        for (const ev of p.events) {
          const en = nodes.find((n) => n.id === ev.id);
          if (!en) continue;
          sx1 = Math.min(sx1, en.x);
          sy1 = Math.min(sy1, en.y);
          sx2 = Math.max(sx2, en.x + en.w);
          sy2 = Math.max(sy2, en.y + en.h);
        }
      }
      sectionBounds.push({
        sectionId: sec.id,
        label: sec.label,
        x: sx1,
        y: sy1,
        w: sx2 - sx1,
        h: sy2 - sy1,
      });
    }

    const SLOT_THICK = 22;
    const HIT_TOL = 34;
    const inset = 5;
    const slots: TimelineReorderSlot[] = [];

    for (const n of nodes) {
      if (n.id === fromId) continue;
      // Same-kind drops only: no cross-kind dragging.
      if (source.kind === "section" && n.kind !== "section") continue;
      if (source.kind === "period" && n.kind !== "period") continue;
      if (source.kind === "event" && n.kind !== "event") continue;

      if (source.kind === "event") {
        // Child-event slots live inside the hovered parent period column: the marker spans the
        // column's cross-axis width and the guide centers on the column's cross-axis center.
        const parentId = eventParent.get(n.id);
        const period = parentId ? periodNodes.get(parentId) : undefined;
        if (!period) continue;
        const col = {
          x1: period.x,
          y1: period.y,
          x2: period.x + period.w,
          y2: period.y + period.h,
        };
        for (const m of nodes) {
          if (eventParent.get(m.id) !== parentId) continue;
          col.x1 = Math.min(col.x1, m.x);
          col.y1 = Math.min(col.y1, m.y);
          col.x2 = Math.max(col.x2, m.x + m.w);
          col.y2 = Math.max(col.y2, m.y + m.h);
        }
        const colCenter = horizontal ? (col.x1 + col.x2) / 2 : (col.y1 + col.y2) / 2;
        if (horizontal) {
          const beforeGuide = n.y - inset;
          const afterGuide = n.y + n.h + inset;
          slots.push({
            id: n.id,
            placement: "before",
            x: col.x1,
            y: beforeGuide - SLOT_THICK / 2,
            w: col.x2 - col.x1,
            h: SLOT_THICK,
            axis: "y",
            crossStart: col.x1,
            crossEnd: col.x2,
            guidePos: colCenter,
            spanStart: col.y1,
            spanEnd: col.y2,
            columnMode: true,
            hitTol: n.h + HIT_TOL,
          });
          slots.push({
            id: n.id,
            placement: "after",
            x: col.x1,
            y: afterGuide - SLOT_THICK / 2,
            w: col.x2 - col.x1,
            h: SLOT_THICK,
            axis: "y",
            crossStart: col.x1,
            crossEnd: col.x2,
            guidePos: colCenter,
            spanStart: col.y1,
            spanEnd: col.y2,
            columnMode: true,
            hitTol: n.h + HIT_TOL,
          });
        } else {
          // TD: events stack vertically (same X, different Y). Hit slots must be Y-axis bands;
          // X-axis bands collapse because every event shares the same x. guidePos is the insert
          // gap Y so the horizontal column guide sits between events; spanStart/spanEnd are the
          // column X extent.
          const beforeGuide = n.y - inset;
          const afterGuide = n.y + n.h + inset;
          slots.push({
            id: n.id,
            placement: "before",
            x: col.x1,
            y: beforeGuide - SLOT_THICK / 2,
            w: col.x2 - col.x1,
            h: SLOT_THICK,
            axis: "y",
            crossStart: col.x1,
            crossEnd: col.x2,
            guidePos: beforeGuide,
            spanStart: col.x1,
            spanEnd: col.x2,
            columnMode: true,
            hitTol: n.h + HIT_TOL,
          });
          slots.push({
            id: n.id,
            placement: "after",
            x: col.x1,
            y: afterGuide - SLOT_THICK / 2,
            w: col.x2 - col.x1,
            h: SLOT_THICK,
            axis: "y",
            crossStart: col.x1,
            crossEnd: col.x2,
            guidePos: afterGuide,
            spanStart: col.x1,
            spanEnd: col.x2,
            columnMode: true,
            hitTol: n.h + HIT_TOL,
          });
        }
        continue;
      }

      // Sections / periods: keep the existing boundary/gap drop behaviour.
      if (horizontal) {
        const beforeGuide = n.x - inset;
        const afterGuide = n.x + n.w + inset;
        slots.push({
          id: n.id,
          placement: "before",
          x: beforeGuide - SLOT_THICK / 2,
          y: minY,
          w: SLOT_THICK,
          h: contentH,
          axis: "x",
          crossStart: minY,
          crossEnd: maxY,
          guidePos: beforeGuide,
          spanStart: minY,
          spanEnd: maxY,
          columnMode: false,
        });
        slots.push({
          id: n.id,
          placement: "after",
          x: afterGuide - SLOT_THICK / 2,
          y: minY,
          w: SLOT_THICK,
          h: contentH,
          axis: "x",
          crossStart: minY,
          crossEnd: maxY,
          guidePos: afterGuide,
          spanStart: minY,
          spanEnd: maxY,
          columnMode: false,
        });
      } else {
        const beforeGuide = n.y - inset;
        const afterGuide = n.y + n.h + inset;
        slots.push({
          id: n.id,
          placement: "before",
          x: minX,
          y: beforeGuide - SLOT_THICK / 2,
          w: contentW,
          h: SLOT_THICK,
          axis: "y",
          crossStart: minX,
          crossEnd: maxX,
          guidePos: beforeGuide,
          spanStart: minX,
          spanEnd: maxX,
          columnMode: false,
        });
        slots.push({
          id: n.id,
          placement: "after",
          x: minX,
          y: afterGuide - SLOT_THICK / 2,
          w: contentW,
          h: SLOT_THICK,
          axis: "y",
          crossStart: minX,
          crossEnd: maxX,
          guidePos: afterGuide,
          spanStart: minX,
          spanEnd: maxX,
          columnMode: false,
        });
      }
    }
    if (slots.length === 0) {
      selectFromNode();
      return;
    }

    // The node set that moves with the source (whole subtree for sections/periods).
    const movingIds = timelineSubtreeIds(code, fromId);

    // Styled ghost preview of the dragged node following the cursor.
    const draggedNode = getTimelineNode(code, fromId);
    const ghost = {
      w: Math.max(source.w, 48),
      h: Math.max(source.h, 24),
      label: draggedNode?.label ?? "Element",
      section: source.kind === "section",
    };

    e.preventDefault();

    // Boundary-aware drop targeting (issue #15): rival slots near a section boundary are
    // arbitrated by which section's visible bounds sit closest to the cursor, so the
    // indicator flips at the boundary instead of at a slot-centre midpoint.
    const sourceSectionId = periodToSection.get(fromId)?.id ?? null;
    const findTarget = (cursorX: number, cursorY: number) =>
      selectTimelineDropTarget({
        slots,
        sectionBounds,
        sectionOfNode: (nodeId) => periodToSection.get(nodeId)?.id ?? null,
        sourceSectionId,
        cursorX,
        cursorY,
        crossTolX: HIT_TOL,
        crossTolY: HIT_TOL,
      });

    // Auto-scroll: pan the canvas when the cursor nears the shell edges (issue scope).
    // positionX/Y are content translations (positive positionX renders the content further
    // RIGHT on screen), so revealing more content past an edge requires shifting the content
    // toward the OPPOSITE screen direction: drag right → dx negative (content moves left),
    // drag left → dx positive, drag bottom → dy negative (content moves up), drag top → dy
    // positive. Returns the applied pan delta (screen px) so callers can offset the coords
    // captured at drag start.
    const EDGE_MARGIN = 64;
    const PAN_SPEED = 16;
    const panStep = (cursorX: number, cursorY: number): { dx: number; dy: number } => {
      const inst = transformInstanceRef.current;
      if (!inst) return { dx: 0, dy: 0 };
      let vx = 0;
      let vy = 0;
      if (cursorX < EDGE_MARGIN) vx = 1 - cursorX / EDGE_MARGIN;
      else if (cursorX > shellRect.width - EDGE_MARGIN)
        vx = -(1 - (shellRect.width - cursorX) / EDGE_MARGIN);
      if (cursorY < EDGE_MARGIN) vy = 1 - cursorY / EDGE_MARGIN;
      else if (cursorY > shellRect.height - EDGE_MARGIN)
        vy = -(1 - (shellRect.height - cursorY) / EDGE_MARGIN);
      if (vx === 0 && vy === 0) return { dx: 0, dy: 0 };
      const dx = vx * PAN_SPEED;
      const dy = vy * PAN_SPEED;
      inst.setTransform(inst.state.positionX + dx, inst.state.positionY + dy, inst.state.scale, 0);
      return { dx, dy };
    };

    let dragging = false;
    let panDelta = { dx: 0, dy: 0 };
    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
        if (selectedNodeId && selectedNodeId !== fromId) {
          onDeselect?.();
        }
      }
      if (!dragging) return;
      ev.preventDefault();
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      const step = panStep(cursorX, cursorY);
      if (step.dx !== 0 || step.dy !== 0) {
        panDelta = { dx: panDelta.dx + step.dx, dy: panDelta.dy + step.dy };
      }
      const selection = findTarget(cursorX - panDelta.dx, cursorY - panDelta.dy);
      const target = selection.target;
      let highlightedSectionId: string | null = null;
      if (target) {
        const sec = periodToSection.get(target.id);
        if (sec) highlightedSectionId = sec.id;
      } else if (sourceSectionId && selection.cursorInSectionId === sourceSectionId) {
        // No pending move — the cursor rests inside the home section, so glow it (stay).
        highlightedSectionId = sourceSectionId;
      }
      setTimelineReorder({
        fromId,
        fromKind: source.kind,
        cursorX,
        cursorY,
        nodes,
        contentBounds,
        slots,
        movingIds,
        ghost,
        pan: panDelta,
        targetId: target?.id ?? null,
        placement: target?.placement ?? null,
        sectionBounds,
        highlightedSectionId,
      });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragging) {
        const cursorX = ev.clientX - shellRect.left;
        const cursorY = ev.clientY - shellRect.top;
        const selection = findTarget(cursorX - panDelta.dx, cursorY - panDelta.dy);
        if (selection.target) {
          onTimelineMove?.(fromId, selection.target.id, selection.target.placement);
        }
      } else {
        selectFromNode();
      }
      setTimelineReorder(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  return {
    timelineReorder,
    startTimelineReorderDrag,
  };
}

/**
 * Preview/drop overlay for {@link useTimelineReorderMachine}: hatched candidate slots, active
 * highlight, section boundary glow, moving-subtree outline, cursor/column placement guide and
 * drag ghost. Rendered by EditorCanvas outside the TransformWrapper (viewport-relative), so
 * pan/zoom never shifts it.
 */
export function TimelineReorderOverlay({
  timelineReorder,
  code,
}: {
  timelineReorder: TimelineReorderState;
  code: string;
}) {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-30"
      data-timeline-reorder-overlay
      data-timeline-reorder-target={timelineReorder.targetId ?? "none"}
      data-timeline-reorder-placement={timelineReorder.placement ?? "none"}
    >
      {/* Section boundary highlight — when dragging a period near section edges in
          horizontal mode, glow the container that will receive the drop. */}
      {(() => {
        const hl = timelineReorder.highlightedSectionId;
        const dir = getTimelineDirection(code);
        if (!hl || dir !== "LR" || timelineReorder.fromKind !== "period") return null;
        const sec = timelineReorder.sectionBounds.find((s) => s.sectionId === hl);
        if (!sec) return null;
        const pan = timelineReorder.pan;
        return (
          <div
            className="absolute rounded-lg pointer-events-none"
            data-timeline-section-highlight={hl}
            style={{
              left: sec.x + pan.dx - 3,
              top: sec.y + pan.dy - 3,
              width: sec.w + 6,
              height: sec.h + 6,
              border: "2.5px solid #4f46e5",
              background: "rgba(99,102,241,0.07)",
              boxShadow: "0 0 20px rgba(79,70,229,0.2)",
              borderRadius: 12,
              transition: "left 60ms linear, top 60ms linear",
            }}
          />
        );
      })()}

      {timelineReorder.slots.map((s) => {
        const active =
          timelineReorder.targetId === s.id && timelineReorder.placement === s.placement;
        const alpha = active ? 0.38 : 0.16;
        const w = active ? Math.min(s.w + 6, s.w * 1.6 + 2) : s.w;
        const h = active ? Math.min(s.h + 6, s.h * 1.6 + 2) : s.h;
        const horizontal = getTimelineDirection(code) === "LR";
        const pan = timelineReorder.pan;
        return (
          <div
            key={`timeline-drop-${s.id}-${s.placement}`}
            className="absolute rounded-md"
            style={{
              left: horizontal ? s.x + pan.dx + (s.w - w) / 2 : s.x + pan.dx,
              top: horizontal ? s.y + pan.dy : s.y + pan.dy + (s.h - h) / 2,
              width: horizontal ? w : s.w,
              height: horizontal ? s.h : h,
              border: active ? "2px solid #4f46e5" : "1.5px dashed #818cf8",
              backgroundImage: `repeating-linear-gradient(45deg, rgba(99,102,241,${alpha}) 0, rgba(99,102,241,${alpha}) 6px, transparent 6px, transparent 12px)`,
              transition:
                "left 60ms linear, top 60ms linear, width 60ms linear, height 60ms linear",
            }}
          />
        );
      })}

      {/* "What moves" preview — dashed outline around the dragged node's subtree. */}
      {(() => {
        const pan = timelineReorder.pan;
        const box = timelineReorder.nodes.filter((n) => timelineReorder.movingIds.includes(n.id));
        if (box.length === 0) return null;
        const x = Math.min(...box.map((n) => n.x)) + pan.dx;
        const y = Math.min(...box.map((n) => n.y)) + pan.dy;
        const x2 = Math.max(...box.map((n) => n.x + n.w)) + pan.dx;
        const y2 = Math.max(...box.map((n) => n.y + n.h)) + pan.dy;
        return (
          <div
            className="absolute pointer-events-none"
            data-timeline-reorder-moving
            style={{
              left: x - 3,
              top: y - 3,
              width: Math.max(0, x2 - x) + 6,
              height: Math.max(0, y2 - y) + 6,
              border: "1.5px dashed #6366f1",
              borderRadius: 8,
              opacity: 0.75,
            }}
          />
        );
      })()}

      {(() => {
        const horizontal = getTimelineDirection(code) === "LR";
        const pan = timelineReorder.pan;
        // Span the full diagram extent (all nodes), not just the first/top slot item.
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const n of timelineReorder.nodes) {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x + n.w);
          maxY = Math.max(maxY, n.y + n.h);
        }
        if (!Number.isFinite(minX)) {
          for (const s of timelineReorder.slots) {
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x + s.w);
            maxY = Math.max(maxY, s.y + s.h);
          }
        }
        // Snap the guide to the active slot so the indicator always shows the EXACT drop
        // position rather than tracking the cursor. Child events (columnMode) center the
        // guide on the hovered parent period column so it never overlaps the division lines.
        const activeSlot = timelineReorder.slots.find(
          (s) => timelineReorder.targetId === s.id && timelineReorder.placement === s.placement,
        );
        if (activeSlot && activeSlot.columnMode) {
          const inset = 4;
          const center = activeSlot.guidePos + (horizontal ? pan.dx : pan.dy);
          const spanStart = activeSlot.spanStart + (horizontal ? pan.dy : pan.dx);
          const spanEnd = activeSlot.spanEnd + (horizontal ? pan.dy : pan.dx);
          const span = Math.max(2, spanEnd - spanStart - inset * 2);
          return (
            <div
              className="absolute"
              data-timeline-reorder-guide
              data-timeline-reorder-column-guide
              style={
                horizontal
                  ? {
                      top: spanStart + inset,
                      height: span,
                      left: center - 1.5,
                      width: 3,
                      background: "#4f46e5",
                      opacity: 0.85,
                      borderRadius: 9999,
                    }
                  : {
                      left: spanStart + inset,
                      width: span,
                      top: center - 1.5,
                      height: 3,
                      background: "#4f46e5",
                      opacity: 0.85,
                      borderRadius: 9999,
                    }
              }
            />
          );
        }
        const guideX = (activeSlot ? activeSlot.guidePos : timelineReorder.cursorX) + pan.dx;
        const guideY = (activeSlot ? activeSlot.guidePos : timelineReorder.cursorY) + pan.dy;
        return (
          <div
            className="absolute"
            data-timeline-reorder-guide
            style={
              horizontal
                ? {
                    top: minY + pan.dy,
                    height: Math.max(0, maxY - minY),
                    left: guideX - 1.5,
                    width: 3,
                    background: "#4f46e5",
                    opacity: 0.85,
                    borderRadius: 9999,
                  }
                : {
                    left: minX + pan.dx,
                    width: Math.max(0, maxX - minX),
                    top: guideY - 1.5,
                    height: 3,
                    background: "#4f46e5",
                    opacity: 0.85,
                    borderRadius: 9999,
                  }
            }
          />
        );
      })()}

      {/* Drag ghost — styled preview of the dragged node following the cursor.
          In vertical mode, when dragging inside a column (event drag), the ghost snaps
          to the column's cross-axis center so it aligns with the drop slot. In horizontal
          mode, the ghost snaps vertically to the column center. For section/period
          boundary drags the ghost follows the cursor with an offset. */}
      {timelineReorder.ghost &&
        (() => {
          const activeSlot = timelineReorder.slots.find(
            (s) => timelineReorder.targetId === s.id && timelineReorder.placement === s.placement,
          );
          const horizontal = getTimelineDirection(code) === "LR";
          const pan = timelineReorder.pan;
          let ghostL = timelineReorder.cursorX + 16;
          let ghostT = timelineReorder.cursorY + 16;
          if (activeSlot && activeSlot.columnMode) {
            const ghostW = Math.min(timelineReorder.ghost!.w, 260);
            if (horizontal) {
              ghostL = activeSlot.guidePos + pan.dx - ghostW / 2;
              ghostT = activeSlot.spanStart + pan.dy + 4;
            } else {
              // TD: center in column X; follow cursor Y (events stack vertically).
              ghostL =
                activeSlot.spanStart +
                pan.dx +
                (activeSlot.spanEnd - activeSlot.spanStart - ghostW) / 2;
              ghostT = timelineReorder.cursorY + 16;
            }
          }
          return (
            <div
              className="absolute pointer-events-none"
              data-timeline-reorder-ghost
              style={{
                left: ghostL,
                top: ghostT,
                transform: activeSlot && activeSlot.columnMode ? "none" : "translate(-8px, -8px)",
                width: Math.min(timelineReorder.ghost.w, 260),
                minHeight: Math.min(timelineReorder.ghost.h, 40),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.92)",
                border: "2px solid #6366f1",
                borderRadius: 10,
                boxShadow: "0 4px 16px rgba(79,70,229,0.25)",
                color: "#4f46e5",
                fontWeight: 600,
                fontSize: 13,
                padding: "4px 10px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {timelineReorder.ghost.label}
                {timelineReorder.ghost.section ? " · section" : ""}
              </span>
            </div>
          );
        })()}
    </div>
  );
}
