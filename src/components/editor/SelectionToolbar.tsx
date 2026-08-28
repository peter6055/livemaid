"use client";

import type { RefObject } from "react";
import { MessageSquareText, Plus } from "lucide-react";
import type { ConnectionState } from "@/hooks/useCanvasInteraction";
import type { ShapeOption } from "@/lib/diagrams/flowchart";
import { isEdgeId } from "@/lib/diagrams/utils";
import { getNamespaceNames, getClassNamespace } from "@/lib/diagrams/classDiagram";
import { getStateNodeShape, type StateNodeShapeKind } from "@/lib/diagrams/stateDiagram";
import { getTimelineDirection, type TimelineNode } from "@/lib/diagrams/timeline";
import type { MindmapShapeKind, MindmapNode } from "@/lib/diagrams/mindmap";
import { NodeManipulationToolbar } from "./NodeManipulationToolbar";
import { EdgeManipulationToolbar } from "./EdgeManipulationToolbar";
import { SequenceManipulationToolbar } from "./SequenceManipulationToolbar";
import { ClassEdgeToolbar } from "./ClassEdgeToolbar";
import { ClassNodeToolbar } from "./ClassNodeToolbar";
import { ErNodeToolbar } from "./ErNodeToolbar";
import { StateNodeToolbar } from "./StateNodeToolbar";
import { StateEdgeToolbar } from "./StateEdgeToolbar";
import { MindmapNodeToolbar } from "./MindmapNodeToolbar";
import { ErEdgeToolbar } from "./ErEdgeToolbar";
import { TimelineNodeToolbar } from "./TimelineNodeToolbar";
import { InlineTextEditor } from "./InlineTextEditor";

type SelectionBox = { x: number; y: number; width: number; height: number };

