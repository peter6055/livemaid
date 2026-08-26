"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ConnectionState } from "@/hooks/useCanvasInteraction";
import type { ShapeOption } from "@/lib/diagrams/flowchart";
import { findOwningLineForSequenceLabel } from "@/lib/diagrams/sequence/geometry";
import { findSeqReorderTargetSlot } from "@/lib/diagrams/sequence/reorder";
import { getSortedSequenceNoteTextElements } from "@/lib/diagrams/sequence/notes";

interface SequenceDragMachinesDeps {
  canvasShellRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  selectedNodeId: string | null;
  onDeselect?: () => void;
  onHoveredSequenceMessageClick: (index: number) => void;
  onHoveredSequenceMessageDoubleClick: (index: number) => void;
  onHoveredSequenceNoteClick?: (index: number) => void;
  onHoveredSequenceNoteDoubleClick?: (index: number) => void;
  onReorderSequenceItem?: (item: { kind: "msg" | "note"; index: number }, toSlot: number) => void;
  onReorderSequenceLifelines?: (newOrderIds: string[]) => void;
  getSequenceLifelines?: () => Array<{ actorId: string; x: number; y1: number; y2: number }>;
  onChangeSequenceMessageEndpoint?: (endpoint: "source" | "target", newActorId: string) => void;
}

/**
 * Geometry payload for the selected sequence message's endpoints (the non-null shape of
 * `selectedSeqMsgEndpoints` / `getSequenceMessageEndpointGeometry`'s return in EditorCanvas).
 */
type SeqMsgEndpoints = {
  from: string;
  to: string;
  isSelf: boolean;
  source: { x: number; y: number };
  target: { x: number; y: number };
  lifelines: Array<{ actorId: string; x: number }>;
};

/**
 * Owns the viewport-space reorder drag machines for sequence rows and sequence lifeline columns:
 * their state atoms, the click-tracking refs used only by those machines, and the mousedown
 * starter functions. Moved verbatim out of EditorCanvas.
 */
