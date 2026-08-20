import {
  TransformWrapper,
  TransformComponent,
  useControls,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  Lock,
  Unlock,
  Plus,
  Pencil,
  RotateCcw,
  GitBranch,
  SquareStack,
  MessageSquareText,
} from "lucide-react";
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
import { ErPropertyPanel } from "./ErPropertyPanel";
import { InlineTextEditor } from "./InlineTextEditor";
import { ClassPropertyPanel } from "./ClassPropertyPanel";
import { ClassConnectMenu, type ClassConnectMenuState } from "./ClassConnectMenu";
import { CommentLayer } from "./CommentLayer";
import { StableMermaidHtml } from "./StableMermaidHtml";
import { isEdgeId } from "@/lib/diagrams/utils";
import {
  classNameFromSvgId,
  getNamespaceNames,
  getClassNamespace,
} from "@/lib/diagrams/classDiagram";
import type { ParsedClass, ClassEdits } from "@/lib/diagrams/classDiagram";
import { entityNameFromSvgId } from "@/lib/diagrams/erDiagram";
import type { ParsedEntity, EntityEdits } from "@/lib/diagrams/erDiagram";
import {
  stateNameFromSvgId,
  isCompositeState,
  isSpecialStateNode,
  getStateStyle,
  getCompositeNames,
  getStateParentComposite,
  getStateNotes,
  getStateNodeShape,
  hasStartState,
  hasEndState,
} from "@/lib/diagrams/stateDiagram";
import type { StateNodeShapeKind, StateShapeKind } from "@/lib/diagrams/stateDiagram";
import { getMindmapNode, parseMindmap, type MindmapShapeKind } from "@/lib/diagrams/mindmap";
import {
  findTimelineSvgElementByNodeId,
  getTimelineDirection,
  getTimelineNode,
  parseTimeline,
  timelineHasNodes,
  timelineRenderOrder,
  timelineSubtreeIds,
  type TimelineNodeKind,
  type TimelinePeriodNode,
  type TimelineSectionNode,
} from "@/lib/diagrams/timeline";
import { TimelineNodeToolbar } from "./TimelineNodeToolbar";
import { StateConnectMenu, type StateConnectMenuState } from "./StateConnectMenu";
import { TimelineAddButtons } from "./TimelineNodeToolbar";
import type { SequenceBlockArea, SequenceBlockType } from "@/hooks/useCanvasInteraction";
import { findOwningLineForSequenceLabel } from "@/hooks/useCanvasInteraction";
import { findSeqReorderTargetSlot } from "@/lib/diagrams/sequenceReorder";
import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BASIC_SHAPES, EXTENDED_SHAPES, type ShapeOption } from "@/lib/diagrams/flowchart";
import type { ConnectionState, ShapePicker } from "@/hooks/useCanvasInteraction";
import type { DiagramComment } from "@/lib/api/storage";
import { getSortedSequenceNoteTextElements } from "@/lib/diagrams/sequenceNotes";
import { EmptyCanvas } from "./EmptyCanvas";

const DEFAULT_CANVAS_INITIAL_SCALE = 2.75;

