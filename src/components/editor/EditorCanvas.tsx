import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Lock, Unlock, Plus, Pencil, RotateCcw } from "lucide-react";
import { NodeManipulationToolbar } from "./NodeManipulationToolbar";
import { EdgeManipulationToolbar } from "./EdgeManipulationToolbar";
import { SequenceManipulationToolbar } from "./SequenceManipulationToolbar";
import { InlineTextEditor } from "./InlineTextEditor";
import { isEdgeId } from "@/lib/diagrams/utils";
import { CSSProperties, RefObject, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BASIC_SHAPES, EXTENDED_SHAPES } from "@/lib/diagrams/flowchart";
import { SequenceBlockArea } from "@/hooks/useCanvasInteraction";
import { SequenceBlockType } from "@/lib/diagrams/sequenceModel";

interface EditorCanvasProps {
  code: string;
  parseError: string | null;
  svgContent: string;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  handleSvgClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleSequenceHoverOver: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleSequenceHoverOut: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleEditClick: (e: React.MouseEvent | Event) => void;
  selectionBox: { x: number, y: number, width: number, height: number } | null;
  connectionState: {
    isDragging: boolean;
    mousePos: { x: number, y: number } | null;
    active: boolean;
    startNodeId: string | null;
    startPos: { x: number, y: number } | null;
    snapTargetId: string | null;
    snapTargetPos: { x: number, y: number } | null;
    anchorY: number | null;
  };
  setConnectionState: (state: any) => void;
  sequenceLifelineOverlay: { actorId: string; x: number; slots: number[] } | null;
  hoveredSequenceActorBox: { x: number, y: number, width: number, height: number } | null;
  hoveredSequenceMessageBox: { x: number, y: number, width: number, height: number } | null;
  hoveredSequenceNoteBox: { x: number, y: number, width: number, height: number } | null;
  hoveredFlowchartNodeBox: { x: number, y: number, width: number, height: number } | null;
  sequenceMessageTriggerAreas: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  sequenceBlockAreas: SequenceBlockArea[];
  startSequenceConnection: (actorId: string, anchorY: number) => void;
  onSequencePlusSelfLoop: (actorId: string, anchorY: number) => void;
  onSequencePlusNote: (actorId: string, anchorY: number, position: 'left' | 'right' | 'over') => void;
  onSequencePlusBlock: (anchorY: number, type: SequenceBlockType | 'highlight') => void;
  onHoveredSequenceMessageHover: (index: number) => void;
  onHoveredSequenceMessageClick: (index: number) => void;
  onHoveredSequenceMessageDoubleClick: (index: number) => void;
  onHoveredSequenceNoteClick?: (index: number) => void;
  onHoveredSequenceNoteDoubleClick?: (index: number) => void;
  onSelectSequenceBlock?: (blockId: string) => void;
  onReorderSequenceItem?: (item: { kind: 'msg' | 'note'; index: number }, toSlot: number) => void;
  onDropSequenceItemIntoBlock?: (item: { kind: 'msg' | 'note'; index: number }, blockId: string | null) => void;
  onResizeSequenceBlock?: (blockId: string, edge: 'top' | 'bottom', anchorY: number) => void;
  isInlineEditing: boolean;
  selectedSvgId: string | null;
  selectedNodeId: string | null;
  currentType: string;
  handleAddNodeFromSelected: (startId: string | null, targetNodeId?: string, shape?: any) => void;
  handleUpdateStyle: (property: string, value: string) => void;
  handleFormatNodeLabel: (format: string, value?: string) => void;
  handleChangeShape: (shape: any) => void;
  handleDuplicateNode: () => void;
  handleDeleteNode: () => void;
  onAddSequenceNote: (position: 'left' | 'right' | 'over') => void;
  onMoveSequenceNote: (position: 'left' | 'right' | 'over') => void;
  onChangeSequenceMessageType?: (operator: string) => void;
  currentSequenceMessageOperator?: string | null;
  onLinkSequenceNote?: () => void;
  setIsInlineEditing: (v: boolean) => void;
  textBox: { x: number, y: number, width: number, height: number } | null;
  theme: string | undefined;
  editingText: string;
  setEditingText: (text: string) => void;
  handleEditSubmit: () => void;
  inlineInputRef: RefObject<HTMLTextAreaElement | null>;
  onDeselect?: () => void;
  onResetStyle?: () => void;
  onUpdateEdgeStyle?: (updates: { stroke?: string; arrowType?: string; label?: string }) => void;
  onUpdateEdgeColor?: (hexColor: string) => void;
  onUpdateEdgeCurve?: (curve: string) => void;
  onUpdateEdgeAnimation?: (animate: boolean) => void;
  onDeleteEdge?: () => void;
  shapePicker: { x: number, y: number, startNodeId: string } | null;
  setShapePicker: (state: any) => void;
  handleCodeChange?: (code: string) => void;
  selectedNodeIds?: string[];
  dragState?: any;
  setDragState?: (state: any) => void;
}