export function useSequenceDragMachines({
  canvasShellRef,
  containerRef,
  selectedNodeId,
  onDeselect,
  onHoveredSequenceMessageClick,
  onHoveredSequenceMessageDoubleClick,
  onHoveredSequenceNoteClick,
  onHoveredSequenceNoteDoubleClick,
  onReorderSequenceItem,
  onReorderSequenceLifelines,
  getSequenceLifelines,
  onChangeSequenceMessageEndpoint,
}: SequenceDragMachinesDeps) {
  // Tracks whether the last sequence-message pointer interaction actually became a drag, so the
  // hover grab overlay can distinguish a reorder-drag from a plain click (select).
  const seqDidDragRef = useRef(false);
  // Manual double-click detector for sequence-message overlays. The native `dblclick`/`e.detail`
  // counter does NOT survive the hover→selected overlay element swap (the two clicks land on
  // different DOM nodes), so we time clicks ourselves keyed by message index.
  const seqLastClickRef = useRef<{ time: number; key: string }>({ time: 0, key: "" });
  // Viewport-space (canvasShellRef-relative) state for dragging a selected sequence
  // message into a new chronological slot. Lives outside the TransformWrapper so canvas
  // pan/zoom never affects its coordinate system (panning is also disabled while active).
  const [seqReorder, setSeqReorder] = useState<{
    fromIndex: number;
    left: number;
    width: number;
    slots: Array<{ slot: number; y: number; h: number }>;
    cursorY: number;
    targetSlot: number | null;
  } | null>(null);
  // Viewport-space (canvasShellRef-relative) state for dragging a participant lifeline HORIZONTALLY
  // to a new column position. Mirrors seqReorder but on the X axis: `slots` are vertical drop bands
  // between/around the lifelines. Lives outside TransformWrapper; panning disabled while active.
  const [seqLifelineReorder, setSeqLifelineReorder] = useState<{
    fromIndex: number;
    top: number;
    height: number;
    slots: Array<{ slot: number; x: number; w: number }>;
    cursorX: number;
    targetSlot: number | null;
  } | null>(null);
  // one under the cursor at mousedown (grabbed directly on hover — no select-first). All geometry
  // is computed in viewport space (relative to canvasShellRef) from the live DOM, mirroring the
  // lifeline `+` drag pattern. Panning is suppressed via the `seq-msg-reorder-handle` class
  // (panning.excluded) plus the `seqReorder` disabled flag. Messages and notes share one unified
  // ordered row list so a row can be dropped into ANY gap (message- or note-adjacent).
  const startSeqReorderDrag = (
    e: React.MouseEvent<HTMLDivElement>,
    explicitRow?: { kind: "msg" | "note"; domIndex: number },
  ) => {
    e.stopPropagation();
    seqDidDragRef.current = false;
    const shell = canvasShellRef.current;
    const container = containerRef.current;
    if (!shell || !container) return;
    const shellRect = shell.getBoundingClientRect();

    const textEls = Array.from(
      (() => {
        const candidates = container.querySelectorAll(".messageText");
        const roots = new Set<SVGElement>();
        for (const el of candidates) {
          const root =
            (el.closest("foreignObject.messageText") as SVGElement | null) ||
            (el.closest("text.messageText") as SVGElement | null) ||
            el;
          const rect = root.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            roots.add(root as SVGElement);
          }
        }
        return roots;
      })(),
    ) as SVGElement[];
    const noteTextEls = getSortedSequenceNoteTextElements(container);
    if (textEls.length === 0 && noteTextEls.length === 0) return;
    const lineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
    ) as SVGElement[];

    type Row = { kind: "msg" | "note"; domIndex: number; top: number; bottom: number };
    const rows: Row[] = [];

    // Message rows: each occupies a vertical BAND = its text label UNION its arrow line. In
    // Mermaid the arrow line sits just below the text label, so the empty space between two
    // messages is between band[i].bottom and band[i+1].top — NOT the midpoint between text
    // centers (that lands on the upper message's line). Pair text↔line with the SAME scoring
    // heuristic as the hook's findNearestLineForText (a naive nearest-by-center mis-assigns
    // around self-loops / tall arcs and corrupts neighboring bands).
    const owningLine = (textEl: SVGElement) => findOwningLineForSequenceLabel(textEl, lineEls);

    lineEls.forEach((lineEl, i) => {
      const lr = lineEl.getBoundingClientRect();
      const pairedTexts = textEls.filter((textEl) => owningLine(textEl) === lineEl);
      const textRects = pairedTexts.map((textEl) => textEl.getBoundingClientRect());
      const top = Math.min(lr.top, ...textRects.map((r) => r.top));
      const bottom = Math.max(lr.bottom, ...textRects.map((r) => r.bottom));
      rows.push({
        kind: "msg",
        domIndex: i,
        top: top - shellRect.top,
        bottom: bottom - shellRect.top,
      });
    });

    // Note rows: band = the note's rect.note box (full yellow box), keyed by the same visual
    // ordering used for SEQ_NOTE_ selection ids so drag-reorder and selection stay aligned.
    noteTextEls.forEach((el, j) => {
      const parentGroup = el.parentElement;
      const rectNote = (parentGroup?.querySelector("rect.note") ??
        parentGroup?.parentElement?.querySelector("rect.note")) as SVGElement | null;
      const r = (rectNote || el).getBoundingClientRect();
      rows.push({
        kind: "note",
        domIndex: j,
        top: r.top - shellRect.top,
        bottom: r.bottom - shellRect.top,
      });
    });

    // Visual (== source) order: top to bottom.
    rows.sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
    const N = rows.length;
    if (N === 0) return;

    // Resolve which row is being dragged: if an explicit row is provided (from a trigger
    // area or selection overlay), use it directly. Otherwise fall back to cursor-Y-based
    // resolution for legacy/direct SVG interactions.
    let fromIndex = -1;

    if (explicitRow) {
      fromIndex = rows.findIndex(
        (row) => row.kind === explicitRow.kind && row.domIndex === explicitRow.domIndex,
      );
    }

    if (fromIndex < 0 && !explicitRow) {
      const cy0 = e.clientY - shellRect.top;
      let bestD = Number.POSITIVE_INFINITY;
      rows.forEach((r, i) => {
        const c = (r.top + r.bottom) / 2;
        const d = Math.abs(c - cy0);
        if (d < bestD) {
          bestD = d;
          fromIndex = i;
        }
      });
    }

    const draggedRow: Row | null =
      fromIndex >= 0
        ? rows[fromIndex]
        : explicitRow
          ? { kind: explicitRow.kind, domIndex: explicitRow.domIndex, top: 0, bottom: 0 }
          : null;

    if (!draggedRow) return;
    const draggedKey = `${draggedRow.kind}:${draggedRow.domIndex}`;

    // If a DIFFERENT row is currently selected, cancel that selection now so its stale selection
    // box/toolbar doesn't linger while dragging the grabbed row.
    const selectedKey = selectedNodeId?.startsWith("SEQ_MSG_")
      ? `msg:${selectedNodeId.replace("SEQ_MSG_", "")}`
      : selectedNodeId?.startsWith("SEQ_NOTE_")
        ? `note:${selectedNodeId.replace("SEQ_NOTE_", "")}`
        : null;
    if (selectedKey && selectedKey !== draggedKey) {
      onDeselect?.();
    }

    // Horizontal extent: span the lifelines (fallback to row bounds).
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    const actorLines = container.querySelectorAll("line.actor-line");
    if (actorLines.length > 0) {
      actorLines.forEach((l) => {
        const r = (l as Element).getBoundingClientRect();
        minX = Math.min(minX, r.left - shellRect.left);
        maxX = Math.max(maxX, r.right - shellRect.left);
      });
    } else {
      [...textEls, ...noteTextEls].forEach((el) => {
        const r = el.getBoundingClientRect();
        minX = Math.min(minX, r.left - shellRect.left);
        maxX = Math.max(maxX, r.right - shellRect.left);
      });
    }
    const padX = 24;
    const left = minX - padX;
    const width = maxX - minX + padX * 2;

    // Slot Y sits in the TRUE empty gap: above the first row, between adjacent rows, or below the
    // last row — so it never overlaps a message line/label or note box.
    const endMargin = 12;
    const slotY = (k: number) => {
      if (k <= 0) return rows[0].top - endMargin;
      if (k >= N) return rows[N - 1].bottom + endMargin;
      return (rows[k - 1].bottom + rows[k].top) / 2;
    };
    const emptyGap = (k: number) => {
      if (k <= 0 || k >= N) return endMargin * 2;
      return Math.max(0, rows[k].top - rows[k - 1].bottom);
    };
    const reorderFromIndex = fromIndex;
    const canReorderDrag = reorderFromIndex >= 0;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    let dragSlots: Array<{ slot: number; y: number; h: number }> | null = null;
    let dragFindTarget: ((cx: number, cy: number) => number | null) | null = null;

    const HIT_TOL_X = 24;

    const onMove = (ev: MouseEvent) => {
      if (!canReorderDrag) return;
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        // Compute Y positions for ALL slots (0..N) for accurate midpoint zone boundaries,
        // including the excluded no-op slots. Eligible slots are computed separately for
        // rendering. The target finder then uses ALL-slot midpoints but returns a slot
        // number only if it is eligible (not excluded).
        const allSlotYs: number[] = [];
        for (let k = 0; k <= N; k += 1) {
          allSlotYs.push(slotY(k));
        }
        const eligibleSlots = new Set<number>();
        const newSlots: Array<{ slot: number; y: number; h: number }> = [];
        for (let k = 0; k <= N; k += 1) {
          if (k === reorderFromIndex || k === reorderFromIndex + 1) continue;
          eligibleSlots.add(k);
          const h = Math.max(5, Math.min(14, emptyGap(k) * 0.7));
          newSlots.push({ slot: k, y: slotY(k), h });
        }
        if (newSlots.length === 0) return;
        dragSlots = newSlots;
        dragFindTarget = (cursorX: number, cursorY: number): number | null => {
          if (cursorX < left - HIT_TOL_X || cursorX > left + width + HIT_TOL_X) return null;
          return findSeqReorderTargetSlot(allSlotYs, eligibleSlots, cursorY);
        };
        dragging = true;
        seqDidDragRef.current = true;
      }
      if (!dragging) return;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      const newTargetSlot = dragFindTarget!(cursorX, cursorY);
      setSeqReorder({
        fromIndex: reorderFromIndex,
        left,
        width,
        slots: dragSlots!,
        cursorY,
        targetSlot: newTargetSlot,
      });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragging) {
        // Mouseup position is authoritative: recompute from the final cursor position
        // and commit only when that result is non-null. Releasing in an excluded zone
        // or outside the hit area cancels rather than committing a stale prior target.
        const cursorX = ev.clientX - shellRect.left;
        const cursorY = ev.clientY - shellRect.top;
        const finalTargetSlot = dragFindTarget!(cursorX, cursorY);
        if (finalTargetSlot !== null) {
          onReorderSequenceItem?.(
            { kind: draggedRow.kind, index: draggedRow.domIndex },
            finalTargetSlot,
          );
        }
      } else {
        const now = Date.now();
        const prev = seqLastClickRef.current;
        const isBrowserDoubleClick = e.detail >= 2 && selectedKey === draggedKey;
        const isDouble =
          isBrowserDoubleClick || (prev.key === draggedKey && now - prev.time <= 350);
        if (isDouble) {
          seqLastClickRef.current = { time: 0, key: "" };
          if (draggedRow.kind === "msg") onHoveredSequenceMessageDoubleClick(draggedRow.domIndex);
          else onHoveredSequenceNoteDoubleClick?.(draggedRow.domIndex);
        } else {
          seqLastClickRef.current = { time: now, key: draggedKey };
          if (draggedRow.kind === "msg") onHoveredSequenceMessageClick(draggedRow.domIndex);
          else onHoveredSequenceNoteClick?.(draggedRow.domIndex);
        }
      }
      setSeqReorder(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // Begin dragging a participant lifeline HORIZONTALLY to reorder the columns. Direct-drag on the
  // header body (no handle bar) with a 3px intent threshold so a plain click still selects and a
  // double-click still edits — both flow through the existing document-capture / dblclick handlers
  // (which resolve the SVG behind this overlay via elementsFromPoint), so this handler deliberately
  // does NOT stopPropagation. Runs entirely in viewport/shell space (canvasShellRef-relative) so
  // pan/zoom never distorts coordinates (panning is also disabled while active). The dragged actor
  // is the lifeline nearest the mousedown x; X snaps to inter-lifeline gap slots. On drop the new
  // left-to-right actorId order is sent to onReorderSequenceLifelines, which rewrites the
  // participant declaration order in the code.
  const startSeqLifelineDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!getSequenceLifelines) return;
    const shell = canvasShellRef.current;
    const container = containerRef.current;
    if (!shell || !container) return;
    const shellRect = shell.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;
    if (!Number.isFinite(scale) || scale <= 0) return;

    const toShellX = (cx: number) =>
      cx * scale + containerRect.left - container.scrollLeft - shellRect.left;
    const toShellY = (cy: number) =>
      cy * scale + containerRect.top - container.scrollTop - shellRect.top;

    const lifelines = getSequenceLifelines(); // sorted left→right, canvas coords
    if (lifelines.length < 2) return; // need at least two columns to reorder
    const xs = lifelines.map((l) => toShellX(l.x));
    const top = toShellY(Math.min(...lifelines.map((l) => l.y1)));
    const bottom = toShellY(Math.max(...lifelines.map((l) => l.y2)));
    const height = Math.max(20, bottom - top);
    const N = lifelines.length;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const cursorX0 = startClientX - shellRect.left;
    let fromIndex = 0;
    let bestD = Number.POSITIVE_INFINITY;
    xs.forEach((x, i) => {
      const d = Math.abs(x - cursorX0);
      if (d < bestD) {
        bestD = d;
        fromIndex = i;
      }
    });

    // Slots 0..N: before first, between adjacent pairs, after last. Skip the dragged column's own
    // two adjacent slots (fromIndex, fromIndex+1) — dropping there is a no-op.
    const endMargin = 30;
    const slotX = (k: number) => {
      if (k <= 0) return xs[0] - endMargin;
      if (k >= N) return xs[N - 1] + endMargin;
      return (xs[k - 1] + xs[k]) / 2;
    };
    const slots: Array<{ slot: number; x: number; w: number }> = [];
    for (let k = 0; k <= N; k += 1) {
      if (k === fromIndex || k === fromIndex + 1) continue;
      slots.push({ slot: k, x: slotX(k), w: 22 });
    }
    if (slots.length === 0) return;

    const HIT_TOL_X = 34;
    const findTarget = (cursorX: number, cursorY: number): number | null => {
      if (cursorY < top - 50 || cursorY > top + height + 50) return null;
      let best: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const s of slots) {
        if (Math.abs(s.x - cursorX) <= s.w / 2 + HIT_TOL_X) {
          const d = Math.abs(s.x - cursorX);
          if (d < bestDist) {
            bestDist = d;
            best = s.slot;
          }
        }
      }
      return best;
    };

    let dragging = false;
    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
      }
      if (!dragging) return;
      ev.preventDefault();
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      setSeqLifelineReorder({
        fromIndex,
        top,
        height,
        slots,
        cursorX,
        targetSlot: findTarget(cursorX, cursorY),
      });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragging) {
        const cursorX = ev.clientX - shellRect.left;
        const cursorY = ev.clientY - shellRect.top;
        const targetSlot = findTarget(cursorX, cursorY);
        if (targetSlot !== null) {
          // `targetSlot` indexes the ORIGINAL lifeline array; convert to a post-removal insert index.
          const order = lifelines.map((l) => l.actorId);
          const moved = order[fromIndex];
          const without = order.filter((_, i) => i !== fromIndex);
          const insertAt = targetSlot > fromIndex ? targetSlot - 1 : targetSlot;
          without.splice(insertAt, 0, moved);
          onReorderSequenceLifelines?.(without);
        }
      }
      setSeqLifelineReorder(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // Viewport-space indicator for sequence drag — lives outside the TransformWrapper so
  // canvas pan/zoom never affects its coordinate system. Positions are relative to canvasShellRef.
  const [seqDragIndicator, setSeqDragIndicator] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    snapX: number | null;
  } | null>(null);
  // True while a message endpoint (source/target) handle is being dragged across lifelines, so the
  // static handles hide and canvas panning stays disabled for the duration of the drag.
  const [seqEndpointDragging, setSeqEndpointDragging] = useState(false);

  // Begin dragging a message endpoint (sender or receiver) across lifelines. Runs entirely in
  // viewport/shell space (canvasShellRef-relative) — mirroring the lifeline `+` connection drag —
  // so canvas pan/zoom never distorts the coordinate system (panning is also disabled while the
  // drag is active). The dragged endpoint's Y is LOCKED to the message's row (only X moves, to
  // preserve chronological order); X snaps to the nearest participant lifeline. On drop over a
  // lifeline the change is committed via onChangeSequenceMessageEndpoint (which rewrites the code
  // line); dropping on the source's own lifeline yields a self-message, and vice-versa.
  const startSeqEndpointDrag = (
    e: React.MouseEvent<HTMLDivElement>,
    endpoint: "source" | "target",
    geo: SeqMsgEndpoints,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const shell = canvasShellRef.current;
    const container = containerRef.current;
    if (!shell || !container) return;
    const shellRect = shell.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;
    if (!Number.isFinite(scale) || scale <= 0) return;

    // canvas-coord (pre-transform) → shell-coord (viewport, canvasShell-relative).
    const toShellX = (cx: number) =>
      cx * scale + containerRect.left - container.scrollLeft - shellRect.left;
    const toShellY = (cy: number) =>
      cy * scale + containerRect.top - container.scrollTop - shellRect.top;

    const anchored = endpoint === "source" ? geo.target : geo.source; // stays fixed
    const moving = endpoint === "source" ? geo.source : geo.target; // follows the cursor
    const anchorShellX = toShellX(anchored.x);
    const anchorShellY = toShellY(anchored.y);
    const lockedShellY = toShellY(moving.y);

    // Snap targets: live lifeline DOM x's (shell space, sorted L→R) zipped with geo.lifelines
    // (also sorted L→R) to recover each actorId. The two lists enumerate the same lifelines in the
    // same order, so a positional zip is exact and avoids any name-matching ambiguity.
    const actorLineEls = Array.from(
      container.querySelectorAll("line.actor-line"),
    ) as SVGLineElement[];
    const domLifelines = actorLineEls
      .map((l) => {
        const r = l.getBoundingClientRect();
        return r.left + r.width / 2 - shellRect.left;
      })
      .sort((a, b) => a - b);
    const geoLifelines = [...geo.lifelines].sort((a, b) => a.x - b.x);
    const snapTargets: Array<{ actorId: string; shellX: number }> = [];
    if (domLifelines.length === geoLifelines.length) {
      domLifelines.forEach((shellX, i) =>
        snapTargets.push({ actorId: geoLifelines[i].actorId, shellX }),
      );
    } else {
      geoLifelines.forEach((g) => snapTargets.push({ actorId: g.actorId, shellX: toShellX(g.x) }));
    }
    if (snapTargets.length === 0) return;

    const SNAP_TOL = 44; // shell px — generous so the endpoint reliably grabs the nearest lifeline
    const findSnap = (cursorShellX: number) => {
      let best: { actorId: string; shellX: number } | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const t of snapTargets) {
        const d = Math.abs(t.shellX - cursorShellX);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      return best && bestD <= SNAP_TOL ? best : null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setSeqEndpointDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
      }
      const cursorShellX = ev.clientX - shellRect.left;
      const snap = findSnap(cursorShellX);
      const movingX = snap ? snap.shellX : cursorShellX;
      // Y is locked to the message row (lockedShellY); only X tracks the cursor / snaps.
      setSeqDragIndicator({
        x1: anchorShellX,
        y1: anchorShellY,
        x2: movingX,
        y2: lockedShellY,
        snapX: snap ? snap.shellX : null,
      });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSeqDragIndicator(null);
      setSeqEndpointDragging(false);
      if (dragging) {
        const cursorShellX = ev.clientX - shellRect.left;
        const snap = findSnap(cursorShellX);
        if (snap) onChangeSequenceMessageEndpoint?.(endpoint, snap.actorId);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  return {
    seqReorder,
    seqLifelineReorder,
    seqDragIndicator,
    setSeqDragIndicator,
    seqEndpointDragging,
    startSeqReorderDrag,
    startSeqLifelineDrag,
    startSeqEndpointDrag,
  };
}

interface SequenceConnectHandlersDeps {
  connectionStateRef: MutableRefObject<ConnectionState>;
  sequenceConnectionCommittedRef: MutableRefObject<boolean>;
  setConnectionState: Dispatch<SetStateAction<ConnectionState>>;
  getSequenceLifelines: () => Array<{ actorId: string; x: number; y1: number; y2: number }>;
  setSequenceLifelineOverlay: Dispatch<
    SetStateAction<{ actorId: string; x: number; slots: number[] } | null>
  >;
  getSequenceInsertIndexForAnchor: (anchorY: number) => number;
  handleAddNodeFromSelected: (
    startId: string | null,
    targetNodeId?: string,
    shape?: ShapeOption,
    sequenceInsertIndex?: number,
  ) => void;
}

export function useSequenceConnectHandlers({
  connectionStateRef,
  sequenceConnectionCommittedRef,
  setConnectionState,
  getSequenceLifelines,
  setSequenceLifelineOverlay,
  getSequenceInsertIndexForAnchor,
  handleAddNodeFromSelected,
}: SequenceConnectHandlersDeps) {
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

  return {
    startSequenceConnection,
    clearConnectionState,
    finalizeSequenceConnection,
  };
}