interface SelectionToolbarProps {
  code: string;
  currentType: string;
  scale: number;
  selectionBox: SelectionBox | null;
  selectedNodeId: string | null;
  selectedSvgId: string | null;
  isLocked: boolean;
  isInlineEditing: boolean;
  setIsInlineEditing: (v: boolean) => void;
  connectionState: ConnectionState;
  setConnectionState: (state: React.SetStateAction<ConnectionState>) => void;
  textBox: SelectionBox | null;
  theme: string | undefined;
  editingText: string;
  setEditingText: (text: string) => void;
  handleEditSubmit: () => void;
  handleFormatText?: (format: string, colorValue?: string) => void;
  inlineInputRef: RefObject<HTMLDivElement | null>;
  commentAnchorRef: RefObject<HTMLButtonElement | null>;
  onOpenSelectionCommentComposer?: () => void;
  handleEditClick: (e: React.MouseEvent | Event) => void;
  handleAddNodeFromSelected: (
    startId: string | null,
    targetNodeId?: string,
    shape?: ShapeOption,
  ) => void;
  handleUpdateStyle: (property: string, value: string) => void;
  handleFormatNodeLabel: (format: string, value?: string) => void;
  handleChangeShape: (shape: ShapeOption) => void;
  handleDuplicateNode: () => void;
  handleDeleteNode: () => void;
  onResetStyle?: () => void;
  onUpdateEdgeStyle?: (updates: { stroke?: string; arrowType?: string; label?: string }) => void;
  onUpdateEdgeColor?: (hexColor: string) => void;
  onUpdateEdgeAnimation?: (animate: boolean) => void;
  onDeleteEdge?: () => void;
  onUpdateClassRelationshipType?: (operator: string) => void;
  onSetClassRelationshipCardinality?: (sourceCard: string, targetCard: string) => void;
  onDeleteClassRelationship?: () => void;
  onEditClassEdgeLabel?: () => void;
  currentClassStyle?: Record<string, string>;
  onEditClassNode?: (name: string) => void;
  onMoveClassToNamespace?: (className: string, target: string) => void;
  onMoveClassToNewNamespace?: (className: string) => void;
  onRemoveClassFromNamespace?: (className: string) => void;
  onDeleteClassNote?: (noteIndex: number) => void;
  onDeleteClassNamespace?: (name: string) => void;
  onDeleteClassNode?: (name: string) => void;
  onSetClassStyle?: (name: string, patch: Record<string, string>) => void;
  onResetClassStyle?: (name: string) => void;
  currentEntityStyle?: Record<string, string>;
  onEditEntityNode?: (name: string) => void;
  onDuplicateEntity?: (name: string) => void;
  onDeleteEntity?: (name: string) => void;
  onSetEntityStyle?: (name: string, patch: Record<string, string>) => void;
  onResetEntityStyle?: (name: string) => void;
  onUpdateErRelationshipOperator?: (operator: string) => void;
  onDeleteErRelationship?: () => void;
  onEditErEdgeLabel?: () => void;
  onDeleteStateTransition?: () => void;
  onRenameStateNode?: () => void;
  onDeleteStateNote?: (noteIndex: number) => void;
  onDeleteStateNode?: (id: string) => void;
  onSetStateStyle?: (id: string, patch: Record<string, string>) => void;
  onResetStateStyle?: (id: string) => void;
  onAddStateNote?: (id: string, position: "left" | "right") => void;
  onFlipStateNote?: (noteIndex: number, position: "left" | "right") => void;
  onMoveStateIntoComposite?: (id: string, target: string) => void;
  onMoveStateToNewComposite?: (id: string) => void;
  onMoveStateToRoot?: (id: string) => void;
  onChangeStateShape?: (id: string, shape: StateNodeShapeKind) => void;
  onAddStateConcurrencyDivider?: (compositeId: string) => void;
  connectSourceClass: string | null;
  connectSourceNote: number | null;
  connectSourceNamespace: string | null;
  connectSourceEntity: string | null;
  connectSourceState: string | null;
  connectSourceStateNote: number | null;
  connectSourceStateIsComposite: boolean;
  connectSourceStateIsSpecial: boolean;
  connectSourceStateStyle: Record<string, string>;
  connectSourceStateNotePosition: "left" | "right" | undefined;
  stateCompositeNames: string[];
  connectSourceStateParent: string | null;
  classConnecting: boolean;
  erConnecting: boolean;
  stateConnecting: boolean;
  startClassConnectDrag: (
    e: React.MouseEvent<HTMLButtonElement>,
    source: { kind: "class"; name: string } | { kind: "note"; index: number },
  ) => void;
  startErConnectDrag: (e: React.MouseEvent<HTMLButtonElement>, sourceName: string) => void;
  startStateConnectDrag: (e: React.MouseEvent<HTMLButtonElement>, sourceId: string) => void;
  currentSequenceNotePosition?: "left" | "right" | "over" | null;
  onAddSequenceNote: (position: "left" | "right" | "over") => void;
  onMoveSequenceNote: (position: "left" | "right" | "over") => void;
  onChangeSequenceMessageType?: (operator: string) => void;
  currentSequenceMessageOperator?: string | null;
  onChangeSequenceParticipantType?: (typeKey: string) => void;
  currentSequenceParticipantType?: string | null;
  selectedMindmapNode: MindmapNode | null;
  onChangeMindmapShape?: (nodeId: string, shape: MindmapShapeKind) => void;
  onDeleteMindmapNode?: (nodeId: string) => void;
  onAddMindmapChild?: (nodeId: string) => void;
  selectedTimelineNode: TimelineNode | null;
  onTimelineAddEvent?: (nodeId: string, placement: "before" | "after") => void;
  onTimelineAddPeriodToSection?: (sectionId: string, placement: "before" | "after") => void;
  onTimelineAddPeriod?: (nodeId: string, placement: "before" | "after") => void;
  onTimelineAddSection?: (sectionId: string, placement: "before" | "after") => void;
  onTimelineDelete?: (nodeId: string) => void;
}

/**
 * The selection outline box and everything docked inside it: per-diagram-type
 * toolbar dispatch (edge/node toolbars), the selection comment anchor button,
 * the inline text editor, and the per-type purple `+` connection buttons.
 * Extracted verbatim from EditorCanvas; renders inside the pan/zoom transform.
 */