export function EditorCanvas({
  code,
  parseError,
  svgContent,
  isLocked,
  setIsLocked,
  containerRef,
  handleSvgClick,
  handleMouseMove,
  handleMouseUp,
  handleSequenceHoverOver,
  handleSequenceHoverOut,
  handleEditClick,
  selectionBox,
  connectionState,
  setConnectionState,
  sequenceLifelineOverlay,
  hoveredSequenceActorBox,
  hoveredSequenceMessageBox,
  hoveredSequenceNoteBox,
  hoveredFlowchartNodeBox,
  sequenceMessageTriggerAreas,
  sequenceBlockAreas,
  startSequenceConnection,
  onSequencePlusSelfLoop,
  onSequencePlusNote,
  onSequencePlusBlock,
  onHoveredSequenceMessageHover,
  onHoveredSequenceMessageClick,
  onHoveredSequenceMessageDoubleClick,
  onHoveredSequenceNoteClick,
  onHoveredSequenceNoteDoubleClick,
  onSelectSequenceBlock,
  onReorderSequenceItem,
  onDropSequenceItemIntoBlock,
  onResizeSequenceBlock,
  isInlineEditing,
  selectedSvgId,
  selectedNodeId,
  currentType,
  handleUpdateStyle,
  handleFormatNodeLabel,
  handleChangeShape,
  handleDuplicateNode,
  handleDeleteNode,
  onAddSequenceNote,
  onMoveSequenceNote,
  onChangeSequenceMessageType,
  currentSequenceMessageOperator,
  onLinkSequenceNote,
  setIsInlineEditing,
  handleAddNodeFromSelected,
  textBox,
  theme,
  editingText,
  setEditingText,
  handleEditSubmit,
  inlineInputRef,
  onDeselect,
  onResetStyle,
  onUpdateEdgeStyle,
  onUpdateEdgeColor,
  onUpdateEdgeCurve,
  onUpdateEdgeAnimation,
  onDeleteEdge,
  shapePicker,
  setShapePicker,
  handleCodeChange,
}: EditorCanvasProps) {
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const [sequencePlusMenu, setSequencePlusMenu] = useState<{
    actorId: string;
    anchorY: number;
    x: number;
    y: number;
    mode: 'root' | 'note';
  } | null>(null);
  // Viewport-space indicator for sequence drag — lives outside the TransformWrapper so
  // canvas pan/zoom never affects its coordinate system. Positions are relative to canvasShellRef.
  const [seqDragIndicator, setSeqDragIndicator] = useState<{
    x1: number; y1: number;
    x2: number; y2: number;
    snapX: number | null;
  } | null>(null);
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
  const sequencePlusMenuRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the last sequence-message pointer interaction actually became a drag, so the
  // hover grab overlay can distinguish a reorder-drag from a plain click (select).
  const seqDidDragRef = useRef(false);
  // Manual double-click detector for sequence-message overlays. The native `dblclick`/`e.detail`
  // counter does NOT survive the hover→selected overlay element swap (the two clicks land on
  // different DOM nodes), so we time clicks ourselves keyed by message index.
  const seqLastClickRef = useRef<{ time: number; key: string }>({ time: 0, key: '' });
  const [activeBlockDropId, setActiveBlockDropId] = useState<string | null>(null);

  const viewport = containerRef.current?.closest('.relative.overflow-hidden');
  const viewportWidth = viewport?.clientWidth || 800;
  const viewportHeight = viewport?.clientHeight || 600;

  const updateScaleLockedElements = (container: HTMLDivElement | null, scale: number) => {
    if (!container) return;
    const inverse = 1 / scale;
    
    // 1. Scale-lock transforms
    const transformElements = container.querySelectorAll('[data-scale-lock]');
    transformElements.forEach((el: any) => {
      const baseTransform = el.getAttribute('data-base-transform') || '';
      el.style.transform = `${baseTransform} scale(${inverse})`.trim();
    });

    // 2. Scale-lock borders
    const borderElements = container.querySelectorAll('[data-scale-lock-border]');
    borderElements.forEach((el: any) => {
      el.style.borderWidth = `${1.25 * inverse}px`;
    });

    // 3. Scale-lock shadows
    const shadowElements = container.querySelectorAll('[data-scale-lock-shadow]');
    shadowElements.forEach((el: any) => {
      el.style.boxShadow = `0 0 0 ${2 * inverse}px rgba(99, 102, 241, 0.2)`;
    });

    // 4. Scale-lock strokes
    const strokeElements = container.querySelectorAll('[data-scale-lock-stroke]');
    strokeElements.forEach((el: any) => {
      el.style.strokeWidth = `${2 * inverse}px`;
    });
  };

  useEffect(() => {
    if (containerRef.current && selectionBox) {
      const currentScale = parseFloat(containerRef.current.style.getPropertyValue('--zoom-scale') || '1.5');
      updateScaleLockedElements(containerRef.current, currentScale);
    }
  }, [selectionBox, selectedNodeId, containerRef]);

  useEffect(() => {
    if (!shapePicker) return;
    const handleOutsideClick = () => {
      setShapePicker(null);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [shapePicker, setShapePicker]);

  useEffect(() => {
    if (!sequencePlusMenu) return;
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && sequencePlusMenuRef.current?.contains(target)) return;
      setSequencePlusMenu(null);
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [sequencePlusMenu]);

  // Some Mermaid-rendered elements (especially foreignObject HTML labels) can bypass
  // React bubbling/capture handlers. Use a document-level capture fallback so single
  // clicks inside the canvas always resolve a target and route through handleSvgClick.
  useEffect(() => {
    if (isLocked) return;

    const onDocumentMouseDownCapture = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const insideContainer =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!insideContainer) return;

      const elements = document.elementsFromPoint(event.clientX, event.clientY) as HTMLElement[];

      // If this pointer event is on any floating UI/overlay controls, never route it
      // into canvas hit-testing. This prevents accidental back-shape selection when
      // clicking toolbar buttons near tight edges.
      const hitFloatingUi = elements.some((el) =>
        Boolean(
          el.closest?.('[data-scale-lock]') ||
          el.closest?.('[data-inline-toolbar]') ||
          el.closest?.('[data-scale-lock-border]') ||
          el.closest?.('[data-scale-lock-shadow]') ||
          el.closest?.('.seq-msg-reorder-handle') ||
          el.closest?.('[data-slot^="dropdown-menu"]')
        )
      );
      if (hitFloatingUi) return;

      let target =
        elements.find((el) => container.contains(el)) ||
        (event.target as HTMLElement | null) ||
        container;

      // Fallback for tiny Mermaid elements (e.g. compact text blocks) where
      // elementsFromPoint may only return svg/container and miss the actual node.
      const tag = target.tagName?.toLowerCase?.() || '';
      const isGenericContainerTarget =
        tag === 'svg' || tag === 'div' || tag === 'g' || target === container;

      if (isGenericContainerTarget) {
        const candidates = Array.from(
          container.querySelectorAll('.node, .cluster, path.flowchart-link, .edgeLabel')
        ) as SVGGraphicsElement[];

        let best: { el: SVGGraphicsElement; area: number } | null = null;
        const pad = 8;

        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          const inside =
            event.clientX >= r.left - pad &&
            event.clientX <= r.right + pad &&
            event.clientY >= r.top - pad &&
            event.clientY <= r.bottom + pad;
          if (!inside) continue;

          const area = Math.max(1, r.width * r.height);
          if (!best || area < best.area) {
            best = { el, area };
          }
        }

        if (best) {
          target = best.el as unknown as HTMLElement;
        }
      }

      const syntheticEvent = {
        target,
        currentTarget: container,
        detail: event.detail,
        clientX: event.clientX,
        clientY: event.clientY,
        stopPropagation: () => event.stopPropagation(),
        preventDefault: () => event.preventDefault(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      handleSvgClick(syntheticEvent);
    };

    document.addEventListener('mousedown', onDocumentMouseDownCapture, true);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDownCapture, true);
    };
  }, [containerRef, handleSvgClick, isLocked]);

  // Begin dragging a sequence ROW (message OR note) to reorder it. The dragged row is ALWAYS the
  // one under the cursor at mousedown (grabbed directly on hover — no select-first). All geometry
  // is computed in viewport space (relative to canvasShellRef) from the live DOM, mirroring the
  // lifeline `+` drag pattern. Panning is suppressed via the `seq-msg-reorder-handle` class
  // (panning.excluded) plus the `seqReorder` disabled flag. Messages and notes share one unified
  // ordered row list so a row can be dropped into ANY gap (message- or note-adjacent).
  const startSeqReorderDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    seqDidDragRef.current = false;
    const shell = canvasShellRef.current;
    const container = containerRef.current;
    if (!shell || !container) return;
    const shellRect = shell.getBoundingClientRect();

    const textEls = Array.from(container.querySelectorAll('.messageText')) as SVGElement[];
    const noteTextEls = Array.from(container.querySelectorAll('.noteText')) as SVGElement[];
    if (textEls.length === 0 && noteTextEls.length === 0) return;
    const lineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
    ) as SVGElement[];

    type Row = { kind: 'msg' | 'note'; domIndex: number; top: number; bottom: number };
    const rows: Row[] = [];

    // Message rows: each occupies a vertical BAND = its text label UNION its arrow line. In
    // Mermaid the arrow line sits just below the text label, so the empty space between two
    // messages is between band[i].bottom and band[i+1].top — NOT the midpoint between text
    // centers (that lands on the upper message's line). Pair text↔line with the SAME scoring
    // heuristic as the hook's findNearestLineForText (a naive nearest-by-center mis-assigns
    // around self-loops / tall arcs and corrupts neighboring bands).
    textEls.forEach((el, i) => {
      const tr = el.getBoundingClientRect();
      const textX = tr.left + tr.width / 2;
      const textY = tr.top + tr.height / 2;
      let bestLine: DOMRect | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const l of lineEls) {
        const lr = l.getBoundingClientRect();
        const lineY = lr.top + lr.height / 2;
        const dx = textX < lr.left ? (lr.left - textX) : textX > lr.right ? (textX - lr.right) : 0;
        const dy = Math.abs(lineY - textY);
        const underPenalty = lineY < textY ? 60 : 0;
        const score = (dy * 3) + dx + underPenalty;
        if (score < bestScore) { bestScore = score; bestLine = lr; }
      }
      rows.push({
        kind: 'msg',
        domIndex: i,
        top: Math.min(tr.top, bestLine?.top ?? tr.top) - shellRect.top,
        bottom: Math.max(tr.bottom, bestLine?.bottom ?? tr.bottom) - shellRect.top,
      });
    });

    // Note rows: band = the note's rect.note box (full yellow box), keyed by .noteText DOM index
    // so it matches the SEQ_NOTE_ selection id format.
    noteTextEls.forEach((el, j) => {
      const parentGroup = el.parentElement;
      const rectNote = (parentGroup?.querySelector('rect.note')
        ?? parentGroup?.parentElement?.querySelector('rect.note')) as SVGElement | null;
      const r = (rectNote || el).getBoundingClientRect();
      rows.push({ kind: 'note', domIndex: j, top: r.top - shellRect.top, bottom: r.bottom - shellRect.top });
    });

    // Visual (== source) order: top to bottom.
    rows.sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
    const N = rows.length;
    if (N === 0) return;

    // Resolve which row is being dragged: the one whose band center is nearest the cursor.
    const cy0 = e.clientY - shellRect.top;
    let fromIndex = -1;
    let bestD = Number.POSITIVE_INFINITY;
    rows.forEach((r, i) => {
      const c = (r.top + r.bottom) / 2;
      const d = Math.abs(c - cy0);
      if (d < bestD) { bestD = d; fromIndex = i; }
    });
    if (fromIndex < 0) return;
    const draggedRow = rows[fromIndex];
    const draggedKey = `${draggedRow.kind}:${draggedRow.domIndex}`;

    // If a DIFFERENT row is currently selected, cancel that selection now so its stale selection
    // box/toolbar doesn't linger while dragging the grabbed row.
    const selectedKey = selectedNodeId?.startsWith('SEQ_MSG_')
      ? `msg:${selectedNodeId.replace('SEQ_MSG_', '')}`
      : selectedNodeId?.startsWith('SEQ_NOTE_')
        ? `note:${selectedNodeId.replace('SEQ_NOTE_', '')}`
        : null;
    if (selectedKey && selectedKey !== draggedKey) {
      onDeselect?.();
    }

    // Horizontal extent: span the lifelines (fallback to row bounds).
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    const actorLines = container.querySelectorAll('line.actor-line');
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
    const width = (maxX - minX) + padX * 2;

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
    const slots: Array<{ slot: number; y: number; h: number }> = [];
    for (let k = 0; k <= N; k += 1) {
      if (k === fromIndex || k === fromIndex + 1) continue; // skip current position
      const h = Math.max(5, Math.min(14, emptyGap(k) * 0.7));
      slots.push({ slot: k, y: slotY(k), h });
    }
    if (slots.length === 0) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;

    // Strict hitbox detection: a drop only counts when the cursor falls INSIDE a drop zone's
    // bounding box (the drawn band, expanded by a small grab tolerance) AND within the zone's
    // horizontal extent. Dropping in the dead space between zones, near the original position,
    // or off to the side returns null → the drag aborts and the row snaps back.
    const HIT_TOL_Y = 6; // px of vertical grab tolerance around the drawn band
    const HIT_TOL_X = 24; // px of horizontal slack beyond the lifelines
    const findTarget = (cursorX: number, cursorY: number): number | null => {
      if (cursorX < left - HIT_TOL_X || cursorX > left + width + HIT_TOL_X) return null;
      let best: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const s of slots) {
        const halfH = s.h / 2 + HIT_TOL_Y;
        if (cursorY >= s.y - halfH && cursorY <= s.y + halfH) {
          const d = Math.abs(s.y - cursorY);
          if (d < bestDist) { bestDist = d; best = s.slot; }
        }
      }
      return best;
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragging && (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)) {
        dragging = true;
        seqDidDragRef.current = true;
      }
      if (!dragging) return;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      const blockHit = sequenceBlockAreas.find((block) =>
        cursorX >= block.x &&
        cursorX <= block.x + block.width &&
        cursorY >= block.y &&
        cursorY <= block.y + block.height
      );
      setActiveBlockDropId(blockHit?.id || null);
      setSeqReorder({ fromIndex, left, width, slots, cursorY, targetSlot: findTarget(cursorX, cursorY) });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragging) {
        const cursorX = ev.clientX - shellRect.left;
        const cursorY = ev.clientY - shellRect.top;
        const blockHit = sequenceBlockAreas.find((block) =>
          cursorX >= block.x &&
          cursorX <= block.x + block.width &&
          cursorY >= block.y &&
          cursorY <= block.y + block.height
        );
        const targetSlot = findTarget(cursorX, cursorY);
        if (blockHit) {
          onDropSequenceItemIntoBlock?.({ kind: draggedRow.kind, index: draggedRow.domIndex }, blockHit.id);
        } else if (targetSlot !== null) {
          // Strict: only reorder when the drop lands inside a valid zone. Otherwise abort (snap back).
          onReorderSequenceItem?.({ kind: draggedRow.kind, index: draggedRow.domIndex }, targetSlot);
        } else if (draggedRow.kind === 'msg') {
          onDropSequenceItemIntoBlock?.({ kind: draggedRow.kind, index: draggedRow.domIndex }, null);
        }
      } else {
        // No drag → treat as a click on the grabbed row. We resolve select-vs-edit HERE on mouseup
        // (a window listener) instead of the overlay's React onClick, because the overlay DOM node
        // is re-rendered between mousedown and mouseup (selection mounts the second handle / hover
        // churns), so the browser never fires a native `click` on a single stable node. Double-
        // click is detected by timing (≤ 350ms on the same row key), which survives that swap.
        const now = Date.now();
        const prev = seqLastClickRef.current;
        const isDouble = prev.key === draggedKey && now - prev.time <= 350;
        if (isDouble) {
          seqLastClickRef.current = { time: 0, key: '' };
          if (draggedRow.kind === 'msg') onHoveredSequenceMessageDoubleClick(draggedRow.domIndex);
          else onHoveredSequenceNoteDoubleClick?.(draggedRow.domIndex);
        } else {
          seqLastClickRef.current = { time: now, key: draggedKey };
          if (draggedRow.kind === 'msg') onHoveredSequenceMessageClick(draggedRow.domIndex);
          else onHoveredSequenceNoteClick?.(draggedRow.domIndex);
        }
      }
      setSeqReorder(null);
      setActiveBlockDropId(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startSequenceBlockResize = (e: React.MouseEvent<HTMLDivElement>, blockId: string, edge: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    const shellRect = canvasShellRef.current?.getBoundingClientRect();
    if (!shellRect) return;
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const anchorY = ev.clientY - shellRect.top;
      onResizeSequenceBlock?.(blockId, edge, anchorY);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={canvasShellRef} className="w-full h-full relative overflow-hidden bg-white transition-colors duration-300">
        <div 
          className="absolute inset-0 z-0 pointer-events-none opacity-100" 
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, #cbd5e1 1.5px, transparent 0)',
            backgroundSize: '24px 24px'
          }}
        />
        <TransformWrapper
          initialScale={1.5}
          minScale={0.5}
          maxScale={50}
          centerOnInit={true}
          smooth={true}
          wheel={{ wheelDisabled: true, step: 0.05 }}
          panning={{ velocityDisabled: false, disabled: isInlineEditing || connectionState.active || !!seqReorder, excluded: ['seq-connect-btn', 'seq-msg-reorder-handle'] }}
          trackPadPanning={{ disabled: false }}
          limitToBounds={false}
          doubleClick={{ disabled: true }}
          onInit={(ref: any) => {
            if (containerRef.current) {
              containerRef.current.style.setProperty('--zoom-scale', String(ref.state.scale));
              containerRef.current.style.setProperty('--zoom-inverse-scale', String(1 / ref.state.scale));
              updateScaleLockedElements(containerRef.current, ref.state.scale);
            }
          }}
          onTransform={(ref: any, state: any) => {
            if (containerRef.current) {
              containerRef.current.style.setProperty('--zoom-scale', String(state.scale));
              containerRef.current.style.setProperty('--zoom-inverse-scale', String(1 / state.scale));
              updateScaleLockedElements(containerRef.current, state.scale);
            }
          }}
          onZoomStart={() => {
            if (onDeselect) onDeselect();
          }}
          onPinchStart={() => {
            if (onDeselect) onDeselect();
          }}
        >
          {({ zoomIn, zoomOut, resetTransform, state }) => (
            <>
              <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 bg-background border border-border p-1 rounded-lg shadow-sm">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => { if (onDeselect) onDeselect(); zoomIn(); }}>
                   <Plus className="w-4 h-4" />
                </Button>
                <div className="h-px bg-border" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => { if (onDeselect) onDeselect(); resetTransform(); }}>
                   <span className="text-[10px] font-bold">1:1</span>
                </Button>
                <div className="h-px bg-border" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => { if (onDeselect) onDeselect(); zoomOut(); }}>
                   <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>
                </Button>
                <div className="h-px bg-border" />
                <Button 
                   variant="ghost" 
                   size="icon" 
                   className={`h-8 w-8 hover:bg-accent hover:text-accent-foreground ${isLocked ? 'text-red-500' : 'text-foreground'}`} 
                   onClick={() => setIsLocked(!isLocked)}
                   title={isLocked ? "Unlock diagram" : "Lock diagram"}
                 >
                   {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </Button>
              </div>

              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <div 
                  ref={containerRef}
                  className="w-full h-full relative flex items-center justify-center cursor-grab active:cursor-grabbing"
                  onDoubleClick={!isLocked ? ((e) => {
                    // Ignore double-clicks that land on a floating toolbar / overlay control so
                    // they never enter the underlying element's edit mode. This guard lives on the
                    // CANVAS handler only — NOT inside handleEditClick — so the toolbar's own
                    // Rename button (which calls handleEditClick programmatically while the cursor
                    // is over the toolbar) still works.
                    const hitFloatingUi = document.elementsFromPoint(e.clientX, e.clientY).some((el) =>
                      Boolean(
                        el.closest?.('[data-scale-lock]') ||
                        el.closest?.('[data-inline-toolbar]') ||
                        el.closest?.('[data-scale-lock-border]') ||
                        el.closest?.('[data-scale-lock-shadow]') ||
                        el.closest?.('[data-slot^="dropdown-menu"]')
                      )
                    );
                    if (hitFloatingUi) return;
                    handleEditClick(e);
                  }) : undefined}
                  onMouseMove={handleMouseMove}
                  onMouseOver={handleSequenceHoverOver}
                  onMouseOut={handleSequenceHoverOut}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {parseError && (
                    <div 
                      className="absolute inset-0 z-40 bg-white/60 cursor-not-allowed flex items-center justify-center pointer-events-auto" 
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  <div 
                    className={`mermaid-container select-none ${parseError ? 'opacity-30' : ''}`}
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />

                  {currentType === 'sequence' && !isInlineEditing && sequenceBlockAreas.map((block) => {
                    const isSelected = selectedNodeId === block.id;
                    const isDropActive = activeBlockDropId === block.id;
                    return (
                      <div
                        key={block.id}
                        className={`absolute z-[18] border rounded-md transition-colors ${
                          isSelected ? 'border-violet-600 bg-violet-500/15' : 'border-violet-400/70 bg-violet-400/10'
                        } ${isDropActive ? 'bg-violet-500/25 border-violet-700' : ''}`}
                        style={{
                          left: block.x,
                          top: block.y,
                          width: block.width,
                          height: block.height,
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          onSelectSequenceBlock?.(block.id);
                        }}
                        title={`${block.type.toUpperCase()} block`}
                      >
                        <div className="pointer-events-none absolute left-2 top-0 -translate-y-1/2 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {block.type}
                        </div>
                        {isSelected && (
                          <>
                            <div
                              className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize"
                              onMouseDown={(event) => startSequenceBlockResize(event, block.id, 'top')}
                            />
                            <div
                              className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize"
                              onMouseDown={(event) => startSequenceBlockResize(event, block.id, 'bottom')}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {currentType === 'sequence' && !isInlineEditing && !connectionState.active && sequenceMessageTriggerAreas.map((area) => (
                    <div
                      key={`seq-msg-trigger-${area.index}`}
                      data-seq-msg-hover-trigger="true"
                      className="absolute pointer-events-none z-[19]"
                      style={{
                        left: area.x,
                        top: area.y,
                        width: area.width,
                        height: area.height,
                        background: 'transparent',
                      }}
                    />
                  ))}

                  {currentType === 'sequence' && hoveredSequenceMessageBox && !selectedNodeId?.startsWith('SEQ_MSG_') && !isInlineEditing && !connectionState.active && (
                    <div
                      data-seq-msg-hover-trigger="true"
                      data-scale-lock-border
                      data-scale-lock-shadow
                      className="absolute pointer-events-none z-20 border-indigo-500"
                      style={{
                        left: hoveredSequenceMessageBox.x - 1 / state.scale,
                        top: hoveredSequenceMessageBox.y - 1 / state.scale,
                        width: hoveredSequenceMessageBox.width + 2 / state.scale,
                        height: hoveredSequenceMessageBox.height + 2 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / state.scale})) rgba(99, 102, 241, 0.2)`,
                      }}
                    />
                  )}

                  {/* Hover grab overlay: lets the user drag-to-reorder ANY message directly on
                      hover (no select-first step), and selects on a plain click. Generously
                      enlarged vertical grab area so the thin message band is easy to grab.
                      Rendered for the hovered message REGARDLESS of selection so EVERY message
                      click flows through the shared timing-based double-click detector (otherwise
                      clicking a new message while another is selected bypasses it via the SVG path
                      and double-click-to-edit breaks). */}
                  {currentType === 'sequence' && hoveredSequenceMessageBox && !isInlineEditing && !connectionState.active && !seqReorder && (
                    <div
                      className="seq-msg-reorder-handle absolute z-[21] pointer-events-auto cursor-grab active:cursor-grabbing"
                      style={{
                        left: hoveredSequenceMessageBox.x - 8 / state.scale,
                        top: hoveredSequenceMessageBox.y - 5 / state.scale,
                        width: hoveredSequenceMessageBox.width + 16 / state.scale,
                        height: hoveredSequenceMessageBox.height + 10 / state.scale,
                      }}
                      title="Drag to reorder · click to select"
                      onMouseDown={(e) => startSeqReorderDrag(e)}
                    />
                  )}

                  {currentType === 'sequence' && hoveredSequenceNoteBox && !selectedNodeId?.startsWith('SEQ_NOTE_') && !isInlineEditing && !connectionState.active && (
                    <div
                      data-scale-lock-border
                      data-scale-lock-shadow
                      className="absolute pointer-events-none z-20 border-indigo-500"
                      style={{
                        left: hoveredSequenceNoteBox.x - 4 / state.scale,
                        top: hoveredSequenceNoteBox.y - 4 / state.scale,
                        width: hoveredSequenceNoteBox.width + 8 / state.scale,
                        height: hoveredSequenceNoteBox.height + 8 / state.scale,
                        borderRadius: `${4 / state.scale}px`,
                        borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / state.scale})) rgba(99, 102, 241, 0.2)`,
                      }}
                    />
                  )}

                  {/* Note hover grab overlay — same drag-to-reorder + click-to-select/edit behavior
                      as messages. Rendered for the hovered note REGARDLESS of selection so EVERY
                      note's mousedown registers the unified drag / mouseup select-edit path. */}
                  {currentType === 'sequence' && hoveredSequenceNoteBox && !isInlineEditing && !connectionState.active && !seqReorder && (
                    <div
                      className="seq-msg-reorder-handle absolute z-[21] pointer-events-auto cursor-grab active:cursor-grabbing"
                      style={{
                        left: hoveredSequenceNoteBox.x - 6 / state.scale,
                        top: hoveredSequenceNoteBox.y - 5 / state.scale,
                        width: hoveredSequenceNoteBox.width + 12 / state.scale,
                        height: hoveredSequenceNoteBox.height + 10 / state.scale,
                      }}
                      title="Drag to reorder · click to select"
                      onMouseDown={(e) => startSeqReorderDrag(e)}
                    />
                  )}

                  {currentType === 'sequence' && hoveredSequenceActorBox && !selectedNodeId?.startsWith('SEQ_ACTOR_') && !selectedNodeId?.startsWith('SEQ_MSG_') && !selectedNodeId?.startsWith('SEQ_NOTE_') && !isInlineEditing && !connectionState.active && (
                    <div
                      className="absolute pointer-events-none z-[19] border-indigo-400"
                      style={{
                        left: hoveredSequenceActorBox.x - 4 / state.scale,
                        top: hoveredSequenceActorBox.y - 4 / state.scale,
                        width: hoveredSequenceActorBox.width + 8 / state.scale,
                        height: hoveredSequenceActorBox.height + 8 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        borderStyle: 'solid',
                        opacity: 0.55,
                      }}
                    />
                  )}

                  {(currentType === 'flowchart' || currentType === 'graph') && hoveredFlowchartNodeBox && !isInlineEditing && !connectionState.active && !selectionBox && (
                    <div
                      className="absolute pointer-events-none z-[19] border-indigo-400"
                      style={{
                        left: hoveredFlowchartNodeBox.x - 3 / state.scale,
                        top: hoveredFlowchartNodeBox.y - 3 / state.scale,
                        width: hoveredFlowchartNodeBox.width + 6 / state.scale,
                        height: hoveredFlowchartNodeBox.height + 6 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        borderStyle: 'solid',
                        opacity: 0.6,
                      }}
                    />
                  )}

                  {currentType === 'sequence' && !isLocked && !isInlineEditing && !connectionState.active && sequenceLifelineOverlay && (
                    <div className="absolute inset-0 pointer-events-none z-20">
                      {sequenceLifelineOverlay.slots.map((slotY) => (
                        <button
                          key={`${sequenceLifelineOverlay.actorId}-${slotY}`}
                          data-seq-plus-actor-id={sequenceLifelineOverlay.actorId}
                          data-seq-plus-anchor-x={String(sequenceLifelineOverlay.x)}
                          data-seq-plus-anchor-y={String(slotY)}
                          data-scale-lock
                          data-base-transform="translate(-50%, -50%)"
                          className="seq-connect-btn absolute pointer-events-auto w-6 h-6 rounded-full bg-indigo-600 text-white ring-2 ring-white/90 shadow-lg hover:bg-indigo-700 transition-colors"
                          style={{
                            left: sequenceLifelineOverlay.x,
                            top: slotY,
                            transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`
                          }}
                          title="Add sequence action"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const actorId = e.currentTarget.getAttribute('data-seq-plus-actor-id') || sequenceLifelineOverlay.actorId;
                            const anchorY = Number(e.currentTarget.getAttribute('data-seq-plus-anchor-y') || slotY);
                            const rootRect = canvasShellRef.current?.getBoundingClientRect();
                            const buttonRect = e.currentTarget.getBoundingClientRect();
                            const anchorX = rootRect
                              ? buttonRect.left - rootRect.left + buttonRect.width / 2
                              : Number(e.currentTarget.getAttribute('data-seq-plus-anchor-x') || sequenceLifelineOverlay.x);
                            const anchorMenuY = rootRect
                              ? buttonRect.top - rootRect.top + buttonRect.height / 2
                              : anchorY;

                            const startClientX = e.clientX;
                            const startClientY = e.clientY;
                            let dragging = false;

                            const onMove = (ev: MouseEvent) => {
                              if (!dragging && (Math.abs(ev.clientX - startClientX) > 5 || Math.abs(ev.clientY - startClientY) > 5)) {
                                dragging = true;
                                startSequenceConnection(actorId, anchorY);
                                setSeqDragIndicator({ x1: anchorX, y1: anchorMenuY, x2: anchorX, y2: anchorMenuY, snapX: null });
                              }
                              if (dragging) {
                                const shellRect = canvasShellRef.current?.getBoundingClientRect();
                                if (!shellRect) return;
                                const cursorX = ev.clientX - shellRect.left;
                                // Viewport-space snap detection: find the nearest actor-line within 28 viewport-px
                                let snapX: number | null = null;
                                const actorLineEls = containerRef.current?.querySelectorAll('line.actor-line') ?? [];
                                for (const lineEl of actorLineEls) {
                                  const lr = (lineEl as Element).getBoundingClientRect();
                                  const lifelineViewportX = lr.left - shellRect.left; // center of the zero-width line
                                  if (Math.abs(lifelineViewportX - cursorX) <= 28) {
                                    snapX = lifelineViewportX;
                                    break;
                                  }
                                }
                                setSeqDragIndicator({ x1: anchorX, y1: anchorMenuY, x2: snapX !== null ? snapX : cursorX, y2: anchorMenuY, snapX });
                              }
                            };
                            const onUp = () => {
                              window.removeEventListener('mousemove', onMove);
                              window.removeEventListener('mouseup', onUp);
                              setSeqDragIndicator(null);
                              if (!dragging) {
                                setSequencePlusMenu({
                                  actorId,
                                  anchorY,
                                  x: anchorX,
                                  y: anchorMenuY,
                                  mode: 'root',
                                });
                              }
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mx-auto my-auto pointer-events-none" strokeWidth={3} />
                        </button>
                      ))}
                    </div>
                  )}

                  {connectionState.isDragging && connectionState.startPos && connectionState.mousePos && currentType !== 'sequence' && (
                    <svg className="absolute inset-0 pointer-events-none z-30 overflow-visible">
                      <defs>
                        <marker id="sequence-preview-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                          <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
                        </marker>
                      </defs>
                      <line
                        data-scale-lock-stroke
                        x1={connectionState.startPos.x}
                        y1={
                          currentType === 'sequence'
                            ? (connectionState.anchorY ?? connectionState.startPos.y)
                            : connectionState.startPos.y
                        }
                        x2={connectionState.mousePos.x}
                        y2={
                          currentType === 'sequence'
                            ? (connectionState.anchorY ?? connectionState.startPos.y)
                            : connectionState.mousePos.y
                        }
                        stroke="#2563eb"
                        strokeDasharray="10,8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        shapeRendering="geometricPrecision"
                        style={{ strokeWidth: `calc(2px * var(--zoom-inverse-scale, ${1 / state.scale}))` }}
                        markerEnd="url(#sequence-preview-arrow)"
                      />

                      {connectionState.snapTargetPos && (
                        <g transform={`translate(${connectionState.snapTargetPos.x}, ${connectionState.snapTargetPos.y})`}>
                          <circle r={4} fill="#10b981" />
                          <line x1={-2} y1={0} x2={2} y2={0} stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" />
                          <line x1={0} y1={-2} x2={0} y2={2} stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" />
                        </g>
                      )}
                    </svg>
                  )}



                  {isInlineEditing && selectedSvgId && (
                     <style>{`
                        #${selectedSvgId} .label,
                        #${selectedSvgId} text,
                        #${selectedSvgId} foreignObject,
                        #${selectedSvgId} .nodeLabel,
                        #${selectedSvgId} .cluster-label,
                        #${selectedSvgId} .messageText,
                        #${selectedSvgId} .noteText {
                            opacity: 0 !important;
                        }
                     `}</style>
                  )}

                  {currentType === 'sequence' && (selectedNodeId?.startsWith('SEQ_MSG_') || selectedNodeId?.startsWith('SEQ_NOTE_')) && selectionBox && !isLocked && !isInlineEditing && !connectionState.active && (
                    <div
                      className="seq-msg-reorder-handle absolute z-20 pointer-events-auto cursor-grab active:cursor-grabbing"
                      style={{
                        left: selectionBox.x - 8 / state.scale,
                        top: selectionBox.y - 5 / state.scale,
                        width: selectionBox.width + 16 / state.scale,
                        height: selectionBox.height + 10 / state.scale,
                      }}
                      title="Drag to reorder"
                      onMouseDown={startSeqReorderDrag}
                    />
                  )}

                  {selectionBox && !isLocked && (
                    <div 
                      data-scale-lock-border
                      data-scale-lock-shadow
                      /* z-[22] (above the z-[21] sequence hover grab overlays) so the inline
                         toolbar nested inside this box always paints and hit-tests ABOVE the
                         grab overlay of a neighbouring message that the toolbar floats over.
                         Without this, near the toolbar's top edge the overlay can intercept
                         the press and the dropdown intermittently fails to open. */
                      className="absolute border-indigo-500 pointer-events-none z-[22]"
                      style={{
                        left: selectionBox.x - (selectedNodeId?.startsWith('SEQ_MSG_') ? 1 : 4) / state.scale,
                        top: selectionBox.y - (selectedNodeId?.startsWith('SEQ_MSG_') ? 1 : 4) / state.scale,
                        width: selectionBox.width + (selectedNodeId?.startsWith('SEQ_MSG_') ? 2 : 8) / state.scale,
                        height: selectionBox.height + (selectedNodeId?.startsWith('SEQ_MSG_') ? 2 : 8) / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / state.scale})) rgba(99, 102, 241, 0.2)`
                      }}
                    >
                      {!isInlineEditing && (
                        selectedNodeId && isEdgeId(selectedNodeId) ? (
                          <EdgeManipulationToolbar
                            code={code}
                            selectedNodeId={selectedNodeId}
                            currentType={currentType}
                            selectedSvgId={selectedSvgId}
                            scale={state.scale}
                            onUpdateStyle={onUpdateEdgeStyle || (() => {})}
                            onUpdateColor={onUpdateEdgeColor || (() => {})}
                            onUpdateAnimation={onUpdateEdgeAnimation}
                            onEditLabel={(e) => handleEditClick(e)}
                            onDeleteEdge={onDeleteEdge || (() => {})}
                          />
                        ) : selectedNodeId && (selectedNodeId.startsWith('SEQ_ACTOR_') || selectedNodeId.startsWith('SEQ_MSG_') || selectedNodeId.startsWith('SEQ_NOTE_')) ? (
                          <SequenceManipulationToolbar
                            selectedNodeId={selectedNodeId}
                            scale={state.scale}
                            onEditLabel={(e) => handleEditClick(e)}
                            onAddNote={onAddSequenceNote}
                            onMoveNote={onMoveSequenceNote}
                            onChangeMessageType={onChangeSequenceMessageType}
                            currentMessageOperator={currentSequenceMessageOperator}
                            onDeleteNode={handleDeleteNode}
                          />
                        ) : currentType === 'sequence' ? (
                          // Defensive guard: on a sequence diagram the only valid inline toolbars
                          // are Edge/Sequence. If the selection is momentarily in an inconsistent
                          // state (e.g. selectedNodeId cleared by onDeselect while selectionBox
                          // still lingers during a zoom/transition, since they are separate state
                          // updates), do NOT fall through to the flowchart NodeManipulationToolbar
                          // — that would flash the wrong (flowchart) style bar. Render nothing.
                          null
                        ) : (
                          <NodeManipulationToolbar 
                            code={code}
                            selectedNodeId={selectedNodeId}
                            currentType={currentType}
                            selectedSvgId={selectedSvgId}
                            scale={state.scale}
                            onEditLabel={(e) => handleEditClick(e)}
                            onUpdateStyle={handleUpdateStyle}
                            onFormatNodeLabel={handleFormatNodeLabel}
                            onChangeShape={handleChangeShape}
                            onDuplicateNode={handleDuplicateNode}
                            onDeleteNode={handleDeleteNode}
                            onResetStyle={onResetStyle}
                          />
                        )
                      )}

                      <InlineTextEditor 
                        isInlineEditing={isInlineEditing}
                        setIsInlineEditing={setIsInlineEditing}
                        textBox={textBox}
                        selectionBox={selectionBox}
                        scale={state.scale}
                        theme={theme}
                        editingText={editingText}
                        setEditingText={setEditingText}
                        handleEditSubmit={handleEditSubmit}
                        inlineInputRef={inlineInputRef}
                        selectedSvgId={selectedSvgId}
                      />

                      {!isInlineEditing && currentType !== 'sequence' && (!selectedNodeId || (!isEdgeId(selectedNodeId) && !selectedNodeId.startsWith('SEQ_MSG_') && !selectedNodeId.startsWith('SEQ_NOTE_'))) && (
                        <div 
                          data-scale-lock
                          data-base-transform="translateX(-50%) translateY(100%)"
                          className="absolute left-1/2 pointer-events-auto origin-top"
                          style={{ 
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`
                          }}
                        >
                          <button
                             onMouseDown={(e) => { 
                                 e.stopPropagation(); 
                                 e.preventDefault();
                                 setConnectionState({
                                     active: true,
                                     startNodeId: selectedNodeId,
                                     startPos: selectionBox
                                       ? { x: selectionBox.x + selectionBox.width / 2, y: selectionBox.y + selectionBox.height + 4 }
                                       : null,
                                     mousePos: null,
                                     isDragging: false,
                                     snapTargetId: null,
                                     snapTargetPos: null,
                                     anchorY: null
                                  });
                             }}
                             onClick={(e) => {
                                 e.stopPropagation();
                                 if (!connectionState.isDragging) {
                                     handleAddNodeFromSelected(selectedNodeId);
                                     setConnectionState({
                                       active: false,
                                       startNodeId: null,
                                       startPos: null,
                                       mousePos: null,
                                       isDragging: false,
                                       snapTargetId: null,
                                       snapTargetPos: null,
                                       anchorY: null
                                     });
                                 }
                             }}
                              className="w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                             title="Drag to Connect or Click to Add Node"
                          >
                             <Plus className="w-3 h-3 pointer-events-none" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TransformComponent>

              {isLocked && (
                <div className="absolute top-4 right-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-red-200 dark:border-zinc-800/80 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-sm font-bold flex items-center shadow-lg pointer-events-none z-50 animate-in fade-in duration-200">
                  <Lock className="w-4 h-4 mr-2" /> Diagram Locked
                </div>
              )}
            </>
          )}
        </TransformWrapper>

        {/* Sequence drag indicator — rendered at canvasShell level (outside TransformWrapper)
            so canvas pan/zoom never affects its coordinate system.
            All positions are viewport-relative to canvasShellRef. */}
        {seqDragIndicator && (
          <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
            <defs>
              <marker id="seq-drag-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
              </marker>
            </defs>
            <line
              x1={seqDragIndicator.x1}
              y1={seqDragIndicator.y1}
              x2={seqDragIndicator.x2}
              y2={seqDragIndicator.y2}
              stroke="#2563eb"
              strokeDasharray="10,8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              shapeRendering="geometricPrecision"
              markerEnd="url(#seq-drag-arrow)"
            />
            {seqDragIndicator.snapX !== null && (
              <g transform={`translate(${seqDragIndicator.snapX}, ${seqDragIndicator.y1})`}>
                <circle r={5} fill="#10b981" />
                <line x1={-2.5} y1={0} x2={2.5} y2={0} stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" />
                <line x1={0} y1={-2.5} x2={0} y2={2.5} stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" />
              </g>
            )}
          </svg>
        )}

        {/* Sequence message reorder drop zones + drag ghost — rendered at canvasShell level
            (viewport-relative, outside TransformWrapper) so pan/zoom never shifts them. */}
        {seqReorder && (
          <div className="absolute inset-0 pointer-events-none z-30">
            {seqReorder.slots.map((s) => {
              const active = seqReorder.targetSlot === s.slot;
              const alpha = active ? 0.38 : 0.16;
              // Center each band on the interstitial midpoint; height is pre-sized to the
              // local gap so it never overlaps the adjacent message line/label.
              const h = active ? Math.min(s.h + 4, s.h * 1.5 + 2) : s.h;
              return (
                <div
                  key={`seq-drop-${s.slot}`}
                  className="absolute rounded-md"
                  style={{
                    left: seqReorder.left,
                    width: seqReorder.width,
                    top: s.y - h / 2,
                    height: h,
                    border: active ? '2px solid #4f46e5' : '1.5px dashed #818cf8',
                    backgroundImage: `repeating-linear-gradient(45deg, rgba(99,102,241,${alpha}) 0, rgba(99,102,241,${alpha}) 6px, transparent 6px, transparent 12px)`,
                    transition: 'top 60ms linear, height 60ms linear',
                  }}
                />
              );
            })}
            <div
              className="absolute"
              style={{
                left: seqReorder.left,
                width: seqReorder.width,
                top: seqReorder.cursorY - 1.5,
                height: 3,
                background: '#4f46e5',
                opacity: 0.85,
                borderRadius: 9999,
              }}
            />
          </div>
        )}

        {sequencePlusMenu && (
          <div
            ref={sequencePlusMenuRef}
            className="absolute pointer-events-auto z-30"
            style={{
              left: sequencePlusMenu.x,
              top: sequencePlusMenu.y,
              transform: 'translate(-50%, calc(-100% - 32px))',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {/* Tool box: always visible, even while the note position selection is open. */}
            <div className="flex items-center gap-1 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
              <button
                className={`flex h-8 items-center gap-1 rounded-md px-2 text-popover-foreground hover:bg-accent ${sequencePlusMenu.mode === 'note' ? 'bg-accent' : ''}`}
                title="Note"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSequencePlusMenu((prev) => prev ? { ...prev, mode: prev.mode === 'note' ? 'root' : 'note' } : prev);
                }}
              >
                <Pencil className="h-4 w-4" />
                <span className="text-sm font-medium">Note</span>
              </button>
              <button
                className="flex h-8 items-center gap-1 rounded-md px-2 text-popover-foreground hover:bg-accent"
                title="Self Loop Message"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSequencePlusSelfLoop(sequencePlusMenu.actorId, sequencePlusMenu.anchorY);
                  setSequencePlusMenu(null);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="text-sm font-medium">Self loop</span>
              </button>
            </div>

            {sequencePlusMenu.mode === 'note' && (
              <div className="absolute left-0 top-full mt-2 w-52 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
                <div className="flex flex-col gap-1">
                  <div className="px-2 pb-1 text-base font-semibold text-popover-foreground">Note</div>
                  <button
                    className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSequencePlusNote(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, 'left');
                      setSequencePlusMenu(null);
                    }}
                  >
                    Add note to the left
                  </button>
                  <button
                    className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSequencePlusNote(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, 'right');
                      setSequencePlusMenu(null);
                    }}
                  >
                    Add note to the right
                  </button>
                  <button
                    className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSequencePlusNote(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, 'over');
                      setSequencePlusMenu(null);
                    }}
                  >
                    Add note over
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {shapePicker && (
          <div 
            className="absolute z-50 bg-[#1c1c21]/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150 text-white"
            style={{
              left: Math.max(10, Math.min(shapePicker.x, viewportWidth - 250)),
              top: Math.max(10, Math.min(shapePicker.y, viewportHeight - 350)),
              width: '230px',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Choose Shape</span>
              <button 
                onClick={() => setShapePicker(null)} 
                className="text-white/60 hover:text-white text-xs font-medium px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
            
            <div className="flex flex-col gap-4 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
              {/* Basic Shapes */}
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Basic</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {BASIC_SHAPES.map((shape, i) => (
                    <button
                      key={i}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAddNodeFromSelected(shapePicker.startNodeId, undefined, shape as any);
                        setShapePicker(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      className="flex items-center justify-center w-8 h-8 bg-white/5 border border-white/10 rounded-md hover:border-indigo-500 hover:bg-indigo-500/20 hover:text-indigo-400 cursor-pointer text-white p-0 transition-all active:scale-95"
                      title={shape.l}
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4">
                        {shape.i}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Extended Shapes */}
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Extended</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {EXTENDED_SHAPES.map((shape, i) => (
                    <button
                      key={i}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAddNodeFromSelected(shapePicker.startNodeId, undefined, shape as any);
                        setShapePicker(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      className="flex items-center justify-center w-8 h-8 bg-white/5 border border-white/10 rounded-md hover:border-indigo-500 hover:bg-indigo-500/20 hover:text-indigo-400 cursor-pointer text-white p-0 transition-all active:scale-95"
                      title={shape.l}
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4">
                        {shape.i}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
