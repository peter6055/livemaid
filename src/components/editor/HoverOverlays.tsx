"use client";

import type { ConnectionState } from "@/hooks/useCanvasInteraction";

type OverlayBox = { x: number; y: number; width: number; height: number };

interface HoverOverlaysProps {
  currentType: string;
  scale: number;
  selectionBox: OverlayBox | null;
  selectedNodeId: string | null;
  hoveredSequenceMessageBox: OverlayBox | null;
  hoveredSequenceMessageIndex: number | null;
  hoveredSequenceNoteBox: OverlayBox | null;
  hoveredSequenceActorBox: OverlayBox | null;
  hoveredFlowchartNodeBox: OverlayBox | null;
  connectionState: ConnectionState;
  isInlineEditing: boolean;
  isCommentMode?: boolean;
  isLocked: boolean;
  seqReorder: {
    fromIndex: number;
    left: number;
    width: number;
    slots: Array<{ slot: number; y: number; h: number }>;
    cursorY: number;
    targetSlot: number | null;
  } | null;
  seqLifelineReorder: {
    fromIndex: number;
    top: number;
    height: number;
    slots: Array<{ slot: number; x: number; w: number }>;
    cursorX: number;
    targetSlot: number | null;
  } | null;
  getSequenceLifelines?: () => Array<{ actorId: string; x: number; y1: number; y2: number }>;
  startSeqReorderDrag: (
    e: React.MouseEvent<HTMLDivElement>,
    explicitRow?: { kind: "msg" | "note"; domIndex: number },
  ) => void;
  startSeqLifelineDrag: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Hover outline + grab overlays rendered inside the pan/zoom transform, above the
 * Mermaid SVG. Extracted verbatim from EditorCanvas: sequence message/note/actor
 * hover outlines, their drag-to-reorder grab handles, and the flowchart/graph node
 * hover outline. All geometry divides by `scale` so screen size stays constant.
 */
export function HoverOverlays({
  currentType,
  scale,
  selectionBox,
  selectedNodeId,
  hoveredSequenceMessageBox,
  hoveredSequenceMessageIndex,
  hoveredSequenceNoteBox,
  hoveredSequenceActorBox,
  hoveredFlowchartNodeBox,
  connectionState,
  isInlineEditing,
  isCommentMode,
  isLocked,
  seqReorder,
  seqLifelineReorder,
  getSequenceLifelines,
  startSeqReorderDrag,
  startSeqLifelineDrag,
}: HoverOverlaysProps) {
  return (
    <>
      {currentType === "sequence" &&
        hoveredSequenceMessageBox &&
        hoveredSequenceMessageIndex !== null &&
        selectedNodeId !== `SEQ_MSG_${hoveredSequenceMessageIndex}` &&
        !isInlineEditing &&
        !connectionState.active && (
          <div
            data-seq-msg-hover-outline
            data-scale-lock-shadow
            className="absolute pointer-events-none z-20 border-indigo-500"
            style={{
              left: hoveredSequenceMessageBox.x,
              top: hoveredSequenceMessageBox.y - 1 / scale,
              width: hoveredSequenceMessageBox.width,
              height: hoveredSequenceMessageBox.height + 2 / scale,
              borderRadius: `${6 / scale}px`,
              borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / scale}))`,
              boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / scale})) rgba(99, 102, 241, 0.2)`,
            }}
          />
        )}

      {/* Message hover grab overlay merged into stable hit overlays above. */}

      {currentType === "sequence" &&
        hoveredSequenceNoteBox &&
        !selectedNodeId?.startsWith("SEQ_NOTE_") &&
        !isInlineEditing &&
        !connectionState.active && (
          <div
            data-scale-lock-border
            data-scale-lock-shadow
            className="absolute pointer-events-none z-20 border-indigo-500"
            style={{
              left: hoveredSequenceNoteBox.x - 4 / scale,
              top: hoveredSequenceNoteBox.y - 4 / scale,
              width: hoveredSequenceNoteBox.width + 8 / scale,
              height: hoveredSequenceNoteBox.height + 8 / scale,
              borderRadius: `${4 / scale}px`,
              borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / scale}))`,
              boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / scale})) rgba(99, 102, 241, 0.2)`,
            }}
          />
        )}

      {/* Note hover grab overlay — same drag-to-reorder + click-to-select/edit behavior
                      as messages. Rendered for the hovered note REGARDLESS of selection so EVERY
                      note's mousedown registers the unified drag / mouseup select-edit path. */}
      {currentType === "sequence" &&
        hoveredSequenceNoteBox &&
        !isLocked &&
        !isCommentMode &&
        !isInlineEditing &&
        !connectionState.active &&
        !seqReorder && (
          <div
            className="seq-msg-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer"
            style={{
              left: hoveredSequenceNoteBox.x - 6 / scale,
              top: hoveredSequenceNoteBox.y - 5 / scale,
              width: hoveredSequenceNoteBox.width + 12 / scale,
              height: hoveredSequenceNoteBox.height + 10 / scale,
            }}
            title="Drag to reorder · click to select"
            onMouseDown={(e) => startSeqReorderDrag(e)}
          />
        )}

      {currentType === "sequence" &&
        hoveredSequenceActorBox &&
        !selectedNodeId?.startsWith("SEQ_ACTOR_") &&
        !selectedNodeId?.startsWith("SEQ_MSG_") &&
        !selectedNodeId?.startsWith("SEQ_NOTE_") &&
        !isInlineEditing &&
        !connectionState.active && (
          <div
            className="absolute pointer-events-none z-[19] border-indigo-400"
            style={{
              left: hoveredSequenceActorBox.x - 4 / scale,
              top: hoveredSequenceActorBox.y - 4 / scale,
              width: hoveredSequenceActorBox.width + 8 / scale,
              height: hoveredSequenceActorBox.height + 8 / scale,
              borderRadius: `${6 / scale}px`,
              borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / scale}))`,
              borderStyle: "solid",
              opacity: 0.55,
            }}
          />
        )}

      {/* Participant lifeline reorder grab overlay — DIRECT-DRAG of the header body to
                    reorder columns horizontally. Rendered over the hovered actor header (and the
                    selected actor's box) so the whole block is grabbable. Class
                    `seq-actor-reorder-handle` is in panning.excluded so the press never starts a
                    canvas pan. It does NOT block click-select / double-click-edit: those flow
                    through the document-capture mousedown and native dblclick handlers, which
                    resolve the actor SVG behind this overlay via elementsFromPoint. */}
      {currentType === "sequence" &&
        getSequenceLifelines &&
        !isLocked &&
        !isCommentMode &&
        !isInlineEditing &&
        !connectionState.active &&
        !seqLifelineReorder &&
        (hoveredSequenceActorBox || (selectedNodeId?.startsWith("SEQ_ACTOR_") && selectionBox)) &&
        (() => {
          const box =
            selectedNodeId?.startsWith("SEQ_ACTOR_") && selectionBox
              ? selectionBox
              : hoveredSequenceActorBox!;
          return (
            <div
              className="seq-actor-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer"
              style={{
                left: box.x - 4 / scale,
                top: box.y - 4 / scale,
                width: box.width + 8 / scale,
                height: box.height + 8 / scale,
              }}
              title="Drag to reorder · click to select · double-click to rename"
              onMouseDown={(e) => startSeqLifelineDrag(e)}
            />
          );
        })()}

      {(currentType === "flowchart" || currentType === "graph") &&
        hoveredFlowchartNodeBox &&
        !isInlineEditing &&
        !connectionState.active &&
        !selectionBox && (
          <div
            className="absolute pointer-events-none z-[19] border-indigo-400"
            style={{
              left: hoveredFlowchartNodeBox.x - 3 / scale,
              top: hoveredFlowchartNodeBox.y - 3 / scale,
              width: hoveredFlowchartNodeBox.width + 6 / scale,
              height: hoveredFlowchartNodeBox.height + 6 / scale,
              borderRadius: `${6 / scale}px`,
              borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / scale}))`,
              borderStyle: "solid",
              opacity: 0.6,
            }}
          />
        )}
    </>
  );
}