export function SelectionToolbar({
  code,
  currentType,
  scale,
  selectionBox,
  selectedNodeId,
  selectedSvgId,
  isLocked,
  isInlineEditing,
  setIsInlineEditing,
  connectionState,
  setConnectionState,
  textBox,
  theme,
  editingText,
  setEditingText,
  handleEditSubmit,
  handleFormatText,
  inlineInputRef,
  commentAnchorRef,
  onOpenSelectionCommentComposer,
  handleEditClick,
  handleAddNodeFromSelected,
  handleUpdateStyle,
  handleFormatNodeLabel,
  handleChangeShape,
  handleDuplicateNode,
  handleDeleteNode,
  onResetStyle,
  onUpdateEdgeStyle,
  onUpdateEdgeColor,
  onUpdateEdgeAnimation,
  onDeleteEdge,
  onUpdateClassRelationshipType,
  onSetClassRelationshipCardinality,
  onDeleteClassRelationship,
  onEditClassEdgeLabel,
  currentClassStyle,
  onEditClassNode,
  onMoveClassToNamespace,
  onMoveClassToNewNamespace,
  onRemoveClassFromNamespace,
  onDeleteClassNote,
  onDeleteClassNamespace,
  onDeleteClassNode,
  onSetClassStyle,
  onResetClassStyle,
  currentEntityStyle,
  onEditEntityNode,
  onDuplicateEntity,
  onDeleteEntity,
  onSetEntityStyle,
  onResetEntityStyle,
  onUpdateErRelationshipOperator,
  onDeleteErRelationship,
  onEditErEdgeLabel,
  onDeleteStateTransition,
  onRenameStateNode,
  onDeleteStateNote,
  onDeleteStateNode,
  onSetStateStyle,
  onResetStateStyle,
  onAddStateNote,
  onFlipStateNote,
  onMoveStateIntoComposite,
  onMoveStateToNewComposite,
  onMoveStateToRoot,
  onChangeStateShape,
  onAddStateConcurrencyDivider,
  connectSourceClass,
  connectSourceNote,
  connectSourceNamespace,
  connectSourceEntity,
  connectSourceState,
  connectSourceStateNote,
  connectSourceStateIsComposite,
  connectSourceStateIsSpecial,
  connectSourceStateStyle,
  connectSourceStateNotePosition,
  stateCompositeNames,
  connectSourceStateParent,
  classConnecting,
  erConnecting,
  stateConnecting,
  startClassConnectDrag,
  startErConnectDrag,
  startStateConnectDrag,
  currentSequenceNotePosition,
  onAddSequenceNote,
  onMoveSequenceNote,
  onChangeSequenceMessageType,
  currentSequenceMessageOperator,
  onChangeSequenceParticipantType,
  currentSequenceParticipantType,
  selectedMindmapNode,
  onChangeMindmapShape,
  onDeleteMindmapNode,
  onAddMindmapChild,
  selectedTimelineNode,
  onTimelineAddEvent,
  onTimelineAddPeriodToSection,
  onTimelineAddPeriod,
  onTimelineAddSection,
  onTimelineDelete,
}: SelectionToolbarProps) {
  return (
    <>
      {selectionBox && !isLocked && (
        <div
          data-scale-lock-border={selectedNodeId?.startsWith("SEQ_BLK_") ? undefined : "true"}
          data-scale-lock-shadow={selectedNodeId?.startsWith("SEQ_BLK_") ? undefined : "true"}
          /* z-[22] (above the z-[21] sequence hover grab overlays) so the inline
                       toolbar nested inside this box always paints and hit-tests ABOVE the
                       grab overlay of a neighbouring message that the toolbar floats over.
                       Without this, near the toolbar's top edge the overlay can intercept
                       the press and the dropdown intermittently fails to open. */
          className={`absolute pointer-events-none z-[22] ${selectedNodeId?.startsWith("SEQ_BLK_") ? "" : "border-indigo-500"}`}
          style={{
            left: selectionBox.x - (selectedNodeId?.startsWith("SEQ_MSG_") ? 0 : 4) / scale,
            top: selectionBox.y - (selectedNodeId?.startsWith("SEQ_MSG_") ? 1 : 4) / scale,
            width: selectionBox.width + (selectedNodeId?.startsWith("SEQ_MSG_") ? 0 : 8) / scale,
            height: selectionBox.height + (selectedNodeId?.startsWith("SEQ_MSG_") ? 2 : 8) / scale,
            borderRadius: `${6 / scale}px`,
            borderWidth: selectedNodeId?.startsWith("SEQ_BLK_")
              ? 0
              : `calc(1.25px * var(--zoom-inverse-scale, ${1 / scale}))`,
            borderStyle: "solid",
            borderColor: selectedNodeId?.startsWith("SEQ_BLK_") ? "transparent" : undefined,
            boxShadow: selectedNodeId?.startsWith("SEQ_BLK_")
              ? "none"
              : `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / scale})) rgba(99, 102, 241, 0.2)`,
          }}
        >
          {/*
                      Defensive guard: on a sequence diagram the only valid inline toolbars
                      are Edge/Sequence. If the selection is momentarily in an inconsistent
                      state (e.g. selectedNodeId cleared by onDeselect while selectionBox
                      still lingers during a zoom/transition, since they are separate state
                      updates), the `currentType === "sequence"` branch below renders nothing
                      instead of falling through to the flowchart NodeManipulationToolbar —
                      that would flash the wrong (flowchart) style bar.
                    */}
          {!isInlineEditing &&
            (selectedNodeId && selectedNodeId.startsWith("CLASS_EDGE_") ? (
              <ClassEdgeToolbar
                selectedNodeId={selectedNodeId}
                code={code}
                scale={scale}
                onUpdateRelationshipType={onUpdateClassRelationshipType || (() => {})}
                onSetCardinality={onSetClassRelationshipCardinality || (() => {})}
                onDeleteRelationship={onDeleteClassRelationship || (() => {})}
                onEditLabel={onEditClassEdgeLabel ? () => onEditClassEdgeLabel() : undefined}
              />
            ) : selectedNodeId && selectedNodeId.startsWith("ER_EDGE_") ? (
              <ErEdgeToolbar
                selectedNodeId={selectedNodeId}
                code={code}
                scale={scale}
                onUpdateOperator={onUpdateErRelationshipOperator || (() => {})}
                onEditLabel={() => onEditErEdgeLabel?.()}
                onDeleteRelationship={onDeleteErRelationship || (() => {})}
              />
            ) : selectedNodeId && selectedNodeId.startsWith("STATE_EDGE_") ? (
              <StateEdgeToolbar
                selectedNodeId={selectedNodeId}
                code={code}
                scale={scale}
                onDeleteTransition={() => onDeleteStateTransition?.()}
              />
            ) : selectedNodeId && isEdgeId(selectedNodeId) ? (
              <EdgeManipulationToolbar
                code={code}
                selectedNodeId={selectedNodeId}
                currentType={currentType}
                selectedSvgId={selectedSvgId}
                scale={scale}
                onUpdateStyle={onUpdateEdgeStyle || (() => {})}
                onUpdateColor={onUpdateEdgeColor || (() => {})}
                onUpdateAnimation={onUpdateEdgeAnimation}
                onEditLabel={(e) => handleEditClick(e)}
                onDeleteEdge={onDeleteEdge || (() => {})}
              />
            ) : selectedNodeId &&
              (selectedNodeId.startsWith("SEQ_ACTOR_") ||
                selectedNodeId.startsWith("SEQ_MSG_") ||
                selectedNodeId.startsWith("SEQ_NOTE_")) ? (
              <SequenceManipulationToolbar
                selectedNodeId={selectedNodeId}
                scale={scale}
                currentNotePosition={currentSequenceNotePosition}
                onEditLabel={(e) => handleEditClick(e)}
                onAddNote={onAddSequenceNote}
                onMoveNote={onMoveSequenceNote}
                onChangeMessageType={onChangeSequenceMessageType}
                currentMessageOperator={currentSequenceMessageOperator}
                onChangeParticipantType={onChangeSequenceParticipantType}
                currentParticipantType={currentSequenceParticipantType}
                onDeleteNode={handleDeleteNode}
              />
            ) : currentType === "classDiagram" &&
              (connectSourceClass || connectSourceNote !== null || connectSourceNamespace) ? (
              <ClassNodeToolbar
                kind={
                  connectSourceNote !== null
                    ? "note"
                    : connectSourceNamespace
                      ? "namespace"
                      : "class"
                }
                scale={scale}
                namespaces={getNamespaceNames(code)}
                currentNamespace={
                  connectSourceClass ? getClassNamespace(code, connectSourceClass) : null
                }
                onRename={
                  onEditClassNode && connectSourceClass
                    ? () => onEditClassNode!(connectSourceClass!)
                    : undefined
                }
                onMoveToNamespace={(target) => {
                  if (connectSourceClass) onMoveClassToNamespace?.(connectSourceClass, target);
                }}
                onMoveToNewNamespace={() => {
                  if (connectSourceClass) onMoveClassToNewNamespace?.(connectSourceClass);
                }}
                onRemoveFromNamespace={() => {
                  if (connectSourceClass) onRemoveClassFromNamespace?.(connectSourceClass);
                }}
                onDelete={() => {
                  if (connectSourceNote !== null) onDeleteClassNote?.(connectSourceNote);
                  else if (connectSourceNamespace) onDeleteClassNamespace?.(connectSourceNamespace);
                  else if (connectSourceClass) onDeleteClassNode?.(connectSourceClass);
                }}
                currentStyle={currentClassStyle ?? {}}
                onSetStyle={(patch) => {
                  if (connectSourceClass) onSetClassStyle?.(connectSourceClass, patch);
                }}
                onResetStyle={() => {
                  if (connectSourceClass) onResetClassStyle?.(connectSourceClass);
                }}
              />
            ) : currentType === "erDiagram" && connectSourceEntity ? (
              <ErNodeToolbar
                scale={scale}
                currentStyle={currentEntityStyle ?? {}}
                onRename={
                  onEditEntityNode ? () => onEditEntityNode!(connectSourceEntity!) : undefined
                }
                onDuplicate={() => onDuplicateEntity?.(connectSourceEntity)}
                onDelete={() => onDeleteEntity?.(connectSourceEntity)}
                onSetStyle={(patch) => onSetEntityStyle?.(connectSourceEntity, patch)}
                onResetStyle={() => onResetEntityStyle?.(connectSourceEntity)}
              />
            ) : currentType === "stateDiagram" &&
              (connectSourceState || connectSourceStateNote !== null) ? (
              <StateNodeToolbar
                kind={
                  connectSourceStateNote !== null
                    ? "note"
                    : connectSourceStateIsComposite
                      ? "composite"
                      : "state"
                }
                scale={scale}
                onRename={
                  // Notes + states/composites are all renamable; choice/fork/join are
                  // shape-only (omit Rename for them).
                  onRenameStateNode && !connectSourceStateIsSpecial
                    ? () => onRenameStateNode()
                    : undefined
                }
                onDelete={() => {
                  if (connectSourceStateNote !== null) onDeleteStateNote?.(connectSourceStateNote);
                  else if (connectSourceState) onDeleteStateNode?.(connectSourceState);
                }}
                currentStyle={connectSourceStateStyle}
                onSetStyle={
                  connectSourceState && !connectSourceStateIsSpecial
                    ? (patch) => onSetStateStyle?.(connectSourceState, patch)
                    : undefined
                }
                onResetStyle={
                  connectSourceState && !connectSourceStateIsSpecial
                    ? () => onResetStateStyle?.(connectSourceState)
                    : undefined
                }
                onAddNote={
                  connectSourceState && !connectSourceStateIsSpecial
                    ? (position) => onAddStateNote?.(connectSourceState, position)
                    : undefined
                }
                notePosition={connectSourceStateNotePosition}
                onFlipNote={
                  connectSourceStateNote !== null
                    ? () =>
                        onFlipStateNote?.(
                          connectSourceStateNote,
                          connectSourceStateNotePosition === "left" ? "right" : "left",
                        )
                    : undefined
                }
                composites={
                  connectSourceStateIsComposite
                    ? stateCompositeNames.filter((n) => n !== connectSourceState)
                    : stateCompositeNames
                }
                currentComposite={connectSourceStateParent}
                onMoveIntoComposite={
                  connectSourceState && !connectSourceStateIsSpecial
                    ? (target) => onMoveStateIntoComposite?.(connectSourceState, target)
                    : undefined
                }
                onMoveToNewComposite={
                  connectSourceState && !connectSourceStateIsSpecial
                    ? () => onMoveStateToNewComposite?.(connectSourceState)
                    : undefined
                }
                onMoveToRoot={
                  connectSourceState && !connectSourceStateIsSpecial
                    ? () => onMoveStateToRoot?.(connectSourceState)
                    : undefined
                }
                currentShape={
                  connectSourceState ? getStateNodeShape(code, connectSourceState) : "state"
                }
                onChangeShape={
                  connectSourceState && !connectSourceStateIsComposite
                    ? (shape) => onChangeStateShape?.(connectSourceState, shape)
                    : undefined
                }
                onAddConcurrencyDivider={
                  connectSourceState && connectSourceStateIsComposite
                    ? () => onAddStateConcurrencyDivider?.(connectSourceState)
                    : undefined
                }
              />
            ) : currentType === "mindmap" && selectedMindmapNode ? (
              <MindmapNodeToolbar
                scale={scale}
                currentShape={selectedMindmapNode.shape}
                onChangeShape={(shape) => onChangeMindmapShape?.(selectedMindmapNode.id, shape)}
                onDelete={() => onDeleteMindmapNode?.(selectedMindmapNode.id)}
              />
            ) : currentType === "timeline" && selectedTimelineNode ? (
              <TimelineNodeToolbar
                scale={scale}
                node={selectedTimelineNode}
                direction={getTimelineDirection(code)}
                onAddEvent={(placement) => onTimelineAddEvent?.(selectedTimelineNode.id, placement)}
                onAddPeriod={(placement) =>
                  selectedTimelineNode.kind === "section"
                    ? onTimelineAddPeriodToSection?.(selectedTimelineNode.id, placement)
                    : onTimelineAddPeriod?.(selectedTimelineNode.id, placement)
                }
                onAddSection={(placement) =>
                  onTimelineAddSection?.(selectedTimelineNode.id, placement)
                }
                onEditLabel={(e) => handleEditClick(e)}
                onDelete={() => onTimelineDelete?.(selectedTimelineNode.id)}
              />
            ) : currentType === "sequence" ||
              currentType === "classDiagram" ||
              currentType === "erDiagram" ||
              currentType === "stateDiagram" ||
              currentType === "mindmap" ||
              currentType === "timeline" ? null : (
              <NodeManipulationToolbar
                code={code}
                selectedNodeId={selectedNodeId}
                currentType={currentType}
                selectedSvgId={selectedSvgId}
                scale={scale}
                onEditLabel={(e) => handleEditClick(e)}
                onUpdateStyle={handleUpdateStyle}
                onFormatNodeLabel={handleFormatNodeLabel}
                onChangeShape={handleChangeShape}
                onDuplicateNode={handleDuplicateNode}
                onDeleteNode={handleDeleteNode}
                onResetStyle={onResetStyle}
              />
            ))}

          {onOpenSelectionCommentComposer && selectedNodeId && (
            <button
              ref={commentAnchorRef}
              type="button"
              data-scale-lock
              data-inline-toolbar
              // Keep this affordance fully outside sequence selection outlines. Do not
              // use selection geometry or CommentLayer pin offsets to position it.
              data-base-transform="translate(60%, -50%)"
              className="absolute right-0 top-0 z-[23] flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-indigo-600 shadow-lg transition-colors hover:bg-indigo-50 pointer-events-auto dark:bg-zinc-900 dark:text-indigo-300 dark:hover:bg-zinc-800"
              style={{
                transform: `translate(60%, -50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
              }}
              title="Add comment to selection"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSelectionCommentComposer();
              }}
            >
              <MessageSquareText className="h-4 w-4" />
            </button>
          )}

          <InlineTextEditor
            isInlineEditing={isInlineEditing}
            setIsInlineEditing={setIsInlineEditing}
            textBox={textBox}
            selectionBox={selectionBox}
            scale={scale}
            theme={theme}
            editingText={editingText}
            setEditingText={setEditingText}
            handleEditSubmit={handleEditSubmit}
            // Only flowchart/graph labels render real HTML (foreignObject), so the
            // format toolbar (B/I/align) is only safe there. Sequence/timeline render
            // plain SVG text and would otherwise inject literal HTML markup.
            handleFormatText={
              currentType === "graph" || currentType === "flowchart" ? handleFormatText : undefined
            }
            inlineInputRef={inlineInputRef}
            selectedSvgId={selectedSvgId}
          />

          {!isInlineEditing && currentType === "mindmap" && selectedMindmapNode && selectionBox && (
            <div
              data-scale-lock
              data-base-transform="translateX(-50%) translateY(100%)"
              className="absolute left-1/2 pointer-events-auto origin-top"
              style={{
                bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / scale}))`,
                transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
              }}
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddMindmapChild?.(selectedMindmapNode.id);
                }}
                className="h-5 w-5 rounded-full bg-indigo-500 text-white shadow-md transition-transform hover:scale-110 hover:bg-indigo-600 flex items-center justify-center"
                title="Click to add child element"
              >
                <Plus className="h-3 w-3 pointer-events-none" />
              </button>
            </div>
          )}

          {!isInlineEditing &&
            currentType !== "sequence" &&
            currentType !== "classDiagram" &&
            currentType !== "erDiagram" &&
            currentType !== "stateDiagram" &&
            currentType !== "mindmap" &&
            currentType !== "timeline" &&
            (!selectedNodeId ||
              (!isEdgeId(selectedNodeId) &&
                !selectedNodeId.startsWith("SEQ_MSG_") &&
                !selectedNodeId.startsWith("SEQ_NOTE_"))) && (
              <div
                data-scale-lock
                data-base-transform="translateX(-50%) translateY(100%)"
                className="absolute left-1/2 pointer-events-auto origin-top"
                style={{
                  bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / scale}))`,
                  transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
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
                        ? {
                            x: selectionBox.x + selectionBox.width / 2,
                            y: selectionBox.y + selectionBox.height + 4,
                          }
                        : null,
                      mousePos: null,
                      isDragging: false,
                      snapTargetId: null,
                      snapTargetPos: null,
                      anchorY: null,
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
                        anchorY: null,
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

          {/* Class-diagram connection + (purple): drag to relate to another class, link a
                        note, or drop on empty canvas to create a new class/note. */}
          {!isInlineEditing &&
            currentType === "classDiagram" &&
            connectSourceClass &&
            selectionBox &&
            !classConnecting && (
              <div
                data-scale-lock
                data-base-transform="translateX(-50%) translateY(100%)"
                className="absolute left-1/2 pointer-events-auto origin-top"
                style={{
                  bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / scale}))`,
                  transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
                }}
              >
                <button
                  className="class-connect-btn w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                  title="Drag to link a class or note"
                  onMouseDown={(e) =>
                    startClassConnectDrag(e, { kind: "class", name: connectSourceClass })
                  }
                >
                  <Plus className="w-3 h-3 pointer-events-none" />
                </button>
              </div>
            )}

          {/* Class-diagram NOTE connection + (purple): drag the note onto a class to
                        attach it (`note for <Class>`). */}
          {!isInlineEditing &&
            currentType === "classDiagram" &&
            connectSourceNote !== null &&
            selectionBox &&
            !classConnecting && (
              <div
                data-scale-lock
                data-base-transform="translateX(-50%) translateY(100%)"
                className="absolute left-1/2 pointer-events-auto origin-top"
                style={{
                  bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / scale}))`,
                  transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
                }}
              >
                <button
                  className="class-connect-btn w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                  title="Drag onto a class to attach this note"
                  onMouseDown={(e) =>
                    startClassConnectDrag(e, { kind: "note", index: connectSourceNote })
                  }
                >
                  <Plus className="w-3 h-3 pointer-events-none" />
                </button>
              </div>
            )}

          {/* ER-diagram connection + (purple): drag from a selected entity onto another
                        entity to create a relationship (US1 drag-to-connect). */}
          {!isInlineEditing &&
            currentType === "erDiagram" &&
            connectSourceEntity &&
            selectionBox &&
            !erConnecting && (
              <div
                data-scale-lock
                data-base-transform="translateX(-50%) translateY(100%)"
                className="absolute left-1/2 pointer-events-auto origin-top"
                style={{
                  bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / scale}))`,
                  transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
                }}
              >
                <button
                  className="er-connect-btn w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                  title="Drag onto another entity to relate, or onto empty canvas to create a linked entity"
                  onMouseDown={(e) => startErConnectDrag(e, connectSourceEntity)}
                >
                  <Plus className="w-3 h-3 pointer-events-none" />
                </button>
              </div>
            )}

          {/* State-diagram connection + (purple): drag from a selected state onto another
                        state to create a transition, or onto empty canvas to create a linked state. */}
          {!isInlineEditing &&
            currentType === "stateDiagram" &&
            connectSourceState &&
            selectionBox &&
            !stateConnecting && (
              <div
                data-scale-lock
                data-base-transform="translateX(-50%) translateY(100%)"
                className="absolute left-1/2 pointer-events-auto origin-top"
                style={{
                  bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / scale}))`,
                  transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
                }}
              >
                <button
                  className="state-connect-btn w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                  title="Drag onto another state to add a transition, or onto empty canvas to choose a shape to create"
                  onMouseDown={(e) => startStateConnectDrag(e, connectSourceState)}
                >
                  <Plus className="w-3 h-3 pointer-events-none" />
                </button>
              </div>
            )}
        </div>
      )}
    </>
  );
}
