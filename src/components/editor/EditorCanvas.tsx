import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  Lock,
  Unlock,
  Plus,
  Pencil,
  RotateCcw,
  GitBranch,
  SquareStack,
  Palette,
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
import { ErEdgeToolbar } from "./ErEdgeToolbar";
import { ErPropertyPanel } from "./ErPropertyPanel";
import { InlineTextEditor } from "./InlineTextEditor";
import { ClassPropertyPanel } from "./ClassPropertyPanel";
import { ClassConnectMenu, type ClassConnectMenuState } from "./ClassConnectMenu";
import { CommentLayer } from "./CommentLayer";
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
import { StateConnectMenu, type StateConnectMenuState } from "./StateConnectMenu";
import type { SequenceBlockArea, SequenceBlockType } from "@/hooks/useCanvasInteraction";
import { CSSProperties, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BASIC_SHAPES, EXTENDED_SHAPES, type ShapeOption } from "@/lib/diagrams/flowchart";
import type { ConnectionState, ShapePicker } from "@/hooks/useCanvasInteraction";
import type { DiagramComment } from "@/lib/api/storage";
import { getSortedSequenceNoteTextElements } from "@/lib/diagrams/sequenceNotes";

const DEFAULT_CANVAS_INITIAL_SCALE = 2.25;

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
  hoveredSequenceNoteBox: { x: number; y: number; width: number; height: number } | null;
  hoveredFlowchartNodeBox: { x: number; y: number; width: number; height: number } | null;
  comments?: DiagramComment[];
  activeCommentId?: string | null;
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
  openHighlightRecolorRef?: React.MutableRefObject<
    ((lineIndex: number, color: string, clientX: number, clientY: number) => void) | null
  >;
  onRecolorSequenceHighlight?: (lineIndex: number, color: string) => void;
  onHoveredSequenceMessageHover: (index: number) => void;
  onHoveredSequenceMessageClick: (index: number) => void;
  onHoveredSequenceMessageDoubleClick: (index: number) => void;
  onHoveredSequenceNoteClick?: (index: number) => void;
  onHoveredSequenceNoteDoubleClick?: (index: number) => void;
  onReorderSequenceItem?: (item: { kind: "msg" | "note"; index: number }, toSlot: number) => void;
  onReorderSequenceLifelines?: (newOrderIds: string[]) => void;
  getSequenceLifelines?: () => Array<{ actorId: string; x: number; y1: number; y2: number }>;
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
  /** Class-diagram node toolbar (single-click): delete a class / note. */
  onDeleteClassNode?: (name: string) => void;
  onDeleteClassNote?: (noteIndex: number) => void;
  /** Class-diagram namespace containers: delete (unwrap) + relocate classes between namespaces. */
  onDeleteClassNamespace?: (name: string) => void;
  onMoveClassToNamespace?: (className: string, target: string) => void;
  onMoveClassToNewNamespace?: (className: string) => void;
  onRemoveClassFromNamespace?: (className: string) => void;
  /** ER-diagram property panel: the parsed entity currently selected (null otherwise). */
  selectedEntity?: ParsedEntity | null;
  onApplyEntityEdits?: (edits: EntityEdits) => void;
  onCloseEntityPanel?: () => void;
  onEntityPanelValidityChange?: (hasErrors: boolean) => void;
  /** ER-diagram node toolbar (single-click): duplicate / style / delete the entity. */
  onDuplicateEntity?: (name: string) => void;
  onDeleteEntity?: (name: string) => void;
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
  inlineInputRef: RefObject<HTMLTextAreaElement | null>;
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
  comments = [],
  activeCommentId = null,
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
  openHighlightRecolorRef,
  onRecolorSequenceHighlight,
  onHoveredSequenceMessageHover,
  onHoveredSequenceMessageClick,
  onHoveredSequenceMessageDoubleClick,
  onHoveredSequenceNoteClick,
  onHoveredSequenceNoteDoubleClick,
  onReorderSequenceItem,
  onReorderSequenceLifelines,
  getSequenceLifelines,
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
  onDeleteClassNode,
  onDeleteClassNote,
  onDeleteClassNamespace,
  onMoveClassToNamespace,
  onMoveClassToNewNamespace,
  onRemoveClassFromNamespace,
  selectedEntity,
  onApplyEntityEdits,
  onCloseEntityPanel,
  onEntityPanelValidityChange,
  onDuplicateEntity,
  onDeleteEntity,
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
    mode: "root" | "note" | "logic";
  } | null>(null);
  // Viewport-space (canvasShellRef-relative) popover for recoloring a `rect` highlight, opened by
  // double-clicking the highlight's colored background. `lineIndex` is the source line of the rect.
  const [seqHighlightColorMenu, setSeqHighlightColorMenu] = useState<{
    lineIndex: number;
    x: number;
    y: number;
    color: string;
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
  const seqHighlightColorMenuRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the last sequence-message pointer interaction actually became a drag, so the
  // hover grab overlay can distinguish a reorder-drag from a plain click (select).
  const seqDidDragRef = useRef(false);
  // Manual double-click detector for sequence-message overlays. The native `dblclick`/`e.detail`
  // counter does NOT survive the hover→selected overlay element swap (the two clicks land on
  // different DOM nodes), so we time clicks ourselves keyed by message index.
  const seqLastClickRef = useRef<{ time: number; key: string }>({ time: 0, key: "" });
  const fallbackRenderIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!seqHighlightColorMenu) return;
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && seqHighlightColorMenuRef.current?.contains(target)) return;
      setSeqHighlightColorMenu(null);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [seqHighlightColorMenu]);

  // Register the highlight-recolor popover opener so the hook (which detects the dblclick on the
  // `rect` highlight via its document-level capture listener) can open this canvasShell-positioned
  // menu. Positions are converted to canvasShellRef-relative viewport coords.
  useEffect(() => {
    if (!openHighlightRecolorRef) return;
    openHighlightRecolorRef.current = (lineIndex, color, clientX, clientY) => {
      const shellRect = canvasShellRef.current?.getBoundingClientRect();
      setSeqHighlightColorMenu({
        lineIndex,
        x: clientX - (shellRect?.left ?? 0),
        y: clientY - (shellRect?.top ?? 0),
        color,
      });
    };
    return () => {
      if (openHighlightRecolorRef) openHighlightRecolorRef.current = null;
    };
  }, [openHighlightRecolorRef]);

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
          el.closest?.("[data-scale-lock]") ||
          el.closest?.("[data-scale-lock-max1]") ||
          el.closest?.("[data-inline-toolbar]") ||
          el.closest?.("[data-scale-lock-border]") ||
          el.closest?.("[data-scale-lock-shadow]") ||
          el.closest?.(".seq-msg-reorder-handle") ||
          el.closest?.('[data-slot^="dropdown-menu"]'),
        ),
      );
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

      if (isGenericContainerTarget) {
        const candidates = Array.from(
          container.querySelectorAll(".node, .cluster, path.flowchart-link, .edgeLabel"),
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
  const startSeqReorderDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    seqDidDragRef.current = false;
    const shell = canvasShellRef.current;
    const container = containerRef.current;
    if (!shell || !container) return;
    const shellRect = shell.getBoundingClientRect();

    const textEls = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
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
    const nearestLineForText = (textEl: SVGElement) => {
      const tr = textEl.getBoundingClientRect();
      const textX = tr.left + tr.width / 2;
      const textY = tr.top + tr.height / 2;
      let bestLine: SVGElement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const lineEl of lineEls) {
        const lr = lineEl.getBoundingClientRect();
        const lineY = lr.top + lr.height / 2;
        const dx = textX < lr.left ? lr.left - textX : textX > lr.right ? textX - lr.right : 0;
        const dy = Math.abs(lineY - textY);
        const underPenalty = lineY < textY ? 60 : 0;
        const score = dy * 3 + dx + underPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestLine = lineEl;
        }
      }
      return bestLine;
    };

    lineEls.forEach((lineEl, i) => {
      const lr = lineEl.getBoundingClientRect();
      const pairedTexts = textEls.filter((textEl) => nearestLineForText(textEl) === lineEl);
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

    // Resolve which row is being dragged: the one whose band center is nearest the cursor.
    const cy0 = e.clientY - shellRect.top;
    let fromIndex = -1;
    let bestD = Number.POSITIVE_INFINITY;
    rows.forEach((r, i) => {
      const c = (r.top + r.bottom) / 2;
      const d = Math.abs(c - cy0);
      if (d < bestD) {
        bestD = d;
        fromIndex = i;
      }
    });
    if (fromIndex < 0) return;
    const draggedRow = rows[fromIndex];
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
          if (d < bestDist) {
            bestDist = d;
            best = s.slot;
          }
        }
      }
      return best;
    };

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
        seqDidDragRef.current = true;
      }
      if (!dragging) return;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      setSeqReorder({
        fromIndex,
        left,
        width,
        slots,
        cursorY,
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
        // Strict: only reorder when the drop lands inside a valid zone. Otherwise abort (snap back).
        if (targetSlot !== null) {
          onReorderSequenceItem?.(
            { kind: draggedRow.kind, index: draggedRow.domIndex },
            targetSlot,
          );
        }
      } else {
        // No drag → treat as a click on the grabbed row. We resolve select-vs-edit HERE on mouseup
        // (a window listener) instead of the overlay's React onClick, because the overlay DOM node
        // is re-rendered between mousedown and mouseup (selection mounts the second handle / hover
        // churns), so the browser never fires a native `click` on a single stable node. Double-
        // click is detected by timing (≤ 350ms on the same row key), which survives that swap.
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
        // A composite container (cluster) is a valid target too.
        const cluster = el.closest("g.statediagram-cluster");
        if (cluster) {
          const id = stateNameFromSvgId(cluster.id);
          if (!id || id === sourceId) return null;
          return { id, el: cluster };
        }
        const g = el.closest("g.node");
        if (!g || !/-state-.+-\d+$/.test(g.id) || /----note-\d+$/.test(g.id)) continue;
        const id = stateNameFromSvgId(g.id);
        if (!id || id === sourceId) return null; // self / [*] pseudo → ignore
        return { id, el: g };
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
      <TransformWrapper
        initialScale={DEFAULT_CANVAS_INITIAL_SCALE}
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
            classConnecting ||
            erConnecting ||
            stateConnecting,
          excluded: [
            "seq-connect-btn",
            "seq-msg-reorder-handle",
            "seq-endpoint-handle",
            "seq-actor-reorder-handle",
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
          setStateConnectMenu((menu) => (menu ? null : menu));
          if (containerRef.current) {
            containerRef.current.style.setProperty("--zoom-scale", String(state.scale));
            containerRef.current.style.setProperty("--zoom-inverse-scale", String(1 / state.scale));
            updateScaleLockedElements(containerRef.current, state.scale);
          }
        }}
        onPanningStart={() => {
          setStateConnectMenu((menu) => (menu ? null : menu));
        }}
        onPanning={() => {
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
                className="w-full h-full relative flex items-center justify-center cursor-grab active:cursor-grabbing"
                onDoubleClick={
                  !isLocked
                    ? (e) => {
                        // Ignore double-clicks that land on a floating toolbar / overlay control so
                        // they never enter the underlying element's edit mode. This guard lives on the
                        // CANVAS handler only — NOT inside handleEditClick — so the toolbar's own
                        // Rename button (which calls handleEditClick programmatically while the cursor
                        // is over the toolbar) still works.
                        const hitFloatingUi = document
                          .elementsFromPoint(e.clientX, e.clientY)
                          .some((el) =>
                            Boolean(
                              el.closest?.("[data-scale-lock]") ||
                              el.closest?.("[data-scale-lock-max1]") ||
                              el.closest?.("[data-inline-toolbar]") ||
                              el.closest?.("[data-scale-lock-border]") ||
                              el.closest?.("[data-scale-lock-shadow]") ||
                              el.closest?.('[data-slot^="dropdown-menu"]'),
                            ),
                          );
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
                {parseError && (
                  <div
                    className="absolute inset-0 z-40 bg-white/60 cursor-not-allowed flex items-center justify-center pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}

                <div
                  className={`mermaid-container select-none ${parseError ? "opacity-30" : ""}`}
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />

                <CommentLayer
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
                  !isInlineEditing &&
                  !connectionState.active &&
                  sequenceMessageTriggerAreas.map((area) => (
                    <div
                      key={`seq-msg-trigger-${area.index}`}
                      data-seq-msg-hover-trigger="true"
                      className="absolute pointer-events-none z-[19]"
                      style={{
                        left: area.x,
                        top: area.y,
                        width: area.width,
                        height: area.height,
                        background: "transparent",
                      }}
                    />
                  ))}

                {currentType === "sequence" &&
                  hoveredSequenceMessageBox &&
                  !selectedNodeId?.startsWith("SEQ_MSG_") &&
                  !isInlineEditing &&
                  !connectionState.active && (
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
                {currentType === "sequence" &&
                  hoveredSequenceMessageBox &&
                  !isInlineEditing &&
                  !connectionState.active &&
                  !seqReorder && (
                    <div
                      className="seq-msg-reorder-handle absolute z-[21] pointer-events-auto cursor-pointer"
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
                  sequenceLifelineOverlay && (
                    <div className="absolute inset-0 pointer-events-none z-20">
                      {sequenceLifelineOverlay.slots.map((slotY) => (
                        <button
                          key={`${sequenceLifelineOverlay.actorId}-${slotY}`}
                          data-seq-plus-actor-id={sequenceLifelineOverlay.actorId}
                          data-seq-plus-anchor-x={String(sequenceLifelineOverlay.x)}
                          data-seq-plus-anchor-y={String(slotY)}
                          data-scale-lock
                          data-base-transform="translate(-50%, -50%)"
                          className="seq-connect-btn absolute pointer-events-auto cursor-pointer w-6 h-6 rounded-full bg-indigo-600 text-white ring-2 ring-white/90 shadow-lg hover:bg-indigo-700 transition-colors"
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
                                  snapTargetId: snappedActorId ? `SEQ_ACTOR_${snappedActorId}` : null,
                                  snapTargetPos:
                                    snapX !== null
                                      ? { x: snapX, y: anchorMenuY }
                                      : null,
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

                {isInlineEditing && selectedSvgId && (
                  <style>{`
                        #${selectedSvgId},
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

                {currentType === "sequence" &&
                  (selectedNodeId?.startsWith("SEQ_MSG_") ||
                    selectedNodeId?.startsWith("SEQ_NOTE_")) &&
                  selectionBox &&
                  !isLocked &&
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
                      onMouseDown={startSeqReorderDrag}
                    />
                  )}

                {/* Message endpoint drag handles — vertical rounded "bars" (capsules) at the
                      sender + receiver ends of the selected message. Dragging a handle to another
                      lifeline reassigns that endpoint in the code; dragging onto the source's own
                      lifeline morphs the message into a self-loop (and vice-versa). Rendered in
                      canvas coords inside the TransformComponent so they track pan/zoom;
                      scale-locked so the on-screen size stays constant. z above the reorder grab
                      overlay + selection border. */}
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
                        return (
                          <div
                            key={`seq-endpoint-${key}`}
                            data-scale-lock
                            data-base-transform="translate(-50%, -50%)"
                            className="seq-endpoint-handle absolute z-[24] pointer-events-auto cursor-grab active:cursor-grabbing rounded-full bg-white border-[3px] border-blue-500 shadow-sm hover:bg-blue-50 transition-colors"
                            style={{
                              left: pt.x,
                              // Center the bar ON the endpoint line (no fixed upward nudge). A constant
                              // upward offset drifts the bar onto the PREVIOUS message when zoomed out
                              // (rows pack to a few px apart while the bar keeps a min screen size), so
                              // it must straddle its own endpoint symmetrically at every zoom level.
                              top: pt.y,
                              width: "14px",
                              height: "44px",
                              minWidth: "14px",
                              minHeight: "44px",
                              transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
                            }}
                            title={
                              key === "source" ? "Drag to change sender" : "Drag to change receiver"
                            }
                            onMouseDown={(e) =>
                              startSeqEndpointDrag(e, key, selectedSeqMsgEndpoints)
                            }
                          />
                        );
                      })}
                    </>
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
                      left:
                        selectionBox.x -
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 1 : 4) / state.scale,
                      top:
                        selectionBox.y -
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 1 : 4) / state.scale,
                      width:
                        selectionBox.width +
                        (selectedNodeId?.startsWith("SEQ_MSG_") ? 2 : 8) / state.scale,
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
                        />
                      ) : currentType === "erDiagram" && connectSourceEntity ? (
                        <ErNodeToolbar
                          scale={state.scale}
                          currentStyle={currentEntityStyle ?? {}}
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
                      ) : currentType === "sequence" ||
                        currentType === "classDiagram" ||
                        currentType === "erDiagram" ||
                        currentType === "stateDiagram" ? null : (
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
                        type="button"
                        data-scale-lock
                        data-inline-toolbar
                        className="absolute right-0 top-0 z-[23] flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-indigo-600 shadow-lg transition-colors hover:bg-indigo-50 pointer-events-auto dark:bg-zinc-900 dark:text-indigo-300 dark:hover:bg-zinc-800"
                        style={{
                          transform: `translate(50%, -50%) scale(var(--zoom-inverse-scale, ${1 / state.scale}))`,
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
                      inlineInputRef={inlineInputRef}
                      selectedSvgId={selectedSvgId}
                    />

                    {!isInlineEditing &&
                      currentType !== "sequence" &&
                      currentType !== "classDiagram" &&
                      currentType !== "erDiagram" &&
                      currentType !== "stateDiagram" &&
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

      {seqHighlightColorMenu && (
        <div
          ref={seqHighlightColorMenuRef}
          className="absolute pointer-events-auto z-30"
          style={{
            left: seqHighlightColorMenu.x,
            top: seqHighlightColorMenu.y,
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-xl border border-border bg-popover p-2 shadow-xl">
            <div className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Highlight Color
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { name: "Blue", rgb: "rgb(200, 220, 255)" },
                { name: "Green", rgb: "rgb(204, 245, 217)" },
                { name: "Yellow", rgb: "rgb(255, 244, 191)" },
                { name: "Orange", rgb: "rgb(255, 224, 191)" },
                { name: "Red", rgb: "rgb(255, 205, 205)" },
                { name: "Purple", rgb: "rgb(229, 214, 255)" },
                { name: "Pink", rgb: "rgb(255, 209, 235)" },
                { name: "Gray", rgb: "rgb(228, 231, 236)" },
              ].map((c) => {
                const isActive =
                  (seqHighlightColorMenu.color || "").replace(/\s/g, "") ===
                  c.rgb.replace(/\s/g, "");
                return (
                  <button
                    key={c.name}
                    title={c.name}
                    className={`h-7 w-7 rounded-full border border-slate-300 transition-transform hover:scale-110 ${isActive ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-popover" : ""}`}
                    style={{ backgroundColor: c.rgb }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRecolorSequenceHighlight?.(seqHighlightColorMenu.lineIndex, c.rgb);
                      setSeqHighlightColorMenu(null);
                    }}
                  />
                );
              })}
            </div>
            <label className="mt-2 flex items-center gap-2 rounded-md px-1 py-1 text-sm text-popover-foreground">
              <Palette className="h-4 w-4 shrink-0 text-violet-500" />
              <span className="flex-1">Custom…</span>
              <input
                type="color"
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const hex = e.target.value;
                  const r = parseInt(hex.slice(1, 3), 16);
                  const g = parseInt(hex.slice(3, 5), 16);
                  const b = parseInt(hex.slice(5, 7), 16);
                  onRecolorSequenceHighlight?.(
                    seqHighlightColorMenu.lineIndex,
                    `rgb(${r}, ${g}, ${b})`,
                  );
                  setSeqHighlightColorMenu(null);
                }}
              />
            </label>
          </div>
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