interface EditorCanvasProps {
  code: string;
  parseError: string | null;
  svgContent: string;
  isBlankDiagram?: boolean;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  isCommentMode?: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  handleSvgClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleSequenceHoverOver: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleSequenceHoverOut: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleSequenceMessageHoverEnter: (index: number) => void;
  handleSequenceMessageHoverMove: (index: number) => void;
  handleSequenceMessageHoverLeave: (index: number, e: React.PointerEvent<HTMLDivElement>) => void;
  handleEditClick: (e: React.MouseEvent | Event) => void;
  selectionBox: { x: number; y: number; width: number; height: number } | null;
  connectionState: {
    isDragging: boolean;
    mousePos: { x: number; y: number } | null;
    active: boolean;
    startNodeId: string | null;
    startPos: { x: number; y: number } | null;
    snapTargetId: string | null;
    snapTargetPos: { x: number; y: number } | null;
    anchorY: number | null;
  };
  setConnectionState: (state: React.SetStateAction<ConnectionState>) => void;
  sequenceLifelineOverlay: { actorId: string; x: number; slots: number[] } | null;
  hoveredSequenceActorBox: { x: number; y: number; width: number; height: number } | null;
  hoveredSequenceMessageBox: { x: number; y: number; width: number; height: number } | null;
  hoveredSequenceMessageIndex: number | null;
  hoveredSequenceNoteBox: { x: number; y: number; width: number; height: number } | null;
  hoveredFlowchartNodeBox: { x: number; y: number; width: number; height: number } | null;
  comments?: DiagramComment[];
  activeCommentId?: string | null;
  activeCommentFocusToken?: number;
  onActivateComment?: (commentId: string | null) => void;
  onOpenSelectionCommentComposer?: () => void;
  commentComposer?: {
    anchor: import("@/lib/api/storage").DiagramCommentAnchor;
    position: { x: number; y: number };
    targetLabel: string;
    commentMode: "shape" | "canvas";
  } | null;
  commentDraft?: string;
  setCommentDraft?: (value: string) => void;
  onSubmitCommentComposer?: (content?: string) => void;
  commentReplyDrafts?: Record<string, string>;
  onChangeCommentReplyDraft?: (commentId: string, value: string) => void;
  onSubmitCommentReply?: (commentId: string) => void;
  onToggleCommentResolved?: (commentId: string, resolved: boolean) => void;
  renderIdRef?: React.MutableRefObject<string | null>;
  commentsRailWidth?: number;
  sequenceMessageEntries?: Array<{ index: number; line: string }>;
  sequenceMessageTriggerAreas: Array<{
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  sequenceBlockAreas?: SequenceBlockArea[];
  startSequenceConnection: (actorId: string, anchorY: number) => void;
  onSequencePlusSelfLoop: (actorId: string, anchorY: number) => void;
  onSequencePlusNote: (
    actorId: string,
    anchorY: number,
    position: "left" | "right" | "over",
  ) => void;
  onSequencePlusBlock?: (anchorY: number, type: SequenceBlockType) => void;
  onHoveredSequenceMessageHover: (index: number) => void;
  onHoveredSequenceMessageClick: (index: number) => void;
  onHoveredSequenceMessageDoubleClick: (index: number) => void;
  onHoveredSequenceNoteClick?: (index: number) => void;
  onHoveredSequenceNoteDoubleClick?: (index: number) => void;
  onReorderSequenceItem?: (item: { kind: "msg" | "note"; index: number }, toSlot: number) => void;
  onReorderSequenceLifelines?: (newOrderIds: string[]) => void;
  getSequenceLifelines?: () => Array<{ actorId: string; x: number; y1: number; y2: number }>;
  currentSequenceNotePosition?: "left" | "right" | "over" | null;
  isInlineEditing: boolean;
  selectedSvgId: string | null;
  selectedNodeId: string | null;
  currentType: string;
  /** Class-diagram property panel: the parsed class currently selected (null otherwise). */
  selectedClass?: ParsedClass | null;
  onApplyClassEdits?: (edits: ClassEdits) => void;
  onCloseClassPanel?: () => void;
  /** Class-diagram property panel: report whether it holds invalid attribute/method rows. */
  onClassPanelValidityChange?: (hasErrors: boolean) => void;
  /** Class-diagram connection drag (the purple +): create relationships / link notes. */
  onAddClassRelationship?: (source: string, target: string, operator: string) => void;
  onLinkNoteToClass?: (noteIndex: number, className: string) => void;
  onCreateClassLinked?: (source: string, operator: string) => void;
  onCreateNoteForClass?: (source: string) => void;
  /** Class-diagram relationship-edge toolbar: mutate operator / cardinality / delete. */
  onUpdateClassRelationshipType?: (operator: string) => void;
  onSetClassRelationshipCardinality?: (sourceCard: string, targetCard: string) => void;
  onDeleteClassRelationship?: () => void;
  /** Class-diagram relationship-edge toolbar: enter inline label editing. */
  onEditClassEdgeLabel?: () => void;
  /** Class-diagram node toolbar (single-click): delete a class / note. */
  onDeleteClassNode?: (name: string) => void;
  onDeleteClassNote?: (noteIndex: number) => void;
  /** Class-diagram node toolbar: open the property panel for the selected class. */
  onEditClassNode?: (name: string) => void;
  /** Class-diagram namespace containers: delete (unwrap) + relocate classes between namespaces. */
  onDeleteClassNamespace?: (name: string) => void;
  onMoveClassToNamespace?: (className: string, target: string) => void;
  onMoveClassToNewNamespace?: (className: string) => void;
  onRemoveClassFromNamespace?: (className: string) => void;
  /** Class-diagram node toolbar: localized `style <Class> …` overrides (mirrors ER / state). */
  onSetClassStyle?: (name: string, patch: Record<string, string>) => void;
  onResetClassStyle?: (name: string) => void;
  /** The selected class's current `style` property map (for the style popover's active states). */
  currentClassStyle?: Record<string, string>;
  /** ER-diagram property panel: the parsed entity currently selected (null otherwise). */
  selectedEntity?: ParsedEntity | null;
  onApplyEntityEdits?: (edits: EntityEdits) => void;
  onCloseEntityPanel?: () => void;
  onEntityPanelValidityChange?: (hasErrors: boolean) => void;
  /** ER-diagram node toolbar (single-click): duplicate / style / delete the entity. */
  onDuplicateEntity?: (name: string) => void;
  onDeleteEntity?: (name: string) => void;
  /** ER-diagram node toolbar: open the property panel for the selected entity. */
  onEditEntityNode?: (name: string) => void;
  onSetEntityStyle?: (name: string, patch: Record<string, string>) => void;
  onResetEntityStyle?: (name: string) => void;
  /** The selected entity's current `style` property map (for the style popover's active states). */
  currentEntityStyle?: Record<string, string>;
  /** ER-diagram relationship edge toolbar: mutate operator (cardinality/line), delete, edit label. */
  onUpdateErRelationshipOperator?: (operator: string) => void;
  onDeleteErRelationship?: () => void;
  onEditErEdgeLabel?: () => void;
  /** ER-diagram drag-to-connect: create a relationship between two entities (US1). */
  onAddErRelationship?: (source: string, target: string) => void;
  /** ER-diagram drag-to-connect onto empty canvas: create a NEW entity linked to the source. */
  onCreateErEntityLinked?: (source: string) => void;
  /** State-diagram node toolbar (single-click): delete a state / composite, delete a note, rename. */
  onDeleteStateNode?: (id: string) => void;
  onDeleteStateNote?: (noteIndex: number) => void;
  onRenameStateNode?: () => void;
  /** State-diagram node styling (Phase 4): localized `style <id> …` overrides. */
  onSetStateStyle?: (id: string, patch: Record<string, string>) => void;
  onResetStateStyle?: (id: string) => void;
  /** State-diagram quick-annotation (Phase 4): attach a note to the selected state / composite. */
  onAddStateNote?: (id: string, position: "left" | "right") => void;
  /** State-diagram note flip (Phase 4): toggle a note between left / right. */
  onFlipStateNote?: (noteIndex: number, position: "left" | "right") => void;
  /** State-diagram composite nesting (Phase 5): relocate a state into / between / out of composites. */
  onMoveStateIntoComposite?: (id: string, target: string) => void;
  onMoveStateToNewComposite?: (id: string) => void;
  onMoveStateToRoot?: (id: string) => void;
  onChangeStateShape?: (id: string, shape: StateNodeShapeKind) => void;
  /** State-diagram concurrency divider (Phase 5): open a parallel region inside a composite. */
  onAddStateConcurrencyDivider?: (compositeId: string) => void;
  /** State-diagram transition edge toolbar: delete the transition. */
  onDeleteStateTransition?: () => void;
  /** State-diagram drag-to-connect: create a transition, or a new linked shape on empty canvas. */
  onAddStateTransition?: (source: string, target: string) => void;
  /** Drop-on-empty-canvas: create the chosen shape and link `source --> <shape>` in one edit. */
  onCreateStateShapeLinked?: (source: string, kind: StateShapeKind) => void;
  onAddMindmapChild?: (nodeId: string) => void;
  onDeleteMindmapNode?: (nodeId: string) => void;
  onChangeMindmapShape?: (nodeId: string, shape: MindmapShapeKind) => void;
  /** Timeline: add an event before/after an event, or append one to a period. */
  onTimelineAddEvent?: (nodeId: string, placement: "before" | "after") => void;
  /** Timeline: add a new period before/after the target event or period. */
  onTimelineAddPeriod?: (nodeId: string, placement: "before" | "after") => void;
  /** Timeline: add a new period before/after the periods of a section. */
  onTimelineAddPeriodToSection?: (sectionId: string, placement: "before" | "after") => void;
  /** Timeline: add a new section before/after the target section. */
  onTimelineAddSection?: (sectionId: string, placement: "before" | "after") => void;
  /** Timeline: delete a node (event/period/section). */
  onTimelineDelete?: (nodeId: string) => void;
  /** Timeline: drag-reorder a node before/after another node. */
  onTimelineMove?: (sourceId: string, targetId: string, placement: "before" | "after") => void;
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
  onAddSequenceNote: (position: "left" | "right" | "over") => void;
  onMoveSequenceNote: (position: "left" | "right" | "over") => void;
  onChangeSequenceMessageType?: (operator: string) => void;
  currentSequenceMessageOperator?: string | null;
  onChangeSequenceParticipantType?: (typeKey: string) => void;
  currentSequenceParticipantType?: string | null;
  onChangeSequenceMessageEndpoint?: (endpoint: "source" | "target", newActorId: string) => void;
  getSequenceMessageEndpointGeometry?: (messageIndex: number) => {
    from: string;
    to: string;
    isSelf: boolean;
    source: { x: number; y: number };
    target: { x: number; y: number };
    lifelines: Array<{ actorId: string; x: number }>;
  } | null;
  onLinkSequenceNote?: () => void;
  setIsInlineEditing: (v: boolean) => void;
  textBox: { x: number; y: number; width: number; height: number } | null;
  theme: string | undefined;
  editingText: string;
  setEditingText: (text: string) => void;
  handleEditSubmit: () => void;
  handleFormatText?: (format: string, colorValue?: string) => void;
  inlineInputRef: RefObject<HTMLDivElement | null>;
  onDeselect?: () => void;
  onResetStyle?: () => void;
  onUpdateEdgeStyle?: (updates: { stroke?: string; arrowType?: string; label?: string }) => void;
  onUpdateEdgeColor?: (hexColor: string) => void;
  onUpdateEdgeCurve?: (curve: string) => void;
  onUpdateEdgeAnimation?: (animate: boolean) => void;
  onDeleteEdge?: () => void;
  shapePicker: { x: number; y: number; startNodeId: string } | null;
  setShapePicker: (state: React.SetStateAction<ShapePicker | null>) => void;
  handleCodeChange?: (code: string) => void;
  selectedNodeIds?: string[];
  dragState?: unknown;
  setDragState?: (state: unknown) => void;
}

/**
 * Given a target node's bounding box (shell-relative `cx`/`cy`/`w`/`h`) and a cursor point (also
 * shell-relative), return the nearest perimeter "anchor" — the midpoint of whichever edge
 * (Top / Bottom / Left / Right) is closest to the cursor. Used purely as a VISUAL docking
 * affordance for connect-drag previews: the dashed preview line snaps its endpoint to this anchor
 * and a dot is drawn there. It never affects serialization — drops always resolve to the target
 * node identity (`source --> target`), since Mermaid owns all edge layout and has no anchor-side
 * syntax.
 */
function nearestPerimeterAnchor(
  box: { cx: number; cy: number; w: number; h: number },
  cursorX: number,
  cursorY: number,
): { x: number; y: number } {
  const left = box.cx;
  const right = box.cx + box.w;
  const top = box.cy;
  const bottom = box.cy + box.h;
  const midX = box.cx + box.w / 2;
  const midY = box.cy + box.h / 2;
  const anchors = [
    { x: midX, y: top }, // Top
    { x: midX, y: bottom }, // Bottom
    { x: left, y: midY }, // Left
    { x: right, y: midY }, // Right
  ];
  let best = anchors[0];
  let bestDist = Infinity;
  for (const a of anchors) {
    const dx = a.x - cursorX;
    const dy = a.y - cursorY;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

function shellBoxFromRect(
  rect: DOMRect,
  shellRect: DOMRect,
): { cx: number; cy: number; w: number; h: number } {
  return {
    cx: rect.left - shellRect.left,
    cy: rect.top - shellRect.top,
    w: rect.width,
    h: rect.height,
  };
}

function shellBoxFromElement(
  el: Element | null,
  shellRect: DOMRect,
): { cx: number; cy: number; w: number; h: number } | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return shellBoxFromRect(rect, shellRect);
}

function CommentFocusSync({
  activeCommentId,
  activeCommentFocusToken,
  commentsRailWidth,
}: {
  activeCommentId: string | null;
  activeCommentFocusToken: number;
  commentsRailWidth: number;
}) {
  const { state, zoomToElement } = useControls();
  const commentsRailWidthRef = useRef(commentsRailWidth);
  const lastAppliedFocusTokenRef = useRef<number | null>(null);

  useEffect(() => {
    commentsRailWidthRef.current = commentsRailWidth;
  }, [commentsRailWidth]);

  useEffect(() => {
    if (!activeCommentId) return;
    if (lastAppliedFocusTokenRef.current === activeCommentFocusToken) return;
    lastAppliedFocusTokenRef.current = activeCommentFocusToken;

    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(`comment-pin-${activeCommentId}`);
      if (!node) return;

      zoomToElement(
        node,
        state.scale,
        320,
        "easeOut",
        commentsRailWidthRef.current > 0 ? -(commentsRailWidthRef.current / 2) : 0,
        0,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeCommentId, activeCommentFocusToken, state.scale, zoomToElement]);

  return null;
}

type TimelineReorderNode = {
  id: string;
  kind: TimelineNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * A candidate drop slot during a timeline reorder drag. For sections/periods the slot is a
 * boundary band between adjacent columns and the guide sits on that boundary (`columnMode: false`).
 * For child events the slot spans the hovered parent period column and the guide is centered on the
 * column's cross-axis (`columnMode: true`) so it never overlaps the column division lines.
 * `axis` is the cursor axis used for hit-testing distance, `crossStart/crossEnd` the column span on
 * the OTHER axis used for containment, and `guidePos` the guide line position (boundary position for
 * columns, cross-axis center for events). `spanStart/spanEnd` bound the guide line's extent.
 */
type TimelineReorderSlot = {
  id: string;
  placement: "before" | "after";
  x: number;
  y: number;
  w: number;
  h: number;
  axis: "x" | "y";
  crossStart: number;
  crossEnd: number;
  guidePos: number;
  spanStart: number;
  spanEnd: number;
  columnMode: boolean;
  /**
   * Optional main-axis hit tolerance override. For child-event slots this covers the target
   * event's own extent (e.g. 300px-wide TD events) so dropping anywhere on the event activates
   * the slot; boundary slots fall back to the default (slot marker half-width + tolerance).
   */
  hitTol?: number;
};

/** Screenspace bounding box of a timeline section container, for section highlight on period drag. */
type TimelineSectionBounds = {
  sectionId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function EditorCanvas({
  code,
  parseError,
  svgContent,
  isBlankDiagram = false,
  isLocked,
  setIsLocked,
  containerRef,
  handleSvgClick,
  handleMouseMove,
  handleMouseUp,
  handleSequenceHoverOver,
  handleSequenceHoverOut,
  handleSequenceMessageHoverEnter,
  handleSequenceMessageHoverMove,
  handleSequenceMessageHoverLeave,
  handleEditClick,
  selectionBox,
  connectionState,
  setConnectionState,
  sequenceLifelineOverlay,
  hoveredSequenceActorBox,
  hoveredSequenceMessageBox,
  hoveredSequenceMessageIndex,
  hoveredSequenceNoteBox,
  hoveredFlowchartNodeBox,
  comments = [],
  activeCommentId = null,
  activeCommentFocusToken = 0,
  isCommentMode = false,
  onActivateComment,
  onOpenSelectionCommentComposer,
  commentComposer = null,
  commentDraft = "",
  setCommentDraft,
  onSubmitCommentComposer,
  commentReplyDrafts = {},
  onChangeCommentReplyDraft,
  onSubmitCommentReply,
  onToggleCommentResolved,
  renderIdRef,
  commentsRailWidth = 0,
  sequenceMessageEntries = [],
  getSequenceMessageEndpointGeometry,
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
  onReorderSequenceItem,
  onReorderSequenceLifelines,
  getSequenceLifelines,
  currentSequenceNotePosition,
  isInlineEditing,
  selectedSvgId,
  selectedNodeId,
  currentType,
  selectedClass,
  onApplyClassEdits,
  onCloseClassPanel,
  onClassPanelValidityChange,
  onAddClassRelationship,
  onLinkNoteToClass,
  onCreateClassLinked,
  onCreateNoteForClass,
  onUpdateClassRelationshipType,
  onSetClassRelationshipCardinality,
  onDeleteClassRelationship,
  onEditClassEdgeLabel,
  onDeleteClassNode,
  onDeleteClassNote,
  onEditClassNode,
  onDeleteClassNamespace,
  onMoveClassToNamespace,
  onMoveClassToNewNamespace,
  onRemoveClassFromNamespace,
  onSetClassStyle,
  onResetClassStyle,
  currentClassStyle,
  selectedEntity,
  onApplyEntityEdits,
  onCloseEntityPanel,
  onEntityPanelValidityChange,
  onDuplicateEntity,
  onDeleteEntity,
  onEditEntityNode,
  onSetEntityStyle,
  onResetEntityStyle,
  currentEntityStyle,
  onUpdateErRelationshipOperator,
  onDeleteErRelationship,
  onEditErEdgeLabel,
  onAddErRelationship,
  onCreateErEntityLinked,
  onDeleteStateNode,
  onDeleteStateNote,
  onRenameStateNode,
  onSetStateStyle,
  onResetStateStyle,
  onAddStateNote,
  onFlipStateNote,
  onMoveStateIntoComposite,
  onMoveStateToNewComposite,
  onMoveStateToRoot,
  onChangeStateShape,
  onAddStateConcurrencyDivider,
  onDeleteStateTransition,
  onAddStateTransition,
  onCreateStateShapeLinked,
  onAddMindmapChild,
  onDeleteMindmapNode,
  onChangeMindmapShape,
  onTimelineAddEvent,
  onTimelineAddPeriod,
  onTimelineAddPeriodToSection,
  onTimelineAddSection,
  onTimelineDelete,
  onTimelineMove,
  handleUpdateStyle,
  handleFormatNodeLabel,
  handleChangeShape,
  handleDuplicateNode,
  handleDeleteNode,
  onAddSequenceNote,
  onMoveSequenceNote,
  onChangeSequenceMessageType,
  currentSequenceMessageOperator,
  onChangeSequenceParticipantType,
  currentSequenceParticipantType,
  onChangeSequenceMessageEndpoint,
  onLinkSequenceNote,
  setIsInlineEditing,
  handleAddNodeFromSelected,
  textBox,
  theme,
  editingText,
  setEditingText,
  handleEditSubmit,
  handleFormatText,
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
  const selectedSvgSelector = useMemo(() => {
    if (!selectedSvgId) return null;
    const escapeCss =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape
        : (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    return `#${escapeCss(selectedSvgId)}`;
  }, [selectedSvgId]);

  useLayoutEffect(() => {
    if (!isInlineEditing || !textBox || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;
    const targetRect = {
      left: containerRect.left - container.scrollLeft + textBox.x * scale,
      top: containerRect.top - container.scrollTop + textBox.y * scale,
      right: containerRect.left - container.scrollLeft + (textBox.x + textBox.width) * scale,
      bottom: containerRect.top - container.scrollTop + (textBox.y + textBox.height) * scale,
    };
    const overlapPad = 6;
    const elements = new Set<HTMLElement | SVGElement>();

    if (selectedSvgSelector) {
      try {
        container
          .querySelectorAll<
            HTMLElement | SVGElement
          >(`${selectedSvgSelector}, ${selectedSvgSelector} .label, ${selectedSvgSelector} text, ${selectedSvgSelector} foreignObject, ${selectedSvgSelector} .nodeLabel, ${selectedSvgSelector} .cluster-label, ${selectedSvgSelector} .messageText, ${selectedSvgSelector} .noteText`)
          .forEach((el) => elements.add(el));
      } catch {
        // Ignore invalid third-party SVG ids; overlap fallback still handles the visible label.
      }
    }

    const overlapCandidates =
      selectedNodeId?.startsWith("SEQ_MSG_") ||
      selectedNodeId?.startsWith("SEQ_NOTE_") ||
      isEdgeId(selectedNodeId)
        ? container.querySelectorAll<HTMLElement | SVGElement>(
            ".messageText, .noteText, .edgeLabel, .nodeLabel, .cluster-label",
          )
        : container.querySelectorAll<HTMLElement | SVGElement>(
            ".nodeLabel, .cluster-label, .label, text, foreignObject",
          );

    overlapCandidates.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const overlaps =
        rect.right >= targetRect.left - overlapPad &&
        rect.left <= targetRect.right + overlapPad &&
        rect.bottom >= targetRect.top - overlapPad &&
        rect.top <= targetRect.bottom + overlapPad;
      if (overlaps) elements.add(el);
    });

    const previous = Array.from(elements).map((el) => ({
      el,
      opacity: el.style.opacity,
      visibility: el.style.visibility,
      pointerEvents: el.style.pointerEvents,
    }));

    previous.forEach(({ el }) => {
      el.style.opacity = "0";
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
    });

    return () => {
      previous.forEach(({ el, opacity, visibility, pointerEvents }) => {
        if (!el.isConnected) return;
        el.style.opacity = opacity;
        el.style.visibility = visibility;
        el.style.pointerEvents = pointerEvents;
      });
    };
  }, [containerRef, isInlineEditing, selectedNodeId, selectedSvgSelector, textBox]);
  const [sequencePlusMenu, setSequencePlusMenu] = useState<{
    actorId: string;
    anchorY: number;
    x: number;
    y: number;
    mode: "root" | "note" | "logic";
  } | null>(null);
  // Viewport-space indicator for sequence drag — lives outside the TransformWrapper so
  // canvas pan/zoom never affects its coordinate system. Positions are relative to canvasShellRef.
  const [seqDragIndicator, setSeqDragIndicator] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
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
  // True while a message endpoint (source/target) handle is being dragged across lifelines, so the
  // static handles hide and canvas panning stays disabled for the duration of the drag.
  const [seqEndpointDragging, setSeqEndpointDragging] = useState(false);
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
  // Viewport-space (canvasShellRef-relative) state for dragging a selected timeline node's grip to
  // reorder it before/after another node. Lives outside the TransformWrapper; canvas panning is
  // disabled while active (mirrors seqReorder). `nodes` holds every node's live screen-space box so
  // target resolution and the drop indicator share one consistent coordinate system.
  const [timelineReorder, setTimelineReorder] = useState<{
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
  } | null>(null);
  // Class-diagram connection drag (the purple +). All viewport-space (canvasShellRef-relative),
  // rendered outside TransformWrapper so pan/zoom never distorts it. `classConnecting` disables
  // canvas panning for the duration; `classConnect` is the live preview line + snap highlight;
  // `classConnectMenu` is the drop-point popover (relationship picker / create chip).
  const [classConnecting, setClassConnecting] = useState(false);
  const [classConnect, setClassConnect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    snap: { cx: number; cy: number; w: number; h: number } | null;
    anchor: { x: number; y: number } | null;
  } | null>(null);
  const [classConnectMenu, setClassConnectMenu] = useState<ClassConnectMenuState | null>(null);
  // ER drag-to-connect state (US1): the live preview line + snap highlight while dragging the
  // purple + from a selected entity toward a target entity. Mirrors the class connect drag.
  const [erConnecting, setErConnecting] = useState(false);
  const [erConnect, setErConnect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    snap: { cx: number; cy: number; w: number; h: number } | null;
    anchor: { x: number; y: number } | null;
  } | null>(null);
  // State drag-to-connect state: the live preview line + snap highlight while dragging the purple +
  // from a selected state toward a target state. Mirrors the ER/class connect drag.
  const [stateConnecting, setStateConnecting] = useState(false);
  const [stateConnect, setStateConnect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    snap: { cx: number; cy: number; w: number; h: number } | null;
    anchor: { x: number; y: number } | null;
  } | null>(null);
  // Drop-point "what shape?" popover shown when a state connect drag lands on empty canvas.
  const [stateConnectMenu, setStateConnectMenu] = useState<StateConnectMenuState | null>(null);
  const sequencePlusMenuRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the last sequence-message pointer interaction actually became a drag, so the
  // hover grab overlay can distinguish a reorder-drag from a plain click (select).
  const seqDidDragRef = useRef(false);
  // Manual double-click detector for sequence-message overlays. The native `dblclick`/`e.detail`
  // counter does NOT survive the hover→selected overlay element swap (the two clicks land on
  // different DOM nodes), so we time clicks ourselves keyed by message index.
  const seqLastClickRef = useRef<{ time: number; key: string }>({ time: 0, key: "" });
  const fallbackRenderIdRef = useRef<string | null>(null);
  const lastScaleRef = useRef(0);
  // Live react-zoom-pan-pinch instance (set in TransformWrapper onInit). Used to programmatically
  // pan the canvas during timeline reorder auto-scroll.
  const transformInstanceRef = useRef<ReactZoomPanPinchRef | null>(null);
  const commentAnchorRef = useRef<HTMLButtonElement | null>(null);

  const viewport = containerRef.current?.closest(".relative.overflow-hidden");
  const viewportWidth = viewport?.clientWidth || 800;
  const viewportHeight = viewport?.clientHeight || 600;

  const flowchartConnectionEnd = connectionState.mousePos;
  const flowchartConnectionStart =
    selectionBox && flowchartConnectionEnd
      ? nearestPerimeterAnchor(
          {
            cx: selectionBox.x,
            cy: selectionBox.y,
            w: selectionBox.width,
            h: selectionBox.height,
          },
          flowchartConnectionEnd.x,
          flowchartConnectionEnd.y,
        )
      : connectionState.startPos;

  const updateScaleLockedElements = (container: HTMLDivElement | null, scale: number) => {
    if (!container) return;
    const inverse = 1 / scale;

    // 1. Scale-lock transforms
    const transformElements = container.querySelectorAll<HTMLElement>("[data-scale-lock]");
    transformElements.forEach((el) => {
      const baseTransform = el.getAttribute("data-base-transform") || "";
      el.style.transform = `${baseTransform} scale(${inverse})`.trim();
    });

    // 2. Scale-lock borders
    const borderElements = container.querySelectorAll<HTMLElement>("[data-scale-lock-border]");
    borderElements.forEach((el) => {
      el.style.borderWidth = `${1.25 * inverse}px`;
    });

    // 3. Scale-lock shadows
    const shadowElements = container.querySelectorAll<HTMLElement>("[data-scale-lock-shadow]");
    shadowElements.forEach((el) => {
      el.style.boxShadow = `0 0 0 ${2 * inverse}px rgba(99, 102, 241, 0.2)`;
    });

    // 4. Scale-lock strokes
    const strokeElements = container.querySelectorAll<SVGElement>("[data-scale-lock-stroke]");
    strokeElements.forEach((el) => {
      el.style.strokeWidth = `${2 * inverse}px`;
    });
  };

  useEffect(() => {
    if (containerRef.current && selectionBox) {
      const currentScale = parseFloat(
        containerRef.current.style.getPropertyValue("--zoom-scale") || "1.5",
      );
      updateScaleLockedElements(containerRef.current, currentScale);
    }
  }, [selectionBox, selectedNodeId, containerRef]);

  // Keep the "Add comment to selection" anchor below the sticky app header so it
  // stays clickable when the selected node sits at the top of the viewport.
  useEffect(() => {
    const el = commentAnchorRef.current;
    if (!el || !selectionBox || !containerRef.current) return;
    const rect = el.getBoundingClientRect();
    const deficit = 64 - rect.top;
    if (deficit <= 1) return;
    const currentTop = parseFloat(el.style.top || "0");
    if (Number.isNaN(currentTop)) return;
    const scale = parseFloat(containerRef.current.style.getPropertyValue("--zoom-scale")) || 1;
    el.style.top = `${currentTop + deficit / scale}px`;
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
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
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

      // If this pointer event is on any floating UI/overlay controls (including inline
      // text editors), never route it into canvas hit-testing. This prevents accidental
      // back-shape selection when clicking toolbar buttons near tight edges and keeps
      // the inline editor open when the user double-clicks to select text.
      const hitFloatingUi = elements.some((el) => {
        if (el instanceof HTMLElement && getComputedStyle(el).pointerEvents === "none") {
          return false;
        }
        return Boolean(
          el.closest?.("[data-inline-editor]") ||
          el.closest?.("[data-class-text-editor]") ||
          el.closest?.("[data-scale-lock]") ||
          el.closest?.("[data-scale-lock-max1]") ||
          el.closest?.("[data-inline-toolbar]") ||
          el.closest?.("[data-scale-lock-border]") ||
          el.closest?.("[data-scale-lock-shadow]") ||
          el.closest?.("[data-seq-plus-handle]") ||
          el.closest?.(".seq-msg-reorder-handle") ||
          el.closest?.(".timeline-reorder-handle") ||
          el.closest?.('[data-slot^="dropdown-menu"]'),
        );
      });
      if (hitFloatingUi) return;

      let target =
        // Skip the participant reorder grab overlay (a pointer-events-auto div over the actor
        // header) so the actor SVG BEHIND it is resolved — clicking the overlay must still select
        // the participant. The overlay only starts the horizontal reorder drag.
        elements.find(
          (el) => container.contains(el) && !el.closest?.(".seq-actor-reorder-handle"),
        ) ||
        elements.find((el) => container.contains(el)) ||
        (event.target as HTMLElement | null) ||
        container;

      // Fallback for tiny Mermaid elements (e.g. compact text blocks) where
      // elementsFromPoint may only return svg/container and miss the actual node.
      const tag = target.tagName?.toLowerCase?.() || "";
      const isGenericContainerTarget =
        tag === "svg" || tag === "div" || tag === "g" || target === container;

      const candidates = Array.from(
        container.querySelectorAll(
          ".node, .statediagram-state, .cluster, .statediagram-cluster, path.flowchart-link, .edgeLabel",
        ),
      ) as SVGGraphicsElement[];

      const findBestAtPoint = () => {
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
        return best;
      };

      if (isGenericContainerTarget) {
        const best = findBestAtPoint();
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

    document.addEventListener("mousedown", onDocumentMouseDownCapture, true);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDownCapture, true);
    };
  }, [containerRef, handleSvgClick, isLocked]);

  // Begin dragging a sequence ROW (message OR note) to reorder it. The dragged row is ALWAYS the
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

  // Endpoint geometry (canvas coords) for the currently selected message — drives the source/
  // target drag handles. Canvas coords are transform-invariant, so this need only recompute when
  // the selection or the rendered diagram changes (NOT on pan/zoom). Null unless a sequence
  // message is selected and resolvable.
  const selectedSeqMsgEndpoints = useMemo(() => {
    if (currentType !== "sequence") return null;
    if (!selectedNodeId?.startsWith("SEQ_MSG_")) return null;
    if (!getSequenceMessageEndpointGeometry) return null;
    const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
    if (!Number.isFinite(idx) || idx < 0) return null;
    return getSequenceMessageEndpointGeometry(idx);
    // svgContent/code are intentional deps: re-resolve geometry after the diagram re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentType, selectedNodeId, getSequenceMessageEndpointGeometry, svgContent, code]);

  useEffect(() => {
    if (selectedSeqMsgEndpoints && sequencePlusMenu) {
      setSequencePlusMenu(null);
    }
  }, [selectedSeqMsgEndpoints, sequencePlusMenu]);

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
    geo: NonNullable<typeof selectedSeqMsgEndpoints>,
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

  // The class currently eligible to start a connection drag: resolved from the single-click
  // selection's SVG id (NOT the double-click-only property-panel `selectedClass`), so the purple +
  // appears as soon as a class node is selected.
  const connectSourceClass = useMemo(
    () => (currentType === "classDiagram" ? classNameFromSvgId(selectedSvgId) : null),
    [currentType, selectedSvgId],
  );

  // The note currently eligible to start a connection drag (the reverse gesture: drag a note onto a
  // class to attach it). Resolved from the single-click selection's SVG id (`…-note<N>`). The note
  // index is source-order, matching getClassNotes / setClassNoteTarget.
  const connectSourceNote = useMemo(() => {
    if (currentType !== "classDiagram" || !selectedSvgId) return null;
    const m = selectedSvgId.match(/-note(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }, [currentType, selectedSvgId]);

  // The namespace container currently selected (a single-clicked `g.cluster`). Resolved by checking
  // the cleaned selection id (`selectedNodeId`, which the interaction hook strips down to the bare
  // namespace name) against the namespaces actually present in the code. A class / note selection
  // takes precedence (their inner nodes sit on top of the cluster).
  const connectSourceNamespace = useMemo(() => {
    if (currentType !== "classDiagram" || !selectedSvgId) return null;
    if (classNameFromSvgId(selectedSvgId)) return null;
    if (/-note\d+$/.test(selectedSvgId)) return null;
    return selectedNodeId && getNamespaceNames(code).includes(selectedNodeId)
      ? selectedNodeId
      : null;
  }, [currentType, selectedSvgId, selectedNodeId, code]);

  // The ER entity currently eligible for the single-click node toolbar (Duplicate / Style / Delete).
  // Resolved from the single-click selection's SVG id (`…-entity-<Name>-<idx>`), which survives
  // dashed entity names (e.g. `LINE-ITEM`).
  const connectSourceEntity = useMemo(
    () => (currentType === "erDiagram" ? entityNameFromSvgId(selectedSvgId) : null),
    [currentType, selectedSvgId],
  );

  // State-diagram single-click selection → the floating node toolbar (Rename / Delete). A NOTE
  // (svg id `…----note-<N>`) takes precedence over the state branch; otherwise the selected element
  // is a state or a composite container (resolved from `…-state-<Name>-<idx>`). `[*]` pseudo-states
  // resolve to null, so they get no toolbar.
  //
  // The `----note-<N>` suffix is mermaid's edge counter (transitions + notes interleaved), NOT the
  // source-order note index that `getStateNotes` / `deleteStateNoteByIndex` / `setStateNotePosition`
  // expect. Notes render in source order, so we resolve the index by the selected note's DOM position
  // among `g.statediagram-note` (the same technique the double-click rename router uses), falling back
  // to the parsed counter only if the DOM lookup is unavailable.
  const connectSourceStateNote = useMemo(() => {
    if (currentType !== "stateDiagram" || !selectedSvgId) return null;
    if (!/----note-\d+$/.test(selectedSvgId)) return null;
    if (typeof document !== "undefined") {
      const container = document.querySelector(".mermaid-container");
      if (container) {
        const notes = Array.from(container.querySelectorAll("g.statediagram-note"));
        const idx = notes.findIndex((n) => n.id === selectedSvgId);
        if (idx >= 0) return idx;
      }
    }
    const m = selectedSvgId.match(/----note-(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }, [currentType, selectedSvgId]);

  const connectSourceState = useMemo(() => {
    if (currentType !== "stateDiagram" || !selectedSvgId) return null;
    if (/----note-\d+$/.test(selectedSvgId)) return null;
    return stateNameFromSvgId(selectedSvgId);
  }, [currentType, selectedSvgId]);

  const selectedMindmapNode = useMemo(() => {
    if (currentType !== "mindmap" || !selectedNodeId?.startsWith("MINDMAP_")) return null;
    return getMindmapNode(code, selectedNodeId);
  }, [code, currentType, selectedNodeId]);

  const mindmapHasNodes = useMemo(
    () => (currentType === "mindmap" ? parseMindmap(code).nodes.length > 0 : true),
    [code, currentType],
  );

  const selectedTimelineNode = useMemo(() => {
    if (currentType !== "timeline" || !selectedNodeId?.startsWith("TIMELINE_")) return null;
    return getTimelineNode(code, selectedNodeId);
  }, [code, currentType, selectedNodeId]);

  // Canvas-space hit boxes for every timeline node so click+drag reorders without select-first
  // (mirrors sequenceMessageTriggerAreas). Measured from live SVG after each re-render.
  const [timelineHitAreas, setTimelineHitAreas] = useState<
    Array<{ id: string; x: number; y: number; width: number; height: number }>
  >([]);

  // Hovered timeline node (id only) so we can preview the selection outline without selecting.
  // Tracked locally on the reorder handles (which already cover every node), avoiding a change to
  // the shared useCanvasInteraction hover pipeline.
  const [timelineHoverId, setTimelineHoverId] = useState<string | null>(null);

  const hoveredTimelineArea = useMemo(() => {
    if (!timelineHoverId) return null;
    return timelineHitAreas.find((area) => area.id === timelineHoverId) ?? null;
  }, [timelineHoverId, timelineHitAreas]);

  const hoveredTimelineNode = useMemo(() => {
    if (currentType !== "timeline" || !timelineHoverId) return null;
    return getTimelineNode(code, timelineHoverId);
  }, [code, currentType, timelineHoverId]);

  useEffect(() => {
    if (currentType !== "timeline") {
      setTimelineHitAreas([]);
      return;
    }
    let rafId = 0;
    let attempts = 0;
    let settledFrames = 0;
    let prevKey = "";
    let lastAreas: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    const total = timelineRenderOrder(code).length;
    const MAX_ATTEMPTS = 200;
    // RerenderSettle: `centerOnInit` animates the zoom/pan transform over several
    // frames, so a single snapshot is mid-animation and lands in stale coords.
    // Keep measuring every frame until identical measurements repeat (2 frames).
    const compute = (): string => {
      const container = containerRef.current;
      if (!container) return "";
      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / (container.offsetWidth || 1) || 1;
      const areas: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
      for (const entry of timelineRenderOrder(code)) {
        const el = findTimelineSvgElementByNodeId(code, container, entry.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        areas.push({
          id: entry.id,
          x: (r.left - containerRect.left) / scale,
          y: (r.top - containerRect.top) / scale,
          width: r.width / scale,
          height: r.height / scale,
        });
      }
      if (areas.length < total) return "";
      lastAreas = areas;
      return areas
        .map((a) => `${a.id}:${a.x.toFixed(2)},${a.y.toFixed(2)},${a.width.toFixed(2)}`)
        .join("|");
    };
    const tick = () => {
      const key = compute();
      if (key && key === prevKey) {
        settledFrames += 1;
      } else {
        settledFrames = 0;
      }
      prevKey = key;
      if (settledFrames >= 2 && key) {
        setTimelineHitAreas(lastAreas);
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        if (lastAreas.length > 0) setTimelineHitAreas(lastAreas);
        else setTimelineHitAreas([]);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [currentType, code, svgContent, containerRef]);

  const timelineHasAnyNodes = useMemo(
    () => (currentType === "timeline" ? timelineHasNodes(code) : true),
    [code, currentType],
  );

  const connectSourceStateIsComposite = useMemo(
    () => (connectSourceState ? isCompositeState(code, connectSourceState) : false),
    [connectSourceState, code],
  );

  // Choice / fork / join are shape-only (no editable label) — the toolbar omits Rename for them.
  const connectSourceStateIsSpecial = useMemo(
    () => (connectSourceState ? isSpecialStateNode(code, connectSourceState) : false),
    [connectSourceState, code],
  );

  // The selected state's current `style …` override map (drives the style popover's active states).
  const connectSourceStateStyle = useMemo(
    () => (connectSourceState ? getStateStyle(code, connectSourceState) : {}),
    [connectSourceState, code],
  );

  // All composite names (move-into targets) and the composite the selected state currently lives in.
  const stateCompositeNames = useMemo(
    () => (currentType === "stateDiagram" ? getCompositeNames(code) : []),
    [currentType, code],
  );
  const connectSourceStateParent = useMemo(
    () => (connectSourceState ? getStateParentComposite(code, connectSourceState) : null),
    [connectSourceState, code],
  );

  // The selected note's current side (left/right) for the flip button's label.
  const connectSourceStateNotePosition = useMemo(() => {
    if (connectSourceStateNote === null) return undefined;
    return getStateNotes(code)[connectSourceStateNote]?.position;
  }, [connectSourceStateNote, code]);

  // Begin an ER drag-to-connect from the purple + (US1). Fully isolated (own window listeners +
  // preview SVG outside TransformWrapper), mirroring the class connect drag. Dropping onto a
  // DIFFERENT entity creates a default relationship (`source ||--|| target : ""`); dropping on
  // EMPTY canvas creates a NEW entity linked to the source; a no-drag click / drop on the source
  // itself is a silent no-op.
  const startErConnectDrag = (e: React.MouseEvent<HTMLButtonElement>, sourceName: string) => {
    e.stopPropagation();
    e.preventDefault();
    const shell = canvasShellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const anchorX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const anchorY = btnRect.top + btnRect.height / 2 - shellRect.top;
    const sourceEl =
      Array.from(shell.querySelectorAll(".mermaid-container g.node")).find(
        (el) => entityNameFromSvgId(el.id) === sourceName,
      ) ?? (selectedSvgId ? document.getElementById(selectedSvgId) : null);
    const sourceBox = shellBoxFromElement(sourceEl, shellRect);

    const resolveTarget = (
      clientX: number,
      clientY: number,
    ): { name: string; el: Element } | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const g = el.closest("g.node");
        if (!g || !/-entity-.+-\d+$/.test(g.id)) continue;
        const name = entityNameFromSvgId(g.id);
        if (!name || name === sourceName) return null; // self → ignore
        return { name, el: g };
      }
      return null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setErConnecting(true);

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
      }
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      let snap: { cx: number; cy: number; w: number; h: number } | null = null;
      let anchor: { x: number; y: number } | null = null;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      if (tgt) {
        const r = tgt.el.getBoundingClientRect();
        snap = shellBoxFromRect(r, shellRect);
        anchor = nearestPerimeterAnchor(snap, cursorX, cursorY);
      }
      const end = anchor ?? { x: cursorX, y: cursorY };
      const sourceAnchor = sourceBox
        ? nearestPerimeterAnchor(sourceBox, end.x, end.y)
        : { x: anchorX, y: anchorY };
      setErConnect({
        x1: sourceAnchor.x,
        y1: sourceAnchor.y,
        x2: end.x,
        y2: end.y,
        snap,
        anchor,
      });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setErConnect(null);
      setErConnecting(false);
      if (!dragging) return; // a plain click on the + (no drag) is a no-op
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      if (tgt) {
        onAddErRelationship?.(sourceName, tgt.name);
      } else {
        // Dropped on empty canvas → create a NEW entity linked to the source.
        onCreateErEntityLinked?.(sourceName);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Begin a state-diagram drag-to-connect from the purple +. Fully isolated (own window listeners +
  // preview SVG outside TransformWrapper), mirroring the ER connect drag. Dropping onto a DIFFERENT
  // state (regular OR composite) creates a transition `source --> target`; dropping on EMPTY canvas
  // creates a NEW state linked to the source; a no-drag click / drop on the source itself is a no-op.
  const startStateConnectDrag = (e: React.MouseEvent<HTMLButtonElement>, sourceId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setStateConnectMenu(null);
    setShapePicker(null);
    const shell = canvasShellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const anchorX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const anchorY = btnRect.top + btnRect.height / 2 - shellRect.top;
    const sourceEl =
      Array.from(
        shell.querySelectorAll(
          ".mermaid-container g.node, .mermaid-container g.statediagram-cluster",
        ),
      ).find((el) => stateNameFromSvgId(el.id) === sourceId) ??
      (selectedSvgId ? document.getElementById(selectedSvgId) : null);
    const sourceBox = shellBoxFromElement(sourceEl, shellRect);

    const resolveTarget = (
      clientX: number,
      clientY: number,
    ): { id: string; el: Element } | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const g = el.closest("g.node, g.statediagram-state");
        if (
          g &&
          !g.classList.contains("statediagram-cluster") &&
          /-state-.+-\d+$/.test(g.id) &&
          !/----note-\d+$/.test(g.id)
        ) {
          const id = stateNameFromSvgId(g.id);
          if (!id || id === sourceId) return null; // self / [*] pseudo → ignore
          return { id, el: g };
        }
        const cluster = el.closest("g.statediagram-cluster");
        if (cluster) {
          const id = stateNameFromSvgId(cluster.id);
          if (!id || id === sourceId) return null;
          return { id, el: cluster };
        }
      }
      return null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setStateConnecting(true);

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
        setStateConnectMenu(null);
        setShapePicker(null);
      }
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      let snap: { cx: number; cy: number; w: number; h: number } | null = null;
      let anchor: { x: number; y: number } | null = null;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      if (tgt) {
        const r = tgt.el.getBoundingClientRect();
        snap = shellBoxFromRect(r, shellRect);
        anchor = nearestPerimeterAnchor(snap, cursorX, cursorY);
      }
      const end = anchor ?? { x: cursorX, y: cursorY };
      const sourceAnchor = sourceBox
        ? nearestPerimeterAnchor(sourceBox, end.x, end.y)
        : { x: anchorX, y: anchorY };
      setStateConnect({
        x1: sourceAnchor.x,
        y1: sourceAnchor.y,
        x2: end.x,
        y2: end.y,
        snap,
        anchor,
      });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setStateConnect(null);
      setStateConnecting(false);
      if (!dragging) return; // a plain click on the + (no drag) is a no-op
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      if (tgt) {
        onAddStateTransition?.(sourceId, tgt.id);
      } else {
        // Dropped on empty canvas → ask which shape to create (then link source --> shape).
        setStateConnectMenu({
          source: sourceId,
          x: ev.clientX - shellRect.left,
          y: ev.clientY - shellRect.top,
        });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Begin a class-diagram connection drag from the purple +. Fully isolated (own window listeners +
  // preview SVG outside TransformWrapper), mirroring the sequence endpoint drag. The source is
  // either a class or a note:
  //  - class source → DIFFERENT class = relationship picker; note = `note for <source>`; empty / a
  //    no-drag click = the New Class / New Note chip.
  //  - note source  → only a class target is valid (`note for <class>`); everything else is a no-op.
  const startClassConnectDrag = (
    e: React.MouseEvent<HTMLButtonElement>,
    source: { kind: "class"; name: string } | { kind: "note"; index: number },
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const shell = canvasShellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const anchorX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const anchorY = btnRect.top + btnRect.height / 2 - shellRect.top;
    const sourceEl =
      source.kind === "class"
        ? (Array.from(shell.querySelectorAll(".mermaid-container g.node")).find(
            (el) => classNameFromSvgId(el.id) === source.name,
          ) ?? (selectedSvgId ? document.getElementById(selectedSvgId) : null))
        : (Array.from(shell.querySelectorAll(".mermaid-container g.node")).find((el) => {
            const idx = parseInt(el.id.match(/-note(\d+)$/)?.[1] ?? "-1", 10);
            return idx === source.index;
          }) ?? (selectedSvgId ? document.getElementById(selectedSvgId) : null));
    const sourceBox = shellBoxFromElement(sourceEl, shellRect);

    type Target =
      | { kind: "class"; name: string; el: Element }
      | { kind: "note"; noteIndex: number; el: Element }
      | null;
    const resolveTarget = (clientX: number, clientY: number): Target => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const g = el.closest("g.node");
        if (!g) continue;
        if (/classId-/.test(g.id)) {
          const name = classNameFromSvgId(g.id);
          if (source.kind === "class" && name === source.name) return null; // self → ignore
          if (name) return { kind: "class", name, el: g };
        } else if (/-note\d+$/.test(g.id)) {
          const idx = parseInt(g.id.match(/-note(\d+)$/)?.[1] ?? "0", 10);
          // A note source can only attach to a CLASS — ignore note targets (incl. itself).
          if (source.kind === "note") continue;
          return { kind: "note", noteIndex: idx, el: g };
        }
      }
      return null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setClassConnecting(true);

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
      }
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      let snap: { cx: number; cy: number; w: number; h: number } | null = null;
      let anchor: { x: number; y: number } | null = null;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      if (tgt) {
        const r = tgt.el.getBoundingClientRect();
        snap = shellBoxFromRect(r, shellRect);
        anchor = nearestPerimeterAnchor(snap, cursorX, cursorY);
      }
      const end = anchor ?? { x: cursorX, y: cursorY };
      const sourceAnchor = sourceBox
        ? nearestPerimeterAnchor(sourceBox, end.x, end.y)
        : { x: anchorX, y: anchorY };
      setClassConnect({
        x1: sourceAnchor.x,
        y1: sourceAnchor.y,
        x2: end.x,
        y2: end.y,
        snap,
        anchor,
      });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setClassConnect(null);
      setClassConnecting(false);
      const tgt = dragging ? resolveTarget(ev.clientX, ev.clientY) : null;

      // Note source: the only meaningful drop is onto a class (attach this note to it). No drag, or
      // a drop anywhere else, is a silent no-op (notes have no create/relationship flow).
      if (source.kind === "note") {
        if (tgt?.kind === "class") onLinkNoteToClass?.(source.index, tgt.name);
        return;
      }

      // Class source.
      const menuX = ev.clientX - shellRect.left;
      const menuY = ev.clientY - shellRect.top;
      if (!dragging) {
        // Plain click on the + (no drag) → open the create chip at the button.
        setClassConnectMenu({
          source: source.name,
          target: null,
          step: "choose",
          x: anchorX,
          y: anchorY,
        });
        return;
      }
      if (tgt?.kind === "class") {
        // Dropping onto an existing class creates the connection directly with the default
        // association operator (`-->`); the user can change the relationship type afterwards via
        // the edge toolbar. No relationship-type prompt is shown.
        onAddClassRelationship?.(source.name, tgt.name, "-->");
      } else if (tgt?.kind === "note") {
        onLinkNoteToClass?.(tgt.noteIndex, source.name);
      } else {
        setClassConnectMenu({
          source: source.name,
          target: null,
          step: "choose",
          x: menuX,
          y: menuY,
        });
      }
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
          const beforeGuide = n.x - inset;
          const afterGuide = n.x + n.w + inset;
          slots.push({
            id: n.id,
            placement: "before",
            x: beforeGuide - SLOT_THICK / 2,
            y: col.y1,
            w: SLOT_THICK,
            h: col.y2 - col.y1,
            axis: "x",
            crossStart: col.y1,
            crossEnd: col.y2,
            guidePos: colCenter,
            spanStart: col.x1,
            spanEnd: col.x2,
            columnMode: true,
            hitTol: n.w + HIT_TOL,
          });
          slots.push({
            id: n.id,
            placement: "after",
            x: afterGuide - SLOT_THICK / 2,
            y: col.y1,
            w: SLOT_THICK,
            h: col.y2 - col.y1,
            axis: "x",
            crossStart: col.y1,
            crossEnd: col.y2,
            guidePos: colCenter,
            spanStart: col.x1,
            spanEnd: col.x2,
            columnMode: true,
            hitTol: n.w + HIT_TOL,
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

    const findTarget = (cursorX: number, cursorY: number) => {
      let best: { id: string; placement: "before" | "after" } | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const s of slots) {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const crossOk =
          s.axis === "y"
            ? cursorX >= s.crossStart - HIT_TOL && cursorX <= s.crossEnd + HIT_TOL
            : cursorY >= s.crossStart - HIT_TOL && cursorY <= s.crossEnd + HIT_TOL;
        if (!crossOk) continue;
        const dist = s.axis === "y" ? Math.abs(cursorY - cy) : Math.abs(cursorX - cx);
        const tol = s.hitTol ?? (s.axis === "y" ? s.h / 2 : s.w / 2) + HIT_TOL;
        if (dist <= tol && dist < bestDist) {
          bestDist = dist;
          best = { id: s.id, placement: s.placement };
        }
      }
      return best;
    };

    // Auto-scroll: pan the canvas when the cursor nears the shell edges (issue scope).
    // Returns the applied pan delta (screen px) so callers can offset the captured coords.
    const EDGE_MARGIN = 64;
    const PAN_SPEED = 16;
    const panStep = (cursorX: number, cursorY: number): { dx: number; dy: number } => {
      const inst = transformInstanceRef.current;
      if (!inst) return { dx: 0, dy: 0 };
      let vx = 0;
      let vy = 0;
      if (cursorX < EDGE_MARGIN) vx = -(1 - cursorX / EDGE_MARGIN);
      else if (cursorX > shellRect.width - EDGE_MARGIN)
        vx = 1 - (shellRect.width - cursorX) / EDGE_MARGIN;
      if (cursorY < EDGE_MARGIN) vy = -(1 - cursorY / EDGE_MARGIN);
      else if (cursorY > shellRect.height - EDGE_MARGIN)
        vy = 1 - (shellRect.height - cursorY) / EDGE_MARGIN;
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
      const target = findTarget(cursorX - panDelta.dx, cursorY - panDelta.dy);
      let highlightedSectionId: string | null = null;
      if (target) {
        const sec = periodToSection.get(target.id);
        if (sec) highlightedSectionId = sec.id;
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
        const target = findTarget(cursorX - panDelta.dx, cursorY - panDelta.dy);
        if (target) {
          onTimelineMove?.(fromId, target.id, target.placement);
        }
      } else {
        selectFromNode();
      }
      setTimelineReorder(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={canvasShellRef}
      className="w-full h-full relative overflow-hidden bg-white transition-colors duration-300"
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-100"
        style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, #cbd5e1 1.5px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      {isBlankDiagram && (
        <div className="absolute inset-0 z-40 bg-white/90">
          <EmptyCanvas handleCodeChange={handleCodeChange} />
        </div>
      )}
      <TransformWrapper
        initialScale={1.5}
        minScale={0.5}
        maxScale={50}
        centerOnInit={true}
        smooth={true}
        wheel={{ wheelDisabled: true, step: 0.05 }}
        panning={{
          velocityDisabled: false,
          disabled:
            isInlineEditing ||
            connectionState.active ||
            !!seqReorder ||
            seqEndpointDragging ||
            !!seqLifelineReorder ||
            !!timelineReorder ||
            classConnecting ||
            erConnecting ||
            stateConnecting,
          excluded: [
            "seq-connect-btn",
            "seq-msg-reorder-handle",
            "seq-endpoint-handle",
            "seq-actor-reorder-handle",
            "timeline-reorder-handle",
            "class-connect-btn",
            "class-relation-hit-target",
            "er-connect-btn",
            "er-relation-hit-target",
            "state-connect-btn",
            "state-transition-hit-target",
          ],
        }}
        trackPadPanning={{ disabled: false }}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        onInit={(ref) => {
          transformInstanceRef.current = ref;
          lastScaleRef.current = ref.state.scale;
          if (containerRef.current) {
            containerRef.current.style.setProperty("--zoom-scale", String(ref.state.scale));
            containerRef.current.style.setProperty(
              "--zoom-inverse-scale",
              String(1 / ref.state.scale),
            );
            updateScaleLockedElements(containerRef.current, ref.state.scale);
          }
        }}
        onTransform={(_ref, state) => {
          if (containerRef.current) {
            containerRef.current.style.setProperty("--zoom-scale", String(state.scale));
            containerRef.current.style.setProperty("--zoom-inverse-scale", String(1 / state.scale));
            if (Math.abs(state.scale - lastScaleRef.current) > 0.001) {
              lastScaleRef.current = state.scale;
              updateScaleLockedElements(containerRef.current, state.scale);
            }
          }
        }}
        onPanningStart={() => {
          setStateConnectMenu((menu) => (menu ? null : menu));
        }}
        onZoomStart={() => {
          setStateConnectMenu((menu) => (menu ? null : menu));
          if (onDeselect) onDeselect();
        }}
        onPinchStart={() => {
          setStateConnectMenu((menu) => (menu ? null : menu));
          if (onDeselect) onDeselect();
        }}
      >
        {({ zoomIn, zoomOut, resetTransform, state }) => (
          <>
            <CommentFocusSync
              activeCommentId={activeCommentId}
              activeCommentFocusToken={activeCommentFocusToken ?? 0}
              commentsRailWidth={commentsRailWidth}
            />
            <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 bg-background border border-border p-1 rounded-lg shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  if (onDeselect) onDeselect();
                  zoomIn();
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <div className="h-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  if (onDeselect) onDeselect();
                  resetTransform();
                }}
              >
                <span className="text-[10px] font-bold">1:1</span>
              </Button>
              <div className="h-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  if (onDeselect) onDeselect();
                  zoomOut();
                }}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4">
                  <path fill="currentColor" d="M19 13H5v-2h14v2z" />
                </svg>
              </Button>
              <div className="h-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 hover:bg-accent hover:text-accent-foreground ${isLocked ? "text-red-500" : "text-foreground"}`}
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
                className={`w-full h-full relative flex items-center justify-center ${isCommentMode ? "cursor-copy" : "cursor-grab active:cursor-grabbing"}`}
                onDoubleClick={
                  !isLocked
                    ? (e) => {
                        console.log(
                          "[onDblClick] fired, elementsFromPoint:",
                          document
                            .elementsFromPoint(e.clientX, e.clientY)
                            .slice(0, 3)
                            .map((el) => el.tagName + (el.id ? "#" + el.id : "")),
                        );
                        // Ignore double-clicks that land on a floating toolbar / overlay control
                        // (including inline text editors) so they never enter the underlying
                        // element's edit mode or close an active inline editor. This guard lives on
                        // the CANVAS handler only — NOT inside handleEditClick — so the toolbar's
                        // own Rename button (which calls handleEditClick programmatically while the
                        // cursor is over the toolbar) still works.
                        const hitFloatingUi = document
                          .elementsFromPoint(e.clientX, e.clientY)
                          .some((el) => {
                            // Ignore the non-interactive selection overlay / hover chrome
                            // (pointer-events: none) so a double-click passes through to the
                            // element it covers (e.g. an inner node inside a selected composite).
                            if (
                              el instanceof HTMLElement &&
                              getComputedStyle(el).pointerEvents === "none"
                            ) {
                              return false;
                            }
                            return Boolean(
                              el.closest?.("[data-inline-editor]") ||
                              el.closest?.("[data-class-text-editor]") ||
                              el.closest?.("[data-scale-lock]") ||
                              el.closest?.("[data-scale-lock-max1]") ||
                              el.closest?.("[data-inline-toolbar]") ||
                              el.closest?.("[data-scale-lock-border]") ||
                              el.closest?.("[data-scale-lock-shadow]") ||
                              el.closest?.('[data-slot^="dropdown-menu"]'),
                            );
                          });
                        if (hitFloatingUi) return;
                        handleEditClick(e);
                      }
                    : undefined
                }
                onMouseMove={handleMouseMove}
                onMouseOver={handleSequenceHoverOver}
                onMouseOut={handleSequenceHoverOut}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {parseError &&
                  !isBlankDiagram &&
                  !(currentType === "mindmap" && !mindmapHasNodes) &&
                  !(currentType === "timeline" && !timelineHasAnyNodes) && (
                    <div
                      className="absolute inset-0 z-40 bg-white/60 cursor-not-allowed flex items-center justify-center pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                {!isBlankDiagram && (
                  <StableMermaidHtml
                    html={svgContent}
                    className={`mermaid-container select-none ${parseError ? "opacity-30" : ""}`}
                  />
                )}

                <CommentLayer
                  code={code}
                  comments={comments}
                  scale={state.scale}
                  containerRef={containerRef}
                  renderIdRef={renderIdRef ?? fallbackRenderIdRef}
                  activeCommentId={activeCommentId}
                  onActivateComment={onActivateComment ?? (() => {})}
                  commentComposer={commentComposer}
                  commentDraft={commentDraft}
                  setCommentDraft={setCommentDraft ?? (() => {})}
                  onSubmitComposer={onSubmitCommentComposer ?? (() => {})}
                  commentReplyDrafts={commentReplyDrafts}
                  onChangeReplyDraft={onChangeCommentReplyDraft ?? (() => {})}
                  onSubmitReply={onSubmitCommentReply ?? (() => {})}
                  onToggleResolved={onToggleCommentResolved ?? (() => {})}
                  commentsRailWidth={commentsRailWidth}
                  sequenceMessageEntries={sequenceMessageEntries}
                  getSequenceMessageEndpointGeometry={getSequenceMessageEndpointGeometry}
                />

                {/* Logic-block / highlight overlays are intentionally NOT drawn: Mermaid already
                    renders the structured fragments (loop/alt/opt/par/critical/break) and `rect`
                    highlights natively with their own labelled boxes, so a second custom box on top
                    is redundant and visually noisy. The block geometry (`sequenceBlockAreas`) is
                    still computed for later phases (resize/move/select targets). */}

                {currentType === "sequence" &&
                  !isCommentMode &&
                  !isInlineEditing &&
                  !connectionState.active &&
                  !seqReorder &&
                  sequenceMessageTriggerAreas.map((area) => (
                    <div
                      key={`seq-msg-hit-${area.index}`}
                      data-seq-msg-hover-trigger="true"
                      data-seq-msg-index={area.index}
                      className="seq-msg-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer"
                      style={{
                        left: area.x,
                        top: area.y,
                        width: area.width,
                        height: area.height,
                        background: "transparent",
                      }}
                      title="Drag to reorder · click to select"
                      onPointerEnter={() => handleSequenceMessageHoverEnter(area.index)}
                      onPointerMove={() => handleSequenceMessageHoverMove(area.index)}
                      onPointerLeave={(e) => handleSequenceMessageHoverLeave(area.index, e)}
                      onMouseDown={(e) =>
                        startSeqReorderDrag(e, { kind: "msg", domIndex: area.index })
                      }
                    />
                  ))}

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
                        top: hoveredSequenceMessageBox.y - 1 / state.scale,
                        width: hoveredSequenceMessageBox.width,
                        height: hoveredSequenceMessageBox.height + 2 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / state.scale})) rgba(99, 102, 241, 0.2)`,
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
                {currentType === "sequence" &&
                  hoveredSequenceNoteBox &&
                  !isCommentMode &&
                  !isInlineEditing &&
                  !connectionState.active &&
                  !seqReorder && (
                    <div
                      className="seq-msg-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer"
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
                        left: hoveredSequenceActorBox.x - 4 / state.scale,
                        top: hoveredSequenceActorBox.y - 4 / state.scale,
                        width: hoveredSequenceActorBox.width + 8 / state.scale,
                        height: hoveredSequenceActorBox.height + 8 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                  (hoveredSequenceActorBox ||
                    (selectedNodeId?.startsWith("SEQ_ACTOR_") && selectionBox)) &&
                  (() => {
                    const box =
                      selectedNodeId?.startsWith("SEQ_ACTOR_") && selectionBox
                        ? selectionBox
                        : hoveredSequenceActorBox!;
                    return (
                      <div
                        className="seq-actor-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer"
                        style={{
                          left: box.x - 4 / state.scale,
                          top: box.y - 4 / state.scale,
                          width: box.width + 8 / state.scale,
                          height: box.height + 8 / state.scale,
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
                        left: hoveredFlowchartNodeBox.x - 3 / state.scale,
                        top: hoveredFlowchartNodeBox.y - 3 / state.scale,
                        width: hoveredFlowchartNodeBox.width + 6 / state.scale,
                        height: hoveredFlowchartNodeBox.height + 6 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        borderStyle: "solid",
                        opacity: 0.6,
                      }}
                    />
                  )}

                {currentType === "sequence" &&
                  !isLocked &&
                  !isInlineEditing &&
                  !connectionState.active &&
                  !selectedSeqMsgEndpoints &&
                  sequenceLifelineOverlay && (
                    <div className="absolute inset-0 pointer-events-none z-25">
                      {sequenceLifelineOverlay.slots.map((slotY) => (
                        <button
                          key={`${sequenceLifelineOverlay.actorId}-${slotY}`}
                          data-seq-plus-actor-id={sequenceLifelineOverlay.actorId}
                          data-seq-plus-anchor-x={String(sequenceLifelineOverlay.x)}
                          data-seq-plus-anchor-y={String(slotY)}
                          data-seq-plus-handle="true"
                          data-scale-lock
                          data-base-transform="translate(-50%, -50%)"
                          className="seq-connect-btn absolute pointer-events-auto cursor-pointer w-7 h-7 rounded-full bg-indigo-600 text-white ring-2 ring-white/90 shadow-lg hover:bg-indigo-700 transition-colors"
                          style={{
                            left: sequenceLifelineOverlay.x,
                            top: slotY,
                            transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
                          }}
                          title="Add sequence action"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const actorId =
                              e.currentTarget.getAttribute("data-seq-plus-actor-id") ||
                              sequenceLifelineOverlay.actorId;
                            const anchorY = Number(
                              e.currentTarget.getAttribute("data-seq-plus-anchor-y") || slotY,
                            );
                            const rootRect = canvasShellRef.current?.getBoundingClientRect();
                            const buttonRect = e.currentTarget.getBoundingClientRect();
                            const anchorX = rootRect
                              ? buttonRect.left - rootRect.left + buttonRect.width / 2
                              : Number(
                                  e.currentTarget.getAttribute("data-seq-plus-anchor-x") ||
                                    sequenceLifelineOverlay.x,
                                );
                            const anchorMenuY = rootRect
                              ? buttonRect.top - rootRect.top + buttonRect.height / 2
                              : anchorY;

                            const startClientX = e.clientX;
                            const startClientY = e.clientY;
                            let dragging = false;

                            const onMove = (ev: MouseEvent) => {
                              if (
                                !dragging &&
                                (Math.abs(ev.clientX - startClientX) > 5 ||
                                  Math.abs(ev.clientY - startClientY) > 5)
                              ) {
                                dragging = true;
                                startSequenceConnection(actorId, anchorY);
                                setSeqDragIndicator({
                                  x1: anchorX,
                                  y1: anchorMenuY,
                                  x2: anchorX,
                                  y2: anchorMenuY,
                                  snapX: null,
                                });
                              }
                              if (dragging) {
                                const shellRect = canvasShellRef.current?.getBoundingClientRect();
                                if (!shellRect) return;
                                const cursorX = ev.clientX - shellRect.left;
                                const lifelines = getSequenceLifelines?.() ?? [];
                                const containerRect = containerRef.current?.getBoundingClientRect();
                                const scale =
                                  containerRect && containerRef.current
                                    ? containerRect.width / containerRef.current.offsetWidth
                                    : null;
                                // Viewport-space snap detection: find the nearest actor-line within 28 viewport-px
                                let snapX: number | null = null;
                                let snappedActorId: string | null = null;
                                if (scale && containerRect && containerRef.current) {
                                  const toShellX = (canvasX: number) =>
                                    canvasX * scale +
                                    containerRect.left -
                                    containerRef.current!.scrollLeft -
                                    shellRect.left;
                                  for (const lifeline of lifelines) {
                                    const lifelineViewportX = toShellX(lifeline.x);
                                    if (Math.abs(lifelineViewportX - cursorX) <= 28) {
                                      snapX = lifelineViewportX;
                                      snappedActorId = lifeline.actorId;
                                      break;
                                    }
                                  }
                                }
                                setSeqDragIndicator({
                                  x1: anchorX,
                                  y1: anchorMenuY,
                                  x2: snapX !== null ? snapX : cursorX,
                                  y2: anchorMenuY,
                                  snapX,
                                });
                                setConnectionState((prev) => ({
                                  ...prev,
                                  isDragging: true,
                                  mousePos: {
                                    x: snapX !== null ? snapX : cursorX,
                                    y: anchorMenuY,
                                  },
                                  anchorY,
                                  snapTargetId: snappedActorId
                                    ? `SEQ_ACTOR_${snappedActorId}`
                                    : null,
                                  snapTargetPos:
                                    snapX !== null ? { x: snapX, y: anchorMenuY } : null,
                                }));
                              }
                            };
                            const onUp = () => {
                              window.removeEventListener("mousemove", onMove);
                              window.removeEventListener("mouseup", onUp);
                              setSeqDragIndicator(null);
                              if (!dragging) {
                                setSequencePlusMenu({
                                  actorId,
                                  anchorY,
                                  x: anchorX,
                                  y: anchorMenuY,
                                  mode: "root",
                                });
                              }
                            };
                            window.addEventListener("mousemove", onMove);
                            window.addEventListener("mouseup", onUp);
                          }}
                        >
                          <Plus
                            className="w-3.5 h-3.5 mx-auto my-auto pointer-events-none"
                            strokeWidth={3}
                          />
                        </button>
                      ))}
                    </div>
                  )}

                {connectionState.isDragging &&
                  connectionState.startPos &&
                  connectionState.mousePos &&
                  currentType !== "sequence" && (
                    <svg className="absolute inset-0 pointer-events-none z-30 overflow-visible">
                      <defs>
                        <marker
                          id="sequence-preview-arrow"
                          markerWidth="10"
                          markerHeight="7"
                          refX="9"
                          refY="3.5"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
                        </marker>
                      </defs>
                      <line
                        data-scale-lock-stroke
                        x1={flowchartConnectionStart?.x ?? connectionState.startPos.x}
                        y1={
                          currentType === "sequence"
                            ? (connectionState.anchorY ?? connectionState.startPos.y)
                            : (flowchartConnectionStart?.y ?? connectionState.startPos.y)
                        }
                        x2={connectionState.mousePos.x}
                        y2={
                          currentType === "sequence"
                            ? (connectionState.anchorY ?? connectionState.startPos.y)
                            : connectionState.mousePos.y
                        }
                        stroke="#2563eb"
                        strokeDasharray="10,8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        shapeRendering="geometricPrecision"
                        style={{
                          strokeWidth: `calc(2px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        }}
                        markerEnd="url(#sequence-preview-arrow)"
                      />

                      {connectionState.snapTargetPos && (
                        <g
                          transform={`translate(${connectionState.snapTargetPos.x}, ${connectionState.snapTargetPos.y})`}
                        >
                          <circle r={4} fill="#10b981" />
                          <line
                            x1={-2}
                            y1={0}
                            x2={2}
                            y2={0}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                            strokeLinecap="round"
                          />
                          <line
                            x1={0}
                            y1={-2}
                            x2={0}
                            y2={2}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                            strokeLinecap="round"
                          />
                        </g>
                      )}
                    </svg>
                  )}

                {isCommentMode && (
                  <style>{`
                        .mermaid-container,
                        .mermaid-container .react-transform-wrapper,
                        .mermaid-container .react-transform-component,
                        .mermaid-container svg,
                        .mermaid-container svg .node,
                        .mermaid-container svg .node *,
                        .mermaid-container svg .cluster,
                        .mermaid-container svg .cluster *,
                        .mermaid-container svg .actor,
                        .mermaid-container svg .actor *,
                        .mermaid-container svg .actor-man,
                        .mermaid-container svg .actor-man *,
                        .mermaid-container svg .note,
                        .mermaid-container svg .note *,
                        .mermaid-container svg .messageText,
                        .mermaid-container svg .messageLine0,
                        .mermaid-container svg .messageLine1,
                        .mermaid-container svg .label,
                        .mermaid-container svg .nodeLabel,
                        .mermaid-container svg .cluster-label,
                        .mermaid-container svg foreignObject,
                        .mermaid-container svg foreignObject *,
                        .mermaid-container svg text,
                        .mermaid-container svg rect,
                        .mermaid-container svg path,
                        .mermaid-container svg g,
                        .mermaid-container svg .basic,
                        .mermaid-container svg .label-container,
                        .mermaid-container svg .default {
                            cursor: copy !important;
                        }
                     `}</style>
                )}

                {isInlineEditing && selectedSvgSelector && (
                  <style>{`
                        ${selectedSvgSelector},
                        ${selectedSvgSelector} .label,
                        ${selectedSvgSelector} text,
                        ${selectedSvgSelector} foreignObject,
                        ${selectedSvgSelector} .nodeLabel,
                        ${selectedSvgSelector} .cluster-label,
                        ${selectedSvgSelector} .messageText,
                        ${selectedSvgSelector} .noteText {
                            opacity: 0 !important;
                            visibility: hidden !important;
                            pointer-events: none !important;
                        }
                     `}</style>
                )}

                {currentType === "sequence" &&
                  (selectedNodeId?.startsWith("SEQ_MSG_") ||
                    selectedNodeId?.startsWith("SEQ_NOTE_")) &&
                  selectionBox &&
                  !isLocked &&
                  !isCommentMode &&
                  !isInlineEditing &&
                  !connectionState.active && (
                    <div
                      className="seq-msg-reorder-handle absolute z-20 pointer-events-auto cursor-pointer"
                      style={{
                        left: selectionBox.x - 8 / state.scale,
                        top: selectionBox.y - 5 / state.scale,
                        width: selectionBox.width + 16 / state.scale,
                        height: selectionBox.height + 10 / state.scale,
                      }}
                      title="Drag to reorder"
                      onMouseDown={(e) => {
                        if (selectedNodeId?.startsWith("SEQ_MSG_")) {
                          const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
                          if (Number.isFinite(idx))
                            startSeqReorderDrag(e, { kind: "msg", domIndex: idx });
                        } else if (selectedNodeId?.startsWith("SEQ_NOTE_")) {
                          const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
                          if (Number.isFinite(idx))
                            startSeqReorderDrag(e, { kind: "note", domIndex: idx });
                        } else {
                          startSeqReorderDrag(e);
                        }
                      }}
                    />
                  )}

                {currentType === "timeline" &&
                  hoveredTimelineArea &&
                  !isInlineEditing &&
                  !connectionState.active &&
                  !selectionBox && (
                    <div
                      className="absolute pointer-events-none z-[19] border-indigo-400"
                      style={{
                        left: hoveredTimelineArea.x - 3 / state.scale,
                        top: hoveredTimelineArea.y - 3 / state.scale,
                        width: hoveredTimelineArea.width + 6 / state.scale,
                        height: hoveredTimelineArea.height + 6 / state.scale,
                        borderRadius: `${6 / state.scale}px`,
                        borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        borderStyle: "solid",
                        opacity: 0.6,
                      }}
                    />
                  )}

                {/* Hover preview of the directional `+` add buttons — mirrors the selected-state
                    toolbar but for the hovered (not selected) node. */}
                {currentType === "timeline" &&
                  hoveredTimelineArea &&
                  hoveredTimelineNode &&
                  !isInlineEditing &&
                  !isLocked &&
                  !isCommentMode &&
                  !connectionState.active &&
                  !selectionBox && (
                    <div
                      className="absolute z-[24] pointer-events-none"
                      style={{
                        left: hoveredTimelineArea.x - 4 / state.scale,
                        top: hoveredTimelineArea.y - 4 / state.scale,
                        width: hoveredTimelineArea.width + 8 / state.scale,
                        height: hoveredTimelineArea.height + 8 / state.scale,
                      }}
                    >
                      <TimelineAddButtons
                        scale={state.scale}
                        node={hoveredTimelineNode}
                        direction={getTimelineDirection(code)}
                        onAddEvent={(placement) =>
                          onTimelineAddEvent?.(hoveredTimelineNode.id, placement)
                        }
                        onAddPeriod={(placement) =>
                          hoveredTimelineNode.kind === "section"
                            ? onTimelineAddPeriodToSection?.(hoveredTimelineNode.id, placement)
                            : onTimelineAddPeriod?.(hoveredTimelineNode.id, placement)
                        }
                        onAddSection={(placement) =>
                          onTimelineAddSection?.(hoveredTimelineNode.id, placement)
                        }
                      />
                    </div>
                  )}

                {/* Timeline reorder grab overlays — DIRECT-DRAG on any node (sequence-style), no
                    select-first. Canvas-space boxes from timelineHitAreas. Class
                    `timeline-reorder-handle` is in panning.excluded; click-select /
                    dblclick-rename resolve the SVG behind via elementsFromPoint. */}
                {!isInlineEditing &&
                  currentType === "timeline" &&
                  !isLocked &&
                  !isCommentMode &&
                  !timelineReorder &&
                  timelineHitAreas.map((area) => (
                    <div
                      key={`timeline-hit-${area.id}`}
                      data-timeline-reorder-handle
                      data-timeline-reorder-node={area.id}
                      className="timeline-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer active:cursor-grabbing"
                      style={{
                        left: area.x - 4 / state.scale,
                        top: area.y - 4 / state.scale,
                        width: area.width + 8 / state.scale,
                        height: area.height + 8 / state.scale,
                      }}
                      title="Drag to reorder · click to select · double-click to rename"
                      onMouseDown={(e) => startTimelineReorderDrag(e, area.id)}
                      onMouseEnter={() => setTimelineHoverId(area.id)}
                      onMouseLeave={(e) => {
                        // Keep the hover preview alive when the pointer moves onto one of the
                        // edge `+` buttons or its tooltip (both live outside the grab handle).
                        const next = e.relatedTarget as Element | null;
                        if (
                          next?.closest?.(
                            "[data-timeline-add-button], [data-slot='tooltip-content']",
                          )
                        ) {
                          return;
                        }
                        setTimelineHoverId((id) => (id === area.id ? null : id));
                      }}
                    />
                  ))}

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
                      left:
                        selectionBox.x -
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 0 : 4) / state.scale,
                      top:
                        selectionBox.y -
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 1 : 4) / state.scale,
                      width:
                        selectionBox.width +
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 0 : 8) / state.scale,
                      height:
                        selectionBox.height +
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 2 : 8) / state.scale,
                      borderRadius: `${6 / state.scale}px`,
                      borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                      boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / state.scale})) rgba(99, 102, 241, 0.2)`,
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
                          scale={state.scale}
                          onUpdateRelationshipType={onUpdateClassRelationshipType || (() => {})}
                          onSetCardinality={onSetClassRelationshipCardinality || (() => {})}
                          onDeleteRelationship={onDeleteClassRelationship || (() => {})}
                          onEditLabel={
                            onEditClassEdgeLabel ? (e) => onEditClassEdgeLabel() : undefined
                          }
                        />
                      ) : selectedNodeId && selectedNodeId.startsWith("ER_EDGE_") ? (
                        <ErEdgeToolbar
                          selectedNodeId={selectedNodeId}
                          code={code}
                          scale={state.scale}
                          onUpdateOperator={onUpdateErRelationshipOperator || (() => {})}
                          onEditLabel={() => onEditErEdgeLabel?.()}
                          onDeleteRelationship={onDeleteErRelationship || (() => {})}
                        />
                      ) : selectedNodeId && selectedNodeId.startsWith("STATE_EDGE_") ? (
                        <StateEdgeToolbar
                          selectedNodeId={selectedNodeId}
                          code={code}
                          scale={state.scale}
                          onDeleteTransition={() => onDeleteStateTransition?.()}
                        />
                      ) : selectedNodeId && isEdgeId(selectedNodeId) ? (
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
                      ) : selectedNodeId &&
                        (selectedNodeId.startsWith("SEQ_ACTOR_") ||
                          selectedNodeId.startsWith("SEQ_MSG_") ||
                          selectedNodeId.startsWith("SEQ_NOTE_")) ? (
                        <SequenceManipulationToolbar
                          selectedNodeId={selectedNodeId}
                          scale={state.scale}
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
                        (connectSourceClass ||
                          connectSourceNote !== null ||
                          connectSourceNamespace) ? (
                        <ClassNodeToolbar
                          kind={
                            connectSourceNote !== null
                              ? "note"
                              : connectSourceNamespace
                                ? "namespace"
                                : "class"
                          }
                          scale={state.scale}
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
                            if (connectSourceClass)
                              onMoveClassToNamespace?.(connectSourceClass, target);
                          }}
                          onMoveToNewNamespace={() => {
                            if (connectSourceClass) onMoveClassToNewNamespace?.(connectSourceClass);
                          }}
                          onRemoveFromNamespace={() => {
                            if (connectSourceClass)
                              onRemoveClassFromNamespace?.(connectSourceClass);
                          }}
                          onDelete={() => {
                            if (connectSourceNote !== null) onDeleteClassNote?.(connectSourceNote);
                            else if (connectSourceNamespace)
                              onDeleteClassNamespace?.(connectSourceNamespace);
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
                          scale={state.scale}
                          currentStyle={currentEntityStyle ?? {}}
                          onRename={
                            onEditEntityNode
                              ? () => onEditEntityNode!(connectSourceEntity!)
                              : undefined
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
                          scale={state.scale}
                          onRename={
                            // Notes + states/composites are all renamable; choice/fork/join are
                            // shape-only (omit Rename for them).
                            onRenameStateNode && !connectSourceStateIsSpecial
                              ? () => onRenameStateNode()
                              : undefined
                          }
                          onDelete={() => {
                            if (connectSourceStateNote !== null)
                              onDeleteStateNote?.(connectSourceStateNote);
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
                            connectSourceState
                              ? getStateNodeShape(code, connectSourceState)
                              : "state"
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
                          scale={state.scale}
                          currentShape={selectedMindmapNode.shape}
                          onChangeShape={(shape) =>
                            onChangeMindmapShape?.(selectedMindmapNode.id, shape)
                          }
                          onDelete={() => onDeleteMindmapNode?.(selectedMindmapNode.id)}
                        />
                      ) : currentType === "timeline" && selectedTimelineNode ? (
                        <TimelineNodeToolbar
                          scale={state.scale}
                          node={selectedTimelineNode}
                          direction={getTimelineDirection(code)}
                          onAddEvent={(placement) =>
                            onTimelineAddEvent?.(selectedTimelineNode.id, placement)
                          }
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
                          scale={state.scale}
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
                          transform: `translate(60%, -50%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                      scale={state.scale}
                      theme={theme}
                      editingText={editingText}
                      setEditingText={setEditingText}
                      handleEditSubmit={handleEditSubmit}
                      // Only flowchart/graph labels render real HTML (foreignObject), so the
                      // format toolbar (B/I/align) is only safe there. Sequence/timeline render
                      // plain SVG text and would otherwise inject literal HTML markup.
                      handleFormatText={
                        currentType === "graph" || currentType === "flowchart"
                          ? handleFormatText
                          : undefined
                      }
                      inlineInputRef={inlineInputRef}
                      selectedSvgId={selectedSvgId}
                    />

                    {!isInlineEditing &&
                      currentType === "mindmap" &&
                      selectedMindmapNode &&
                      selectionBox && (
                        <div
                          data-scale-lock
                          data-base-transform="translateX(-50%) translateY(100%)"
                          className="absolute left-1/2 pointer-events-auto origin-top"
                          style={{
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                            bottom: `calc(-12px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            transform: `translateX(-50%) translateY(100%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
              </div>
            </TransformComponent>

            {isLocked && (
              <div className="absolute top-4 right-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-red-200 dark:border-zinc-800/80 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-sm font-bold flex items-center shadow-lg pointer-events-none z-50 animate-in fade-in duration-200">
                <Lock className="w-4 h-4 mr-2" /> Diagram Locked
              </div>
            )}

            {/* Sequence message endpoint drag handles — rendered in viewport space
                  outside TransformComponent so their screen size stays fixed regardless
                  of zoom. Canvas coordinates are converted to viewport via scale/rects. */}
            {currentType === "sequence" &&
              selectedSeqMsgEndpoints &&
              selectionBox &&
              !isLocked &&
              !isInlineEditing &&
              !connectionState.active &&
              !seqReorder &&
              !seqEndpointDragging && (
                <>
                  {[
                    { key: "source" as const, pt: selectedSeqMsgEndpoints.source },
                    { key: "target" as const, pt: selectedSeqMsgEndpoints.target },
                  ].map(({ key, pt }) => {
                    const container = containerRef.current;
                    const shell = canvasShellRef.current;
                    if (!container || !shell) return null;
                    const cRect = container.getBoundingClientRect();
                    const sRect = shell.getBoundingClientRect();
                    const vpX = pt.x * state.scale + cRect.left - container.scrollLeft - sRect.left;
                    const vpY = pt.y * state.scale + cRect.top - container.scrollTop - sRect.top;
                    return (
                      <div
                        key={`seq-endpoint-${key}`}
                        className="seq-endpoint-handle absolute z-[24] pointer-events-auto cursor-grab active:cursor-grabbing rounded-full bg-white border-2 border-blue-500 shadow-sm hover:bg-blue-50 transition-colors"
                        style={{
                          left: vpX,
                          top: vpY,
                          width: "14px",
                          height: "36px",
                          transform: "translate(-50%, -50%)",
                        }}
                        title={
                          key === "source" ? "Drag to change sender" : "Drag to change receiver"
                        }
                        onMouseDown={(e) => startSeqEndpointDrag(e, key, selectedSeqMsgEndpoints)}
                      />
                    );
                  })}
                </>
              )}
          </>
        )}
      </TransformWrapper>

      {/* Class-diagram property panel — a viewport-level right-sidebar overlay rendered outside
          the TransformWrapper so canvas pan/zoom never moves it. */}
      {currentType === "classDiagram" && selectedClass && (
        <ClassPropertyPanel
          selectedClass={selectedClass}
          onApply={(edits) => onApplyClassEdits?.(edits)}
          onClose={() => onCloseClassPanel?.()}
          onValidityChange={onClassPanelValidityChange}
        />
      )}

      {/* ER-diagram property panel — same viewport-level right-sidebar pattern as the class panel. */}
      {currentType === "erDiagram" && selectedEntity && (
        <ErPropertyPanel
          selectedEntity={selectedEntity}
          onApply={(edits) => onApplyEntityEdits?.(edits)}
          onClose={() => onCloseEntityPanel?.()}
          onValidityChange={onEntityPanelValidityChange}
        />
      )}

      {/* Sequence drag indicator — rendered at canvasShell level (outside TransformWrapper)
            so canvas pan/zoom never affects its coordinate system.
            All positions are viewport-relative to canvasShellRef. */}
      {seqDragIndicator && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="seq-drag-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
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
              <circle r={14} fill="#10b981" />
              <line
                x1={-7}
                y1={0}
                x2={7}
                y2={0}
                stroke="#ffffff"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              <line
                x1={0}
                y1={-7}
                x2={0}
                y2={7}
                stroke="#ffffff"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            </g>
          )}
        </svg>
      )}

      {/* Class-diagram connection drag preview — dashed line from the + to the cursor, plus a ring
          highlighting the snapped class/note. Outside TransformWrapper (viewport/shell coords). */}
      {classConnect && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="class-connect-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
          <line
            x1={classConnect.x1}
            y1={classConnect.y1}
            x2={classConnect.x2}
            y2={classConnect.y2}
            stroke="#6366f1"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#class-connect-arrow)"
          />
          {classConnect.snap && (
            <rect
              x={classConnect.snap.cx - 3}
              y={classConnect.snap.cy - 3}
              width={classConnect.snap.w + 6}
              height={classConnect.snap.h + 6}
              rx={6}
              fill="rgba(99,102,241,0.10)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {classConnect.anchor && (
            <g transform={`translate(${classConnect.anchor.x}, ${classConnect.anchor.y})`}>
              <circle r={5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}

      {/* ER-diagram drag-to-connect preview line + snap highlight (US1), rendered outside the
          TransformWrapper at shell level so pan/zoom never distorts its coordinates. */}
      {erConnect && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="er-connect-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
          <line
            x1={erConnect.x1}
            y1={erConnect.y1}
            x2={erConnect.x2}
            y2={erConnect.y2}
            stroke="#6366f1"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#er-connect-arrow)"
          />
          {erConnect.snap && (
            <rect
              x={erConnect.snap.cx - 3}
              y={erConnect.snap.cy - 3}
              width={erConnect.snap.w + 6}
              height={erConnect.snap.h + 6}
              rx={6}
              fill="rgba(99,102,241,0.10)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {erConnect.anchor && (
            <g transform={`translate(${erConnect.anchor.x}, ${erConnect.anchor.y})`}>
              <circle r={5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}

      {/* State-diagram drag-to-connect preview line + snap highlight, rendered outside the
          TransformWrapper at shell level so pan/zoom never distorts its coordinates. */}
      {stateConnect && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="state-connect-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
          <line
            x1={stateConnect.x1}
            y1={stateConnect.y1}
            x2={stateConnect.x2}
            y2={stateConnect.y2}
            stroke="#6366f1"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#state-connect-arrow)"
          />
          {stateConnect.snap && (
            <rect
              x={stateConnect.snap.cx - 3}
              y={stateConnect.snap.cy - 3}
              width={stateConnect.snap.w + 6}
              height={stateConnect.snap.h + 6}
              rx={6}
              fill="rgba(99,102,241,0.10)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {stateConnect.anchor && (
            <g transform={`translate(${stateConnect.anchor.x}, ${stateConnect.anchor.y})`}>
              <circle r={5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}

      {/* Class-diagram connection drop menu (relationship picker / create chip). */}
      {currentType === "classDiagram" && classConnectMenu && (
        <ClassConnectMenu
          state={classConnectMenu}
          onPickRelationship={(operator) => {
            if (classConnectMenu.target) {
              onAddClassRelationship?.(classConnectMenu.source, classConnectMenu.target, operator);
            } else {
              onCreateClassLinked?.(classConnectMenu.source, operator);
            }
            setClassConnectMenu(null);
          }}
          onChooseNewClass={() => {
            // Create the new class linked with a default association (`-->`). The user no longer
            // picks a connection type up front — they can change it later via the edge toolbar.
            onCreateClassLinked?.(classConnectMenu.source, "-->");
            setClassConnectMenu(null);
          }}
          onChooseNewNote={() => {
            onCreateNoteForClass?.(classConnectMenu.source);
            setClassConnectMenu(null);
          }}
          onClose={() => setClassConnectMenu(null)}
        />
      )}

      {/* State-diagram connection drop menu (pick which shape to create on empty canvas). */}
      {currentType === "stateDiagram" && stateConnectMenu && (
        <StateConnectMenu
          state={stateConnectMenu}
          hasStart={hasStartState(code)}
          hasEnd={hasEndState(code)}
          onPick={(kind) => {
            onCreateStateShapeLinked?.(stateConnectMenu.source, kind);
            setStateConnectMenu(null);
          }}
          onClose={() => setStateConnectMenu(null)}
        />
      )}

      {/* Sequence message reorder drop zones + drag ghost — rendered at canvasShell level
            (viewport-relative, outside TransformWrapper) so pan/zoom never shifts them. */}
      {seqReorder && (
        <div
          className="absolute inset-0 pointer-events-none z-30"
          data-seq-reorder-overlay
          data-seq-reorder-from={seqReorder.fromIndex}
          data-seq-reorder-target={seqReorder.targetSlot ?? "none"}
        >
          {seqReorder.slots.map((s) => {
            const active = seqReorder.targetSlot === s.slot;
            const alpha = active ? 0.38 : 0.16;
            const h = active ? Math.min(s.h + 4, s.h * 1.5 + 2) : s.h;
            return (
              <div
                key={`seq-drop-${s.slot}`}
                className="absolute rounded-md"
                data-seq-drop-slot={s.slot}
                data-seq-drop-active={active ? "true" : "false"}
                style={{
                  left: seqReorder.left,
                  width: seqReorder.width,
                  top: s.y - h / 2,
                  height: h,
                  border: active ? "2px solid #4f46e5" : "1.5px dashed #818cf8",
                  backgroundImage: `repeating-linear-gradient(45deg, rgba(99,102,241,${alpha}) 0, rgba(99,102,241,${alpha}) 6px, transparent 6px, transparent 12px)`,
                  transition: "top 60ms linear, height 60ms linear",
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
              background: "#4f46e5",
              opacity: 0.85,
              borderRadius: 9999,
            }}
          />
        </div>
      )}

      {/* Lifeline (participant) reorder drop zones — VERTICAL bands at the inter-column gaps, plus a
          vertical cursor guide. Viewport-relative (canvasShellRef), outside TransformWrapper, so
          pan/zoom never shifts them (panning is disabled during the drag). */}
      {seqLifelineReorder && (
        <div className="absolute inset-0 pointer-events-none z-30">
          {seqLifelineReorder.slots.map((s) => {
            const active = seqLifelineReorder.targetSlot === s.slot;
            const alpha = active ? 0.38 : 0.16;
            const w = active ? Math.min(s.w + 6, s.w * 1.6 + 2) : s.w;
            return (
              <div
                key={`seq-lifeline-drop-${s.slot}`}
                className="absolute rounded-md"
                style={{
                  top: seqLifelineReorder.top,
                  height: seqLifelineReorder.height,
                  left: s.x - w / 2,
                  width: w,
                  border: active ? "2px solid #4f46e5" : "1.5px dashed #818cf8",
                  backgroundImage: `repeating-linear-gradient(45deg, rgba(99,102,241,${alpha}) 0, rgba(99,102,241,${alpha}) 6px, transparent 6px, transparent 12px)`,
                  transition: "left 60ms linear, width 60ms linear",
                }}
              />
            );
          })}
          <div
            className="absolute"
            style={{
              top: seqLifelineReorder.top,
              height: seqLifelineReorder.height,
              left: seqLifelineReorder.cursorX - 1.5,
              width: 3,
              background: "#4f46e5",
              opacity: 0.85,
              borderRadius: 9999,
            }}
          />
        </div>
      )}

      {/* Timeline reorder drop slots — viewport-relative (canvasShellRef), outside TransformWrapper,
          so pan/zoom never shifts them (panning disabled during drag). Mirrors sequence lifeline
          reorder: hatched candidate slot markers + active highlight + cursor placement guide.
          Child-event drags show a column-centered guide; section/period drags keep the boundary
          guide. Auto-pan shifts all captured geometry by `timelineReorder.pan`. */}
      {timelineReorder && (
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
            const box = timelineReorder.nodes.filter((n) =>
              timelineReorder.movingIds.includes(n.id),
            );
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
                (s) =>
                  timelineReorder.targetId === s.id && timelineReorder.placement === s.placement,
              );
              const horizontal = getTimelineDirection(code) === "LR";
              const pan = timelineReorder.pan;
              let ghostL = timelineReorder.cursorX + 16;
              let ghostT = timelineReorder.cursorY + 16;
              if (activeSlot && activeSlot.columnMode) {
                const ghostW = Math.min(timelineReorder.ghost!.w, 260);
                const ghostH = Math.min(timelineReorder.ghost!.h, 40);
                if (horizontal) {
                  ghostL = activeSlot.guidePos + pan.dx - ghostW / 2;
                  ghostT = activeSlot.spanStart + pan.dy + 4;
                } else {
                  ghostL =
                    activeSlot.spanStart +
                    pan.dx +
                    (activeSlot.spanEnd - activeSlot.spanStart - ghostW) / 2;
                  ghostT = activeSlot.guidePos + pan.dy - ghostH / 2;
                }
              }
              return (
                <div
                  className="absolute pointer-events-none"
                  data-timeline-reorder-ghost
                  style={{
                    left: ghostL,
                    top: ghostT,
                    transform:
                      activeSlot && activeSlot.columnMode ? "none" : "translate(-8px, -8px)",
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
      )}

      {sequencePlusMenu && (
        <div
          ref={sequencePlusMenuRef}
          className="absolute pointer-events-auto z-30"
          style={{
            left: sequencePlusMenu.x,
            top: sequencePlusMenu.y,
            transform: "translate(-50%, calc(-100% - 32px))",
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
              className={`flex h-8 items-center gap-1 rounded-md px-2 text-popover-foreground hover:bg-accent ${sequencePlusMenu.mode === "note" ? "bg-accent" : ""}`}
              title="Note"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSequencePlusMenu((prev) =>
                  prev ? { ...prev, mode: prev.mode === "note" ? "root" : "note" } : prev,
                );
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
            {onSequencePlusBlock && (
              <button
                className={`flex h-8 items-center gap-1 rounded-md px-2 text-popover-foreground hover:bg-accent ${sequencePlusMenu.mode === "logic" ? "bg-accent" : ""}`}
                title="Logic block or highlight"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSequencePlusMenu((prev) =>
                    prev ? { ...prev, mode: prev.mode === "logic" ? "root" : "logic" } : prev,
                  );
                }}
              >
                <GitBranch className="h-4 w-4" />
                <span className="text-sm font-medium">Logic/Highlight</span>
              </button>
            )}
          </div>

          {sequencePlusMenu.mode === "logic" && onSequencePlusBlock && (
            <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              <div className="flex flex-col gap-0.5">
                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Logic Block
                </div>
                {[
                  { type: "loop" as const, label: "Loop" },
                  { type: "alt" as const, label: "Alt (Conditional)" },
                  { type: "opt" as const, label: "Opt (Optional)" },
                  { type: "par" as const, label: "Par (Parallel)" },
                  { type: "critical" as const, label: "Critical" },
                  { type: "break" as const, label: "Break" },
                ].map((opt) => (
                  <button
                    key={opt.type}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSequencePlusBlock(sequencePlusMenu.anchorY, opt.type);
                      setSequencePlusMenu(null);
                    }}
                  >
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span className="flex-1">{opt.label}</span>
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Highlight
                </div>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSequencePlusBlock(sequencePlusMenu.anchorY, "rect");
                    setSequencePlusMenu(null);
                  }}
                >
                  <SquareStack className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  <span className="flex-1">Highlight Box</span>
                </button>
              </div>
            </div>
          )}

          {sequencePlusMenu.mode === "note" && (
            <div className="absolute left-0 top-full mt-2 w-52 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              <div className="flex flex-col gap-1">
                <div className="px-2 pb-1 text-base font-semibold text-popover-foreground">
                  Note
                </div>
                <button
                  className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSequencePlusNote(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, "left");
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
                    onSequencePlusNote(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, "right");
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
                    onSequencePlusNote(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, "over");
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
          data-flowchart-shape-picker
          className="absolute z-50 flex flex-col gap-3 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.max(10, Math.min(shapePicker.x, viewportWidth - 250)),
            top: Math.max(10, Math.min(shapePicker.y, viewportHeight - 350)),
            width: "230px",
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Choose Shape
            </span>
            <button
              onClick={() => setShapePicker(null)}
              className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="flex flex-col gap-4 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
            {/* Basic Shapes */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Basic
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {BASIC_SHAPES.map((shape, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddNodeFromSelected(shapePicker.startNodeId, undefined, shape);
                      setShapePicker(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-background p-0 text-foreground transition-all hover:border-indigo-400 hover:bg-accent hover:text-indigo-600 active:scale-95 dark:hover:text-indigo-400"
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
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Extended
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {EXTENDED_SHAPES.map((shape, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddNodeFromSelected(shapePicker.startNodeId, undefined, shape);
                      setShapePicker(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-background p-0 text-foreground transition-all hover:border-indigo-400 hover:bg-accent hover:text-indigo-600 active:scale-95 dark:hover:text-indigo-400"
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
