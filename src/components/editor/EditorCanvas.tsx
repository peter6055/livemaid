import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { Lock, Plus, Pencil, RotateCcw, GitBranch, SquareStack } from "lucide-react";
import { CanvasZoomControls, CommentFocusSync } from "./CanvasTransform";
import { CanvasPopovers } from "./CanvasPopovers";
import {
  ClassConnectPreviewLayer,
  ErConnectPreviewLayer,
  SeqDragIndicatorLayer,
  SeqReorderDropLayer,
  StateConnectPreviewLayer,
} from "./CanvasDragLayers";
import { HoverOverlays } from "./HoverOverlays";
import { makeClassConnectDrag } from "./ClassConnectDrag";
import { makeErConnectDrag } from "./ErConnectDrag";
import { useSequenceDragMachines } from "./SequenceInteractions";
import { TimelineReorderOverlay, useTimelineReorderMachine } from "./TimelineInteractions";
import { SelectionToolbar } from "./SelectionToolbar";
import { ErPropertyPanel } from "./ErPropertyPanel";
import { ClassPropertyPanel } from "./ClassPropertyPanel";
import type { ClassConnectMenuState } from "./ClassConnectMenu";
import CanvasSvgLayer, { CanvasBackdrop } from "./CanvasSvgLayer";
import { isEdgeId } from "@/lib/diagrams/utils";
import { classNameFromSvgId, getNamespaceNames } from "@/lib/diagrams/classDiagram";
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
} from "@/lib/diagrams/stateDiagram";
import type { StateNodeShapeKind, StateShapeKind } from "@/lib/diagrams/stateDiagram";
import { getMindmapNode, parseMindmap, type MindmapShapeKind } from "@/lib/diagrams/mindmap";
import {
  findTimelineSvgElementByNodeId,
  getTimelineDirection,
  getTimelineNode,
  timelineHasNodes,
  timelineRenderOrder,
} from "@/lib/diagrams/timeline";
import type { StateConnectMenuState } from "./StateConnectMenu";
import { makeStateConnectDrag } from "./StateConnectDrag";
import { TimelineAddButtons } from "./TimelineNodeToolbar";
import type { SequenceBlockArea, SequenceBlockType } from "@/lib/diagrams/sequence/geometry";
import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BASIC_SHAPES, EXTENDED_SHAPES, type ShapeOption } from "@/lib/diagrams/flowchart";
import type { ConnectionState, ShapePicker } from "@/hooks/useCanvasInteraction";
import type { DiagramComment } from "@/lib/api/storage";
import { nearestPerimeterAnchor } from "./canvasCoord";

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
  onSequencePlusBlock?: (actorId: string, anchorY: number, type: SequenceBlockType) => void;
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
  startSequenceConnection,
  onSequencePlusSelfLoop,
  onSequencePlusNote,
  onSequencePlusBlock,
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

  // Sequence reorder drag machines (state + starter fns) live in SequenceInteractions.
  const {
    seqReorder,
    seqLifelineReorder,
    seqDragIndicator,
    setSeqDragIndicator,
    seqEndpointDragging,
    startSeqReorderDrag,
    startSeqLifelineDrag,
    startSeqEndpointDrag,
  } = useSequenceDragMachines({
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
  });

  // Timeline node reorder drag machine lives in TimelineInteractions.
  const { timelineReorder, startTimelineReorderDrag } = useTimelineReorderMachine({
    canvasShellRef,
    containerRef,
    transformInstanceRef,
    code,
    selectedNodeId,
    handleSvgClick,
    onDeselect,
    onTimelineMove,
  });

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
  const startErConnectDrag = makeErConnectDrag({
    canvasShellRef,
    selectedSvgId,
    setErConnecting,
    setErConnect,
    onAddErRelationship,
    onCreateErEntityLinked,
  });

  // Begin a state-diagram drag-to-connect from the purple +. Fully isolated (own window listeners +
  // preview SVG outside TransformWrapper), mirroring the ER connect drag. Dropping onto a DIFFERENT
  // state (regular OR composite) creates a transition `source --> target`; dropping on EMPTY canvas
  // creates a NEW state linked to the source; a no-drag click / drop on the source itself is a no-op.
  const startStateConnectDrag = makeStateConnectDrag({
    canvasShellRef,
    selectedSvgId,
    setStateConnecting,
    setStateConnect,
    setStateConnectMenu,
    setShapePicker,
    onAddStateTransition,
  });

  // Begin a class-diagram connection drag from the purple +. Fully isolated (own window listeners +
  // preview SVG outside TransformWrapper), mirroring the sequence endpoint drag. The source is
  // either a class or a note:
  //  - class source → DIFFERENT class = relationship picker; note = `note for <source>`; empty / a
  //    no-drag click = the New Class / New Note chip.
  //  - note source  → only a class target is valid (`note for <class>`); everything else is a no-op.
  const startClassConnectDrag = makeClassConnectDrag({
    canvasShellRef,
    selectedSvgId,
    setClassConnecting,
    setClassConnect,
    setClassConnectMenu,
    onLinkNoteToClass,
    onAddClassRelationship,
  });

  return (
    <div
      ref={canvasShellRef}
      className="w-full h-full relative overflow-hidden bg-white transition-colors duration-300"
    >
      <CanvasBackdrop isBlankDiagram={isBlankDiagram} handleCodeChange={handleCodeChange} />
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
            <CanvasZoomControls
              zoomIn={zoomIn}
              zoomOut={zoomOut}
              resetTransform={resetTransform}
              isLocked={isLocked}
              setIsLocked={setIsLocked}
              onDeselect={onDeselect}
            />

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

                <CanvasSvgLayer
                  isBlankDiagram={isBlankDiagram}
                  svgContent={svgContent}
                  parseError={parseError}
                  code={code}
                  comments={comments}
                  scale={state.scale}
                  containerRef={containerRef}
                  renderIdRef={renderIdRef ?? fallbackRenderIdRef}
                  activeCommentId={activeCommentId}
                  onActivateComment={onActivateComment}
                  commentComposer={commentComposer}
                  commentDraft={commentDraft}
                  setCommentDraft={setCommentDraft}
                  onSubmitComposer={onSubmitCommentComposer}
                  commentReplyDrafts={commentReplyDrafts}
                  onChangeReplyDraft={onChangeCommentReplyDraft}
                  onSubmitReply={onSubmitCommentReply}
                  onToggleResolved={onToggleCommentResolved}
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

                <HoverOverlays
                  currentType={currentType}
                  scale={state.scale}
                  selectionBox={selectionBox}
                  selectedNodeId={selectedNodeId}
                  hoveredSequenceMessageBox={hoveredSequenceMessageBox}
                  hoveredSequenceMessageIndex={hoveredSequenceMessageIndex}
                  hoveredSequenceNoteBox={hoveredSequenceNoteBox}
                  hoveredSequenceActorBox={hoveredSequenceActorBox}
                  hoveredFlowchartNodeBox={hoveredFlowchartNodeBox}
                  connectionState={connectionState}
                  isInlineEditing={isInlineEditing}
                  isCommentMode={isCommentMode}
                  isLocked={isLocked}
                  seqReorder={seqReorder}
                  seqLifelineReorder={seqLifelineReorder}
                  getSequenceLifelines={getSequenceLifelines}
                  startSeqReorderDrag={startSeqReorderDrag}
                  startSeqLifelineDrag={startSeqLifelineDrag}
                />

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

                <SelectionToolbar
                  code={code}
                  currentType={currentType}
                  scale={state.scale}
                  selectionBox={selectionBox}
                  selectedNodeId={selectedNodeId}
                  selectedSvgId={selectedSvgId}
                  isLocked={isLocked}
                  isInlineEditing={isInlineEditing}
                  setIsInlineEditing={setIsInlineEditing}
                  connectionState={connectionState}
                  setConnectionState={setConnectionState}
                  textBox={textBox}
                  theme={theme}
                  editingText={editingText}
                  setEditingText={setEditingText}
                  handleEditSubmit={handleEditSubmit}
                  handleFormatText={
                    currentType === "graph" || currentType === "flowchart"
                      ? handleFormatText
                      : undefined
                  }
                  inlineInputRef={inlineInputRef}
                  commentAnchorRef={commentAnchorRef}
                  onOpenSelectionCommentComposer={onOpenSelectionCommentComposer}
                  handleEditClick={handleEditClick}
                  handleAddNodeFromSelected={handleAddNodeFromSelected}
                  handleUpdateStyle={handleUpdateStyle}
                  handleFormatNodeLabel={handleFormatNodeLabel}
                  handleChangeShape={handleChangeShape}
                  handleDuplicateNode={handleDuplicateNode}
                  handleDeleteNode={handleDeleteNode}
                  onResetStyle={onResetStyle}
                  onUpdateEdgeStyle={onUpdateEdgeStyle}
                  onUpdateEdgeColor={onUpdateEdgeColor}
                  onUpdateEdgeAnimation={onUpdateEdgeAnimation}
                  onDeleteEdge={onDeleteEdge}
                  onUpdateClassRelationshipType={onUpdateClassRelationshipType}
                  onSetClassRelationshipCardinality={onSetClassRelationshipCardinality}
                  onDeleteClassRelationship={onDeleteClassRelationship}
                  onEditClassEdgeLabel={onEditClassEdgeLabel}
                  currentClassStyle={currentClassStyle}
                  onEditClassNode={onEditClassNode}
                  onMoveClassToNamespace={onMoveClassToNamespace}
                  onMoveClassToNewNamespace={onMoveClassToNewNamespace}
                  onRemoveClassFromNamespace={onRemoveClassFromNamespace}
                  onDeleteClassNote={onDeleteClassNote}
                  onDeleteClassNamespace={onDeleteClassNamespace}
                  onDeleteClassNode={onDeleteClassNode}
                  onSetClassStyle={onSetClassStyle}
                  onResetClassStyle={onResetClassStyle}
                  currentEntityStyle={currentEntityStyle}
                  onEditEntityNode={onEditEntityNode}
                  onDuplicateEntity={onDuplicateEntity}
                  onDeleteEntity={onDeleteEntity}
                  onSetEntityStyle={onSetEntityStyle}
                  onResetEntityStyle={onResetEntityStyle}
                  onUpdateErRelationshipOperator={onUpdateErRelationshipOperator}
                  onDeleteErRelationship={onDeleteErRelationship}
                  onEditErEdgeLabel={onEditErEdgeLabel}
                  onDeleteStateTransition={onDeleteStateTransition}
                  onRenameStateNode={onRenameStateNode}
                  onDeleteStateNote={onDeleteStateNote}
                  onDeleteStateNode={onDeleteStateNode}
                  onSetStateStyle={onSetStateStyle}
                  onResetStateStyle={onResetStateStyle}
                  onAddStateNote={onAddStateNote}
                  onFlipStateNote={onFlipStateNote}
                  onMoveStateIntoComposite={onMoveStateIntoComposite}
                  onMoveStateToNewComposite={onMoveStateToNewComposite}
                  onMoveStateToRoot={onMoveStateToRoot}
                  onChangeStateShape={onChangeStateShape}
                  onAddStateConcurrencyDivider={onAddStateConcurrencyDivider}
                  connectSourceClass={connectSourceClass}
                  connectSourceNote={connectSourceNote}
                  connectSourceNamespace={connectSourceNamespace}
                  connectSourceEntity={connectSourceEntity}
                  connectSourceState={connectSourceState}
                  connectSourceStateNote={connectSourceStateNote}
                  connectSourceStateIsComposite={connectSourceStateIsComposite}
                  connectSourceStateIsSpecial={connectSourceStateIsSpecial}
                  connectSourceStateStyle={connectSourceStateStyle}
                  connectSourceStateNotePosition={connectSourceStateNotePosition}
                  stateCompositeNames={stateCompositeNames}
                  connectSourceStateParent={connectSourceStateParent}
                  classConnecting={classConnecting}
                  erConnecting={erConnecting}
                  stateConnecting={stateConnecting}
                  startClassConnectDrag={startClassConnectDrag}
                  startErConnectDrag={startErConnectDrag}
                  startStateConnectDrag={startStateConnectDrag}
                  currentSequenceNotePosition={currentSequenceNotePosition}
                  onAddSequenceNote={onAddSequenceNote}
                  onMoveSequenceNote={onMoveSequenceNote}
                  onChangeSequenceMessageType={onChangeSequenceMessageType}
                  currentSequenceMessageOperator={currentSequenceMessageOperator}
                  onChangeSequenceParticipantType={onChangeSequenceParticipantType}
                  currentSequenceParticipantType={currentSequenceParticipantType}
                  selectedMindmapNode={selectedMindmapNode}
                  onChangeMindmapShape={onChangeMindmapShape}
                  onDeleteMindmapNode={onDeleteMindmapNode}
                  onAddMindmapChild={onAddMindmapChild}
                  selectedTimelineNode={selectedTimelineNode}
                  onTimelineAddEvent={onTimelineAddEvent}
                  onTimelineAddPeriodToSection={onTimelineAddPeriodToSection}
                  onTimelineAddPeriod={onTimelineAddPeriod}
                  onTimelineAddSection={onTimelineAddSection}
                  onTimelineDelete={onTimelineDelete}
                />
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

      <SeqDragIndicatorLayer indicator={seqDragIndicator} />

      <ClassConnectPreviewLayer connect={classConnect} />

      <ErConnectPreviewLayer connect={erConnect} />

      <StateConnectPreviewLayer connect={stateConnect} />

      <CanvasPopovers
        currentType={currentType}
        code={code}
        classConnectMenu={classConnectMenu}
        setClassConnectMenu={setClassConnectMenu}
        onAddClassRelationship={onAddClassRelationship}
        onCreateClassLinked={onCreateClassLinked}
        onCreateNoteForClass={onCreateNoteForClass}
        stateConnectMenu={stateConnectMenu}
        setStateConnectMenu={setStateConnectMenu}
        onCreateStateShapeLinked={onCreateStateShapeLinked}
      />

      <SeqReorderDropLayer reorder={seqReorder} />

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
          so pan/zoom never shifts them (panning disabled during drag). Rendered by
          TimelineReorderOverlay; slot/guide/ghost markup lives in TimelineInteractions.tsx. */}
      {timelineReorder && <TimelineReorderOverlay timelineReorder={timelineReorder} code={code} />}

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
                      onSequencePlusBlock(
                        sequencePlusMenu.actorId,
                        sequencePlusMenu.anchorY,
                        opt.type,
                      );
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
                    onSequencePlusBlock(sequencePlusMenu.actorId, sequencePlusMenu.anchorY, "rect");
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
