"use client";

import { getTelemetry } from "@/lib/telemetry";
import { useEditorState } from "@/hooks/useEditorState";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import {
  determineDiagramType,
  isEdgeId,
  parseEdgeId,
  updateLinkStyleAndLabel,
  getLinkIndex,
  updateLinkColor,
  updateMermaidCurve,
  updateLinkAnimation,
  deleteLink,
  rebuildLinkStyles,
  getLinkLabelFromMiddle,
  matchFlowchartLinkLine,
} from "@/lib/diagrams/utils";
import {
  findFlowchartNodeLine,
  findFlowchartEdgeLine,
  findSequenceParticipantLine,
} from "@/lib/diagrams/selectionLineMap";
import { buildSequenceMessageAnchor } from "@/lib/diagrams/sequenceCommentAnchor";
import { computeInsertionIndex, type UnifiedRow } from "@/lib/diagrams/sequenceReorder";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { EditorHeader } from "./EditorHeader";
import { EditorCodePanel } from "./EditorCodePanel";
import { EditorCanvas } from "./EditorCanvas";
import { CommentSidebar } from "./comments/CommentSidebar";
import { ClassTextEditor } from "./ClassTextEditor";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Loader2,
  Undo2,
  Redo2,
  Type,
  Hash,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
  FileQuestion,
  MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import * as htmlToImage from "html-to-image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DiagramRegistry } from "@/lib/diagrams/registry";
import {
  classNameFromSvgId,
  parseClassByName,
  applyClassEdits,
  getClassTitle,
  upsertClassTitle,
  removeClassTitle,
  getClassNotes,
  updateClassNoteByIndex,
  getNextClassName,
  addClassRelationship,
  addClassWithRelationship,
  appendClassNoteForClass,
  setClassNoteTarget,
  classRelationshipFromEdgeDataId,
  updateClassRelationshipOperator,
  setClassRelationshipCardinality,
  setClassRelationshipLabel,
  deleteClassRelationship,
  deleteClassByName,
  deleteClassNoteByIndex,
  findClassDefinitionLine,
  getNamespaceNames,
  findNamespaceDefinitionLine,
  renameNamespace,
  deleteNamespace,
  moveClassToNamespace,
  moveClassToNewNamespace,
  type ClassEdits,
} from "@/lib/diagrams/classDiagram";
import {
  entityNameFromSvgId,
  parseEntityByName,
  applyEntityEdits,
  duplicateEntity,
  deleteEntity,
  getEntityStyle,
  setEntityStyle,
  removeEntityStyle,
  findEntityDefinitionLine,
  getErTitle,
  upsertErTitle,
  removeErTitle,
  addErRelationship,
  addEntityWithRelationship,
  updateErRelationshipOperator,
  setErRelationshipLabel,
  deleteErRelationship,
  erRelationshipFromEdgeDataId,
  type EntityEdits,
} from "@/lib/diagrams/erDiagram";
import {
  stateNameFromSvgId,
  isSpecialStateNode,
  getStateLabel,
  setStateLabel,
  getStateTitle,
  upsertStateTitle,
  removeStateTitle,
  getStateNotes,
  updateStateNoteByIndex,
  deleteStateNoteByIndex,
  deleteStateById,
  findStateDefinitionLine,
  stateTransitionFromEdgeDataId,
  addTransition,
  addShapeWithTransition,
  setStateTransitionLabel,
  deleteStateTransition,
  setStateStyle,
  removeStateStyle,
  addNoteForState,
  setStateNotePosition,
  moveStateIntoComposite,
  moveStateToNewComposite,
  addConcurrencyDivider,
  setStateNodeShape,
} from "@/lib/diagrams/stateDiagram";
import type { StateNodeShapeKind, StateShapeKind } from "@/lib/diagrams/stateDiagram";
import { FONT_OPTIONS } from "@/lib/diagrams/constants";
import { updateMermaidConfigProperty, updateMermaidFontFamily } from "@/lib/diagrams/utils";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

const DEFAULT_HISTORY_PREVIEW_SCALE = 2;
import { Star } from "lucide-react";
import mermaid from "mermaid";
import type { VersionHistoryEntry, Folder } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import type { MonacoCodeEditor, ConfirmOptions } from "@/lib/diagrams/types";
import type { ShapeOption } from "@/lib/diagrams/flowchart";
import type { OnMount } from "@monaco-editor/react";
import { DemoBanner } from "@/components/DemoBanner";
import type { DiagramComment, DiagramCommentAnchor } from "@/lib/api/storage";

// Remove sequence blocks left TRULY empty (an opener — rect/loop/opt/alt/par/critical/break —
// whose body contains no message/note, only section dividers like else/and/option). Such a block
// parses but crashes Mermaid's sequence renderer during bounds calculation, so dragging the sole
// message out of a `rect … end` highlight would otherwise break the whole diagram. The opener, its
// matching `end`, and any section divider lines are dropped. Stack-based + content propagation so a
// parent that contains only empty children is itself pruned (one pass handles arbitrary nesting).
function pruneEmptySequenceBlocks(lines: string[]): string[] {
  const openerRe = /^(loop|alt|opt|par|critical|break|rect)\b/i;
  const sectionRe = /^(else|and|option)\b/i;
  const closerRe = /^end\b/i;
  const stack: Array<{ openerIdx: number; hasContent: boolean; sectionIdxs: number[] }> = [];
  const toRemove = new Set<number>();
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === "") continue;
    if (openerRe.test(t)) {
      stack.push({ openerIdx: i, hasContent: false, sectionIdxs: [] });
    } else if (sectionRe.test(t) && stack.length) {
      stack[stack.length - 1].sectionIdxs.push(i);
    } else if (closerRe.test(t) && stack.length) {
      const b = stack.pop()!;
      if (!b.hasContent) {
        toRemove.add(b.openerIdx);
        b.sectionIdxs.forEach((x) => toRemove.add(x));
        toRemove.add(i);
      } else if (stack.length) {
        stack[stack.length - 1].hasContent = true;
      }
    } else if (stack.length) {
      // Any non-empty, non-structural line counts as real content for the innermost open block.
      stack[stack.length - 1].hasContent = true;
    }
  }
  if (toRemove.size === 0) return lines;
  return lines.filter((_, i) => !toRemove.has(i));
}

export function LiveMaidEditor({
  documentId,
  isDemo = false,
}: {
  documentId: string;
  isDemo?: boolean;
}) {
  const IS_DEMO_MODE = isDemo;
  const router = useRouter();

  const {
    doc,
    setDoc,
    code,
    loading,
    notFound,
    saving,
    svgContent,
    currentTheme,
    currentFont,
    setCurrentFont,
    parseError,
    renderIdRef,
    handleCodeChange,
    hasUnsavedChangesRef,
  } = useEditorState(documentId, isDemo);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  // Mirror `isLocked` in a ref so the document-level double-click routers (registered once with a
  // `[code]` dep) can read the latest lock state without re-subscribing. When the diagram is locked
  // the canvas is read-only: double-click-to-edit (labels, titles, notes) and the property panels
  // must NOT open.
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(true);
  const [navigatingState, setNavigatingState] = useState<{
    isNavigating: boolean;
    message: string;
  }>({ isNavigating: false, message: "" });

  // Dialog states
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [isNewDiagramOpen, setIsNewDiagramOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    url: string;
    message: string;
  } | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyDrafts, setHistoryDrafts] = useState<Record<string, string>>({});
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewSvgContent, setPreviewSvgContent] = useState("");
  const [previewParseError, setPreviewParseError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState("PNG");
  const [exportBg, setExportBg] = useState("transparent");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [showResolvedComments, setShowResolvedComments] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeCommentFocusToken, setActiveCommentFocusToken] = useState(0);
  const [commentComposer, setCommentComposer] = useState<{
    anchor: DiagramCommentAnchor;
    position: { x: number; y: number };
    targetLabel: string;
    commentMode: "shape" | "canvas";
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentReplyDrafts, setCommentReplyDrafts] = useState<Record<string, string>>({});
  const allowBrowserBackRef = useRef(false);

  const handleCloseComments = useCallback(() => {
    setIsCommentsOpen(false);
    setIsCommentMode(false);
    setCommentComposer(null);
    setCommentDraft("");
  }, []);

  const handleExitCommentMode = useCallback(() => {
    setIsCommentMode(false);
    setCommentComposer(null);
    setCommentDraft("");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isCommentMode) return;
      event.preventDefault();
      event.stopPropagation();
      handleExitCommentMode();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleExitCommentMode, isCommentMode]);

  const handleCanvasCommentPlace = useCallback((position: { x: number; y: number }) => {
    const contentWidth = containerRef.current?.offsetWidth || 1;
    const contentHeight = containerRef.current?.offsetHeight || 1;
    setCommentComposer({
      anchor: {
        type: "canvas",
        position: {
          x: position.x / contentWidth,
          y: position.y / contentHeight,
        },
      },
      position,
      targetLabel: `Canvas position ${Math.round(position.x)}, ${Math.round(position.y)}`,
      commentMode: "canvas",
    });
    setCommentDraft("");
    setIsCommentMode(false);
    setActiveCommentId(null);
  }, []);

  // Promise-based confirmation provider so server-imported diagram plugins can
  // trigger the UI-library AlertDialog (which they cannot import themselves).
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    destructive: boolean;
  } | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const resolveConfirm = useCallback((result: boolean) => {
    setConfirmState((prev) => (prev ? { ...prev, open: false } : prev));
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    resolve?.(result);
  }, []);

  const requestConfirm = useCallback((opts: ConfirmOptions) => {
    // Settle any in-flight request before opening a new one.
    confirmResolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel ?? "Confirm",
        destructive: opts.destructive ?? false,
      });
    });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load folders so the header breadcrumb can show the diagram's folder path.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/folders")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setFolders(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    selectedNodeId,
    setSelectedNodeId,
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
    inlineInputRef,
    commitEditRef,
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
    startSequenceConnection,
    getSequenceMessageEndpointGeometry,
    getSequenceLifelines,
    sequenceBlockAreas,
    getSequenceBlockEntries,
    shapePicker,
    setShapePicker,
    getSequenceNoteEntries,
    insertSequenceNoteAtIndex,
    updateNotePosition,
    getSequenceInsertIndexForAnchor,
  } = useCanvasInteraction({
    code,
    svgContent,
    renderIdRef,
    containerRef,
    isLocked,
    handleCodeChange,
    determineDiagramType,
    isCommentMode,
    onCanvasCommentPlace: handleCanvasCommentPlace,
  });

  const handleDeselect = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedSvgId(null);
    setSelectionBox(null);
    setTextBox(null);
    setIsInlineEditing(false);
    setSelectedClassName(null);
  }, [setSelectedNodeId, setSelectedSvgId, setSelectionBox, setTextBox, setIsInlineEditing]);

  // Class-diagram property panel state. `selectedClassName` is sticky: the interaction hook's
  // `recalculateSelection` clears the underlying canvas selection whenever it cannot re-resolve a
  // node after a re-render (which happens for class nodes on every member edit), so deriving the
  // panel directly from the selection would close it mid-edit. The panel opens ONLY on a
  // double-click of a class node (see the dblclick listener below) and stays open until an explicit
  // close (X button, or a click that is neither the panel nor another class node).
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);

  // ER-diagram property panel state. `selectedEntityName` is sticky for the same reason as
  // `selectedClassName`: the interaction hook clears the canvas selection on every re-render it
  // can't re-resolve (which happens for entity nodes on each attribute edit), so the panel is
  // driven by this double-click-set state, not the live selection.
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null);
  const entityPanelHasErrorsRef = useRef(false);
  const handleEntityPanelValidityChange = useCallback((hasErrors: boolean) => {
    entityPanelHasErrorsRef.current = hasErrors;
  }, []);

  // ER-diagram inline TITLE editor (double-click the diagram title to edit, click outside to exit).
  // Mirrors the class-diagram title editing flow and reuses the shared `ClassTextEditor` overlay.
  const [erTitleEdit, setErTitleEdit] = useState<{
    value: string;
    rect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  // ER-diagram inline relationship LABEL editor (US4). Double-click an edge / its label (or the edge
  // toolbar pencil) to edit the `: "label"` inline; commits live per-keystroke (debounced) AND on
  // Enter / blur. `lineIndex` is the relationship's source line, resolved at open time.
  const [erEdgeLabelEdit, setErEdgeLabelEdit] = useState<{
    lineIndex: number;
    value: string;
    rect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  // State-diagram inline editor for a diagram TITLE, a state/composite LABEL, a NOTE, or a transition
  // EDGE label (double-click to edit, click outside / Enter to commit). Positioned in viewport space
  // from the element's bounding rect at open time. Reuses the shared `ClassTextEditor` overlay.
  const [stateTextEdit, setStateTextEdit] = useState<{
    kind: "title" | "state" | "note" | "edge";
    id: string; // the state id (kind "state")
    noteIndex: number; // source-order note index (kind "note")
    lineIndex?: number; // transition source line (kind "edge")
    value: string;
    rect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  // Tracks whether the class property panel currently holds invalid attribute/method rows. Kept in
  // a ref (not state) so the outside-click deselect listener reads the latest value without
  // re-subscribing, and so it never triggers a re-render of the editor on every keystroke.
  const classPanelHasErrorsRef = useRef(false);
  // Stable identity so the panel's validity effects don't re-fire (and its unmount reset doesn't
  // misfire) on every parent render.
  const handleClassPanelValidityChange = useCallback((hasErrors: boolean) => {
    classPanelHasErrorsRef.current = hasErrors;
  }, []);

  // Inline text editor for a class-diagram TITLE, NOTE, or relationship LABEL (double-click to
  // edit, click outside to exit). Positioned in viewport space from the element's bounding rect at
  // open time. For relationships, `rel` carries the source/target/occurrence used to commit.
  const [classTextEdit, setClassTextEdit] = useState<{
    kind: "title" | "note" | "relationship" | "namespace";
    noteIndex: number;
    value: string;
    rect: { left: number; top: number; width: number; height: number };
    rel?: { source: string; target: string; occurrence: number };
    namespaceName?: string;
  } | null>(null);

  // Clear class-diagram editing state whenever the diagram is not a class diagram.
  useEffect(() => {
    if (determineDiagramType(code) !== "classDiagram") {
      setSelectedClassName(null);
      setClassTextEdit(null);
    }
    if (determineDiagramType(code) !== "erDiagram") {
      setSelectedEntityName(null);
      setErTitleEdit(null);
      setErEdgeLabelEdit(null);
    }
    if (determineDiagramType(code) !== "stateDiagram") {
      setStateTextEdit(null);
    }
  }, [code]);

  // Double-click routing for class diagrams: a class node opens the property panel; the diagram
  // title or a note enters inline text-edit mode. The browser does NOT reliably fire a native
  // `dblclick` here — the first click selects the node and mounts a selection overlay, so the
  // second click lands on a different target and no `dblclick` is dispatched. So we detect a
  // double-click by TIMING: two mousedowns at (nearly) the same point within 400 ms.
  // `elementsFromPoint` then sees through any overlay div to find the real SVG target underneath.
  useEffect(() => {
    if (determineDiagramType(code) !== "classDiagram") return;

    const route = (clientX: number, clientY: number) => {
      // In lock mode the canvas is read-only — no double-click-to-edit / property panel.
      if (isLockedRef.current) return;
      const els = document.elementsFromPoint(clientX, clientY);
      if (
        els.some((el) =>
          el.closest(
            "[data-class-property-panel],[data-class-text-editor],[data-class-connect-menu],[data-inline-toolbar],.class-connect-btn,.monaco-editor",
          ),
        )
      ) {
        return;
      }

      // Title — `text.classDiagramTitleText` (direct child of the svg).
      const titleEl = els.find((el) => el.classList?.contains("classDiagramTitleText"));
      if (titleEl) {
        const r = titleEl.getBoundingClientRect();
        setSelectedClassName(null);
        setClassTextEdit({
          kind: "title",
          noteIndex: -1,
          value: getClassTitle(code),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        });
        return;
      }

      // Note — rendered as `g.node` with an id ending in `-note<N>`.
      const noteGroup = els
        .map((el) => el.closest("g.node"))
        .find((g): g is Element => !!g && /-note\d+$/.test(g.id));
      if (noteGroup) {
        const idx = parseInt(noteGroup.id.match(/-note(\d+)$/)?.[1] ?? "0", 10);
        const r = noteGroup.getBoundingClientRect();
        setSelectedClassName(null);
        setClassTextEdit({
          kind: "note",
          noteIndex: idx,
          value: getClassNotes(code)[idx]?.text ?? "",
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        });
        return;
      }

      // Class node — open the property panel.
      const classGroup = els
        .map((el) => el.closest("g.node"))
        .find((g): g is Element => !!g && /classId-/.test(g.id));
      if (classGroup) {
        const name = classNameFromSvgId(classGroup.id);
        if (name) {
          setClassTextEdit(null);
          setSelectedClassName(name);
        }
        return;
      }

      // Namespace container — double-clicking its title/boundary inline-renames it. The cluster
      // label text equals the namespace name; we validate it against the parsed namespaces so a
      // stray cluster from another diagram type can never be mistaken for one.
      const clusterGroup = els.map((el) => el.closest("g.cluster")).find((g): g is Element => !!g);
      if (clusterGroup) {
        const labelEl = clusterGroup.querySelector(".cluster-label, .nodeLabel, text, tspan, p");
        const nsName = (labelEl?.textContent || "").trim();
        if (nsName && getNamespaceNames(code).includes(nsName)) {
          const anchor = labelEl ?? clusterGroup;
          const r = anchor.getBoundingClientRect();
          setSelectedClassName(null);
          setClassTextEdit({
            kind: "namespace",
            noteIndex: -1,
            value: nsName,
            namespaceName: nsName,
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          });
        }
        return;
      }

      // Edge — double-clicking a connection (or its wide hit-target) inline-edits text. Class
      // diagrams render TWO kinds of `path.relation`:
      //   • a UML relationship → `data-id="id_<Src>_<Dst>_<N>"` → edit its `: label`
      //   • a note↔class attachment → `data-id="edgeNote<N>"` → edit the connected note's text
      // (`edgeNote<N>` maps 1:1 to note DOM node `…-note<N>`, whose index == `getClassNotes` order).
      const relEl = els.find(
        (el) =>
          el.classList?.contains("relation") || el.classList?.contains("class-relation-hit-target"),
      );
      const dataId = relEl?.getAttribute("data-id");
      if (dataId) {
        const noteEdge = dataId.match(/^edgeNote(\d+)$/);
        if (noteEdge) {
          const idx = parseInt(noteEdge[1], 10);
          const notes = getClassNotes(code);
          if (notes[idx]) {
            // Anchor the editor over the connected note box when we can find it, else the click point.
            const noteNode = document.querySelector(`g.node[id$="-note${idx}"]`);
            const r = noteNode?.getBoundingClientRect();
            setSelectedClassName(null);
            setClassTextEdit({
              kind: "note",
              noteIndex: idx,
              value: notes[idx].text,
              rect: r
                ? { left: r.left, top: r.top, width: r.width, height: r.height }
                : { left: clientX - 60, top: clientY - 14, width: 120, height: 28 },
            });
          }
          return;
        }
        const rel = classRelationshipFromEdgeDataId(code, dataId);
        if (rel) {
          setSelectedClassName(null);
          setClassTextEdit({
            kind: "relationship",
            noteIndex: -1,
            value: rel.label,
            // Anchor a small editor box at the double-click point (the relationship line has no
            // single tidy label box, and the cardinality labels are separate elements).
            rect: { left: clientX - 60, top: clientY - 14, width: 120, height: 28 },
            rel: { source: rel.source, target: rel.target, occurrence: rel.occurrence },
          });
        }
      }
    };

    const last = { x: 0, y: 0, t: 0 };
    const onDown = (e: MouseEvent) => {
      const now = Date.now();
      const near = Math.abs(e.clientX - last.x) <= 6 && Math.abs(e.clientY - last.y) <= 6;
      if (last.t && now - last.t <= 400 && near) {
        route(e.clientX, e.clientY);
        last.t = 0; // reset so a third quick press doesn't re-trigger
      } else {
        last.x = e.clientX;
        last.y = e.clientY;
        last.t = now;
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [code]);

  // Open the ER relationship-label inline editor (US4) at a viewport point. The shared
  // `ClassTextEditor` centers itself on the given rect (a small box at the click / edge point — the
  // relationship line has no single tidy label box, mirroring the class relationship label edit).
  const openErEdgeLabelEditor = useCallback(
    (lineIndex: number, label: string, clientX: number, clientY: number) => {
      setErEdgeLabelEdit({
        lineIndex,
        value: label,
        rect: { left: clientX - 60, top: clientY - 14, width: 120, height: 28 },
      });
    },
    [],
  );

  // Double-click routing for ER diagrams: an entity node opens its property panel. Detected by the
  // same TIMING technique as the class router (the first click mounts the selection overlay, so the
  // browser never dispatches a native `dblclick` on the second click). `elementsFromPoint` sees
  // through the overlay to the underlying `g.node` whose id ends in `-entity-<Name>-<idx>`.
  useEffect(() => {
    if (determineDiagramType(code) !== "erDiagram") return;

    const route = (clientX: number, clientY: number) => {
      // In lock mode the canvas is read-only — no double-click-to-edit / entity property panel.
      if (isLockedRef.current) return;
      const els = document.elementsFromPoint(clientX, clientY);
      if (
        els.some((el) =>
          el.closest(
            "[data-er-property-panel],[data-class-text-editor],[data-inline-toolbar],.monaco-editor",
          ),
        )
      ) {
        return;
      }
      // Diagram title — `text.erDiagramTitleText`. Double-click to inline-edit (same as the class
      // diagram title). Opens the shared `ClassTextEditor` seeded from the frontmatter `title:`.
      const titleEl = els.find((el) => el.classList?.contains("erDiagramTitleText"));
      if (titleEl) {
        const r = titleEl.getBoundingClientRect();
        setErTitleEdit({
          value: getErTitle(code),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        });
        return;
      }
      // Relationship edge / its label (US4) — double-click to inline-edit the `: "label"`. Detect
      // the relationship path (or its wide hit-target), or the `.edgeLabel` container, then resolve
      // its stable `data-id` to the source line via the trailing `_<N>` index.
      const edgeEl = els.find(
        (el) =>
          el.classList?.contains("relationshipLine") ||
          el.classList?.contains("er-relation-hit-target"),
      );
      const labelEl = els.map((el) => el.closest(".edgeLabel")).find((g): g is Element => !!g);
      const edgeDataId =
        edgeEl?.getAttribute("data-id") ??
        labelEl?.querySelector("[data-id]")?.getAttribute("data-id") ??
        null;
      if (edgeDataId) {
        const rel = erRelationshipFromEdgeDataId(code, edgeDataId);
        if (rel) {
          openErEdgeLabelEditor(rel.lineIndex, rel.label, clientX, clientY);
          return;
        }
      }
      const entityGroup = els
        .map((el) => el.closest("g.node"))
        .find((g): g is Element => !!g && /-entity-.+-\d+$/.test(g.id));
      if (entityGroup) {
        const name = entityNameFromSvgId(entityGroup.id);
        if (name) setSelectedEntityName(name);
      }
    };

    const last = { x: 0, y: 0, t: 0 };
    const onDown = (e: MouseEvent) => {
      const now = Date.now();
      const near = Math.abs(e.clientX - last.x) <= 6 && Math.abs(e.clientY - last.y) <= 6;
      if (last.t && now - last.t <= 400 && near) {
        route(e.clientX, e.clientY);
        last.t = 0;
      } else {
        last.x = e.clientX;
        last.y = e.clientY;
        last.t = now;
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [code, openErEdgeLabelEditor]);

  // Double-click routing for state diagrams: the diagram TITLE, a NOTE, a COMPOSITE container, or a
  // regular STATE enters inline label-edit mode. Same TIMING detection as the class/ER routers (the
  // first click mounts the selection overlay, so the browser never dispatches a native `dblclick`);
  // `elementsFromPoint` sees through the overlay to the underlying SVG element.
  useEffect(() => {
    if (determineDiagramType(code) !== "stateDiagram") return;

    const route = (clientX: number, clientY: number) => {
      // In lock mode the canvas is read-only — no double-click-to-edit.
      if (isLockedRef.current) return;
      const els = document.elementsFromPoint(clientX, clientY);
      if (
        els.some((el) =>
          el.closest(
            "[data-class-text-editor],[data-inline-toolbar],.state-connect-btn,.monaco-editor",
          ),
        )
      ) {
        return;
      }

      const container = document.querySelector(".mermaid-container");

      // Diagram title — `text.stateDiagramTitleText`. Opens the shared editor seeded from the title.
      const titleEl = els.find((el) => el.classList?.contains("stateDiagramTitleText"));
      if (titleEl) {
        const r = titleEl.getBoundingClientRect();
        setStateTextEdit({
          kind: "title",
          id: "",
          noteIndex: -1,
          value: getStateTitle(code),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        });
        return;
      }

      // Note — `g.statediagram-note`. Map its DOM order to the source-ordered note index.
      const noteGroup = els
        .map((el) => el.closest("g.statediagram-note"))
        .find((g): g is Element => !!g);
      if (noteGroup && container) {
        const noteEls = Array.from(container.querySelectorAll("g.statediagram-note"));
        const idx = noteEls.indexOf(noteGroup);
        const note = getStateNotes(code)[idx];
        if (note) {
          const r = noteGroup.getBoundingClientRect();
          setStateTextEdit({
            kind: "note",
            id: "",
            noteIndex: idx,
            value: note.text,
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          });
        }
        return;
      }

      // Composite container — `g.statediagram-cluster` (renamed via the colon form on its id).
      const clusterGroup = els
        .map((el) => el.closest("g.statediagram-cluster"))
        .find((g): g is Element => !!g);
      if (clusterGroup) {
        const id = stateNameFromSvgId(clusterGroup.id);
        if (id) {
          const labelEl = clusterGroup.querySelector(".cluster-label, text, foreignObject");
          const anchor = labelEl ?? clusterGroup;
          const r = anchor.getBoundingClientRect();
          setStateTextEdit({
            kind: "state",
            id,
            noteIndex: -1,
            value: getStateLabel(code, id) || id,
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          });
        }
        return;
      }

      // Regular state node — `g.node` id `…-state-<Name>-<idx>` (excludes [*] pseudo + notes +
      // shape-only choice/fork/join, which have no editable label).
      const stateGroup = els
        .map((el) => el.closest("g.node"))
        .find(
          (g): g is Element => !!g && /-state-.+-\d+$/.test(g.id) && !/----note-\d+$/.test(g.id),
        );
      if (stateGroup) {
        const id = stateNameFromSvgId(stateGroup.id);
        if (id && !isSpecialStateNode(code, id)) {
          const r = stateGroup.getBoundingClientRect();
          setStateTextEdit({
            kind: "state",
            id,
            noteIndex: -1,
            value: getStateLabel(code, id) || id,
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          });
        }
        return;
      }

      // Transition edge / its label — double-click to inline-edit the `: label`. Detect the
      // transition path (or its wide hit-target), or the `.edgeLabel` container, then resolve its
      // stable `data-id` (`edge<N>`) to the source line.
      const edgeEl = els.find(
        (el) =>
          el.classList?.contains("transition") ||
          el.classList?.contains("state-transition-hit-target"),
      );
      const labelEl = els.map((el) => el.closest(".edgeLabel")).find((g): g is Element => !!g);
      const edgeDataId =
        edgeEl?.getAttribute("data-id") ??
        labelEl?.querySelector("[data-id]")?.getAttribute("data-id") ??
        null;
      if (edgeDataId) {
        const rel = stateTransitionFromEdgeDataId(code, edgeDataId);
        if (rel) {
          setStateTextEdit({
            kind: "edge",
            id: "",
            noteIndex: -1,
            lineIndex: rel.lineIndex,
            value: rel.label,
            rect: { left: clientX - 60, top: clientY - 14, width: 120, height: 28 },
          });
        }
      }
    };

    const last = { x: 0, y: 0, t: 0 };
    const onDown = (e: MouseEvent) => {
      const now = Date.now();
      const near = Math.abs(e.clientX - last.x) <= 6 && Math.abs(e.clientY - last.y) <= 6;
      if (last.t && now - last.t <= 400 && near) {
        route(e.clientX, e.clientY);
        last.t = 0;
      } else {
        last.x = e.clientX;
        last.y = e.clientY;
        last.t = now;
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [code]);

  // Commit the state-diagram inline edit (title / state-or-composite label / note text / transition
  // label). Routes through handleCodeChange so it is a single Monaco undo step and re-renders.
  const commitStateTextEdit = useCallback(
    (value: string) => {
      if (!stateTextEdit) return;
      let newCode = code;
      if (stateTextEdit.kind === "title") {
        const trimmed = value.trim();
        newCode = trimmed ? upsertStateTitle(code, trimmed) : removeStateTitle(code);
      } else if (stateTextEdit.kind === "note") {
        newCode = updateStateNoteByIndex(code, stateTextEdit.noteIndex, value);
      } else if (stateTextEdit.kind === "edge") {
        newCode = setStateTransitionLabel(code, stateTextEdit.lineIndex ?? -1, value);
      } else {
        newCode = setStateLabel(code, stateTextEdit.id, value);
      }
      if (newCode !== code) handleCodeChange(newCode);
      setStateTextEdit(null);
    },
    [code, handleCodeChange, stateTextEdit],
  );

  // State-diagram node toolbar (single-click) delete handlers → route through handleCodeChange.
  const handleDeleteStateNode = useCallback(
    (id: string) => {
      const newCode = deleteStateById(code, id);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  const handleDeleteStateNote = useCallback(
    (noteIndex: number) => {
      const newCode = deleteStateNoteByIndex(code, noteIndex);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  // State-diagram node styling (Phase 4): write / clear a localized `style <id> …` override.
  const handleSetStateStyle = useCallback(
    (id: string, patch: Record<string, string>) => {
      const newCode = setStateStyle(code, id, patch);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  const handleResetStateStyle = useCallback(
    (id: string) => {
      const newCode = removeStateStyle(code, id);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  // Open the inline note editor over the note at `noteIndex` (source order) once Mermaid has
  // re-rendered the new/updated note into the DOM. Used to drop the user straight into editing
  // (text + Left/Right side toggle) right after a note is added. `g.statediagram-note` DOM order
  // matches source order, so `noteIndex` indexes the rendered notes directly; we poll a few frames
  // because the SVG re-render is async after a code change.
  const openStateNoteEditor = useCallback((noteCode: string, noteIndex: number) => {
    const note = getStateNotes(noteCode)[noteIndex];
    if (!note) return;
    let attempts = 0;
    const tryOpen = () => {
      const container = document.querySelector(".mermaid-container");
      const noteEls = container
        ? Array.from(container.querySelectorAll("g.statediagram-note"))
        : [];
      const el = noteEls[noteIndex];
      if (!el) {
        if (attempts++ < 30) requestAnimationFrame(tryOpen);
        return;
      }
      const r = el.getBoundingClientRect();
      setStateTextEdit({
        kind: "note",
        id: "",
        noteIndex,
        value: note.text,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      });
    };
    requestAnimationFrame(tryOpen);
  }, []);

  // State-diagram quick-annotation (Phase 4): attach a `note <side> of <id>` to the selected node
  // (side chosen in the toolbar's placement popover), then drop straight into the inline note editor
  // so the user can type the label (and still re-flip the side from there).
  const handleAddStateNote = useCallback(
    (id: string, position: "left" | "right" = "right") => {
      const newCode = addNoteForState(code, id, position);
      if (newCode !== code) {
        handleCodeChange(newCode);
        openStateNoteEditor(newCode, getStateNotes(newCode).length - 1);
      }
    },
    [code, handleCodeChange, openStateNoteEditor],
  );

  // State-diagram note flip (Phase 4): toggle a note between left / right.
  const handleFlipStateNote = useCallback(
    (noteIndex: number, position: "left" | "right") => {
      const newCode = setStateNotePosition(code, noteIndex, position);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  // State-diagram composite nesting (Phase 5): relocate a state into / between / out of composites.
  const handleMoveStateIntoComposite = useCallback(
    (id: string, target: string) => {
      const newCode = moveStateIntoComposite(code, id, target);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  const handleMoveStateToNewComposite = useCallback(
    (id: string) => {
      const newCode = moveStateToNewComposite(code, id);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  const handleMoveStateToRoot = useCallback(
    (id: string) => {
      const newCode = moveStateIntoComposite(code, id, null);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  const handleChangeStateShape = useCallback(
    (id: string, shape: StateNodeShapeKind) => {
      const newCode = setStateNodeShape(code, id, shape);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  // State-diagram concurrency divider (Phase 5): open a parallel region inside a composite.
  const handleAddStateConcurrencyDivider = useCallback(
    (compositeId: string) => {
      const newCode = addConcurrencyDivider(code, compositeId);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  // Open the inline label editor from the StateNodeToolbar's Rename pencil. Resolves the selected
  // element (state / composite / note) from its SVG id and positions the editor over it — the same
  // result as a double-click, just triggered from the toolbar.
  const handleRenameStateFromToolbar = useCallback(() => {
    if (!selectedSvgId) return;
    const container = document.querySelector(".mermaid-container");
    if (!container) return;
    const escId =
      typeof window !== "undefined" && window.CSS && CSS.escape
        ? CSS.escape(selectedSvgId)
        : selectedSvgId;
    const el = container.querySelector(`[id="${escId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    if (selectedSvgId.includes("----note-")) {
      const idx = Array.from(container.querySelectorAll("g.statediagram-note")).indexOf(el);
      const note = getStateNotes(code)[idx];
      if (note) setStateTextEdit({ kind: "note", id: "", noteIndex: idx, value: note.text, rect });
      return;
    }
    const id = stateNameFromSvgId(selectedSvgId);
    if (!id || isSpecialStateNode(code, id)) return;
    setStateTextEdit({
      kind: "state",
      id,
      noteIndex: -1,
      value: getStateLabel(code, id) || id,
      rect,
    });
  }, [selectedSvgId, code]);

  // ---- State-diagram transitions (edges) ----

  // Resolve the selected transition (`STATE_EDGE_edge<N>`) back to its parsed transition.
  const resolveSelectedStateEdge = useCallback(() => {
    if (!selectedNodeId?.startsWith("STATE_EDGE_")) return null;
    return stateTransitionFromEdgeDataId(code, selectedNodeId.replace("STATE_EDGE_", ""));
  }, [code, selectedNodeId]);

  // Delete the selected transition (the connected states are preserved).
  const handleDeleteStateTransition = useCallback(() => {
    const rel = resolveSelectedStateEdge();
    if (!rel) return;
    const newCode = deleteStateTransition(code, rel.lineIndex);
    if (newCode !== code) handleCodeChange(newCode);
    handleDeselect();
  }, [code, handleCodeChange, handleDeselect, resolveSelectedStateEdge]);

  // Drag-to-connect: create a transition `source --> target` between two states.
  const handleAddStateTransition = useCallback(
    (source: string, target: string) => {
      handleCodeChange(addTransition(code, source, target));
    },
    [code, handleCodeChange],
  );

  // Drag-to-connect onto EMPTY canvas: create the shape chosen in the drop-point menu and a
  // transition to it from `source` (a single undo step). For a NOTE the menu adds a
  // `note right of <source>`; drop the user straight into the inline note editor (text + side
  // toggle) so they can immediately label it and pick left/right.
  const handleCreateStateShapeLinked = useCallback(
    (source: string, kind: StateShapeKind) => {
      const newCode = addShapeWithTransition(code, source, kind).code;
      if (newCode === code) return;
      handleCodeChange(newCode);
      if (kind === "note") {
        openStateNoteEditor(newCode, getStateNotes(newCode).length - 1);
      }
    },
    [code, handleCodeChange, openStateNoteEditor],
  );

  // Close the ER property panel on a click that is neither the panel, an entity node, nor the
  // Monaco editor (the code editor is exempt so editing the `{ }` block keeps the panel open and the
  // grid live-updates). Blocked while the panel holds invalid attribute rows.
  useEffect(() => {
    if (!selectedEntityName) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest("[data-er-property-panel]")) return;
      if (t.closest(".monaco-editor")) return;
      const node = t.closest("g.node");
      if (node && /-entity-.+-\d+$/.test(node.id)) return;
      if (entityPanelHasErrorsRef.current) return;
      setSelectedEntityName(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [selectedEntityName]);

  const commitClassTextEdit = useCallback(
    (value: string) => {
      if (!classTextEdit) return;
      let newCode = code;
      if (classTextEdit.kind === "title") {
        const trimmed = value.trim();
        newCode = trimmed ? upsertClassTitle(code, trimmed) : removeClassTitle(code);
      } else if (classTextEdit.kind === "relationship" && classTextEdit.rel) {
        const { source, target, occurrence } = classTextEdit.rel;
        newCode = setClassRelationshipLabel(code, source, target, occurrence, value);
      } else if (classTextEdit.kind === "namespace" && classTextEdit.namespaceName) {
        newCode = renameNamespace(code, classTextEdit.namespaceName, value);
      } else {
        newCode = updateClassNoteByIndex(code, classTextEdit.noteIndex, value);
      }
      if (newCode !== code) handleCodeChange(newCode);
      setClassTextEdit(null);
    },
    [code, handleCodeChange, classTextEdit],
  );

  // Close the panel when the user clicks anything that is neither the panel itself, a class node,
  // nor the Monaco code editor (empty canvas, the toolbar, …). Capture phase so it runs before the
  // canvas interaction handlers. Clicking another class node is ignored here. The code editor is
  // exempt so editing the `class {}` block keeps the panel open and the grid live-updates from the
  // code (two-way binding).
  useEffect(() => {
    if (!selectedClassName) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest("[data-class-property-panel]")) return;
      if (t.closest(".monaco-editor")) return;
      const node = t.closest("g.node");
      if (node && /classId-/.test(node.id)) return;
      // Validation guard: while the property panel holds invalid attribute/method rows, an
      // outside click must NOT close it (mirrors the panel's own X-button guard).
      if (classPanelHasErrorsRef.current) return;
      setSelectedClassName(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [selectedClassName]);

  const selectedClass = useMemo(() => {
    if (!selectedClassName || determineDiagramType(code) !== "classDiagram") return null;
    return parseClassByName(code, selectedClassName);
  }, [selectedClassName, code]);

  const handleApplyClassEdits = useCallback(
    (edits: ClassEdits) => {
      if (!selectedClassName) return;
      const newCode = applyClassEdits(code, selectedClassName, edits);
      if (newCode !== code) handleCodeChange(newCode);
      const nextName = edits.newName?.trim();
      if (nextName && nextName !== selectedClassName) setSelectedClassName(nextName);
    },
    [code, handleCodeChange, selectedClassName, setSelectedClassName],
  );

  // Class-diagram connection drag (the purple +) commit handlers. Each routes through
  // handleCodeChange so the change is a single undo step and the canvas re-renders normally.
  const handleAddClassRelationship = useCallback(
    (source: string, target: string, operator: string) => {
      handleCodeChange(addClassRelationship(code, source, target, operator));
    },
    [code, handleCodeChange],
  );

  const handleCreateClassLinked = useCallback(
    (source: string, operator: string) => {
      handleCodeChange(addClassWithRelationship(code, source, getNextClassName(code), operator));
    },
    [code, handleCodeChange],
  );

  const handleCreateNoteForClass = useCallback(
    (source: string) => {
      handleCodeChange(appendClassNoteForClass(code, source, "This is a sample note"));
    },
    [code, handleCodeChange],
  );

  const handleLinkNoteToClass = useCallback(
    (noteIndex: number, className: string) => {
      const newCode = setClassNoteTarget(code, noteIndex, className);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  // Class-diagram relationship-edge toolbar commit handlers. The selected edge id is
  // `CLASS_EDGE_id_<Src>_<Dst>_<N>`; we resolve it back to the source relationship line via the
  // stable data-id, then mutate that line in place (single undo step through handleCodeChange).
  const handleUpdateClassRelationshipType = useCallback(
    (operator: string) => {
      if (!selectedNodeId?.startsWith("CLASS_EDGE_")) return;
      const rel = classRelationshipFromEdgeDataId(code, selectedNodeId.replace("CLASS_EDGE_", ""));
      if (!rel) return;
      const newCode = updateClassRelationshipOperator(
        code,
        rel.source,
        rel.target,
        rel.occurrence,
        operator,
      );
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleSetClassRelationshipCardinality = useCallback(
    (sourceCard: string, targetCard: string) => {
      if (!selectedNodeId?.startsWith("CLASS_EDGE_")) return;
      const rel = classRelationshipFromEdgeDataId(code, selectedNodeId.replace("CLASS_EDGE_", ""));
      if (!rel) return;
      const newCode = setClassRelationshipCardinality(
        code,
        rel.source,
        rel.target,
        rel.occurrence,
        sourceCard,
        targetCard,
      );
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleDeleteClassRelationship = useCallback(() => {
    if (!selectedNodeId?.startsWith("CLASS_EDGE_")) return;
    const rel = classRelationshipFromEdgeDataId(code, selectedNodeId.replace("CLASS_EDGE_", ""));
    if (!rel) return;
    const newCode = deleteClassRelationship(code, rel.source, rel.target, rel.occurrence);
    if (newCode !== code) handleCodeChange(newCode);
    handleDeselect();
  }, [code, handleCodeChange, selectedNodeId, handleDeselect]);

  // Class-diagram edge toolbar pencil: open the inline label editor for the selected relationship.
  // Positions the editor over the rendered relationship path (or a fallback viewport point).
  const handleEditClassEdgeLabel = useCallback(() => {
    if (!selectedNodeId?.startsWith("CLASS_EDGE_")) return;
    const dataId = selectedNodeId.replace("CLASS_EDGE_", "");
    const rel = classRelationshipFromEdgeDataId(code, dataId);
    if (!rel) return;
    const container = document.querySelector(".mermaid-container");
    const pathEl = container?.querySelector(`path.relation[data-id="${dataId}"]`) ?? null;
    const hitTarget =
      container?.querySelector(`path.class-relation-hit-target[data-id="${dataId}"]`) ?? null;
    const el = pathEl ?? hitTarget;
    let clientX: number, clientY: number;
    if (el) {
      const r = el.getBoundingClientRect();
      clientX = r.left + r.width / 2;
      clientY = r.top + r.height / 2;
    } else {
      clientX = window.innerWidth / 2;
      clientY = window.innerHeight / 2;
    }
    setSelectedClassName(null);
    setClassTextEdit({
      kind: "relationship",
      noteIndex: -1,
      value: rel.label,
      rect: { left: clientX - 60, top: clientY - 14, width: 120, height: 28 },
      rel: { source: rel.source, target: rel.target, occurrence: rel.occurrence },
    });
  }, [code, selectedNodeId, setSelectedClassName, setClassTextEdit]);

  // Class-diagram node toolbar (single-click) delete handlers → route through handleCodeChange.
  const handleDeleteClassNode = useCallback(
    (name: string) => {
      const newCode = deleteClassByName(code, name);
      if (newCode !== code) handleCodeChange(newCode);
      setSelectedClassName(null);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect, setSelectedClassName],
  );

  const handleDeleteClassNote = useCallback(
    (noteIndex: number) => {
      const newCode = deleteClassNoteByIndex(code, noteIndex);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  // Class-diagram node toolbar pencil: open the property panel for the selected class.
  const handleEditClassNodeFromToolbar = useCallback(
    (name: string) => {
      setSelectedClassName(name);
    },
    [setSelectedClassName],
  );

  // Namespace container toolbar: delete (unwrap, preserving inner classes) + relocate a class
  // into / out of / between namespaces. Each routes through handleCodeChange (single undo step).
  const handleDeleteClassNamespace = useCallback(
    (name: string) => {
      const newCode = deleteNamespace(code, name);
      if (newCode !== code) handleCodeChange(newCode);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect],
  );

  const handleMoveClassToNamespace = useCallback(
    (className: string, target: string) => {
      const newCode = moveClassToNamespace(code, className, target);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  const handleMoveClassToNewNamespace = useCallback(
    (className: string) => {
      const newCode = moveClassToNewNamespace(code, className);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  const handleRemoveClassFromNamespace = useCallback(
    (className: string) => {
      const newCode = moveClassToNamespace(code, className, null);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  /* ----------------------------- ER diagram wiring ---------------------------- */

  // The parsed entity backing the ER property panel (sticky double-click selection).
  const selectedEntity = useMemo(() => {
    if (!selectedEntityName || determineDiagramType(code) !== "erDiagram") return null;
    return parseEntityByName(code, selectedEntityName);
  }, [selectedEntityName, code]);

  // The single-clicked entity's current `style` properties — feeds the node toolbar's style popover
  // active states. Resolved from the selection's SVG id (single-click), which the property panel
  // selection (double-click) does not require.
  const currentEntityStyle = useMemo(() => {
    if (determineDiagramType(code) !== "erDiagram") return {};
    const name = entityNameFromSvgId(selectedSvgId);
    return name ? getEntityStyle(code, name) : {};
  }, [code, selectedSvgId]);

  const handleApplyEntityEdits = useCallback(
    (edits: EntityEdits) => {
      if (!selectedEntityName) return;
      const newCode = applyEntityEdits(code, selectedEntityName, edits);
      if (newCode !== code) handleCodeChange(newCode);
      const nextName = edits.newName?.trim();
      if (nextName && nextName !== selectedEntityName) setSelectedEntityName(nextName);
    },
    [code, handleCodeChange, selectedEntityName],
  );

  const handleDuplicateEntity = useCallback(
    (name: string) => {
      handleCodeChange(duplicateEntity(code, name));
    },
    [code, handleCodeChange],
  );

  const handleDeleteEntity = useCallback(
    (name: string) => {
      const newCode = deleteEntity(code, name);
      if (newCode !== code) handleCodeChange(newCode);
      if (selectedEntityName === name) setSelectedEntityName(null);
      handleDeselect();
    },
    [code, handleCodeChange, handleDeselect, selectedEntityName],
  );

  // ER-diagram node toolbar pencil: open the property panel for the selected entity.
  const handleEditEntityFromToolbar = useCallback(
    (name: string) => {
      setSelectedEntityName(name);
    },
    [setSelectedEntityName],
  );

  const handleSetEntityStyle = useCallback(
    (name: string, patch: Record<string, string>) => {
      const newCode = setEntityStyle(code, name, patch);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  const handleResetEntityStyle = useCallback(
    (name: string) => {
      const newCode = removeEntityStyle(code, name);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange],
  );

  const handleCloseEntityPanel = useCallback(() => {
    setSelectedEntityName(null);
  }, []);

  // Commit the inline ER title edit: an empty value removes the title (drops the frontmatter line),
  // otherwise it upserts `title:`. Routes through handleCodeChange so it is a single undo step.
  const commitErTitleEdit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      const newCode = trimmed ? upsertErTitle(code, trimmed) : removeErTitle(code);
      if (newCode !== code) handleCodeChange(newCode);
      setErTitleEdit(null);
    },
    [code, handleCodeChange],
  );

  /* ----------------------- ER relationship edge wiring ---------------------- */

  // Resolve the selected ER edge (`ER_EDGE_id_<src>_<dst>_<N>`) back to its parsed relationship.
  const resolveSelectedErEdge = useCallback(() => {
    if (!selectedNodeId?.startsWith("ER_EDGE_")) return null;
    return erRelationshipFromEdgeDataId(code, selectedNodeId.replace("ER_EDGE_", ""));
  }, [code, selectedNodeId]);

  // US2/US3 — rewrite the relationship operator (cardinality + line style) on the selected edge.
  const handleUpdateErRelationshipOperator = useCallback(
    (operator: string) => {
      const rel = resolveSelectedErEdge();
      if (!rel) return;
      const newCode = updateErRelationshipOperator(code, rel.lineIndex, operator);
      if (newCode !== code) handleCodeChange(newCode);
    },
    [code, handleCodeChange, resolveSelectedErEdge],
  );

  // US2 — delete the selected relationship edge (entities are preserved).
  const handleDeleteErRelationship = useCallback(() => {
    const rel = resolveSelectedErEdge();
    if (!rel) return;
    const newCode = deleteErRelationship(code, rel.lineIndex);
    if (newCode !== code) handleCodeChange(newCode);
    handleDeselect();
  }, [code, handleCodeChange, handleDeselect, resolveSelectedErEdge]);

  // US1 — create a relationship between two entities (drag-to-connect). Default operator `||--||`
  // with an empty quoted label (`ENTITY_A ||--|| ENTITY_B : ""`).
  const handleAddErRelationship = useCallback(
    (source: string, target: string) => {
      handleCodeChange(addErRelationship(code, source, target, "||--||", ""));
    },
    [code, handleCodeChange],
  );

  // US1 — drag-to-connect onto EMPTY canvas: create a new (auto-named) entity linked to the source
  // with the default operator. Single undo step.
  const handleCreateErEntityLinked = useCallback(
    (source: string) => {
      handleCodeChange(addEntityWithRelationship(code, source, "||--||", "").code);
    },
    [code, handleCodeChange],
  );

  // US4 — open the label editor from the edge toolbar pencil. Positions the editor over the
  // selected edge's label (or its path center) by resolving the edge's DOM via the stable data-id.
  const handleEditErEdgeLabel = useCallback(() => {
    const rel = resolveSelectedErEdge();
    if (!rel || !selectedNodeId) return;
    const dataId = selectedNodeId.replace("ER_EDGE_", "");
    const container = document.querySelector(".mermaid-container");
    // Prefer the rendered edge-label box; fall back to the relationship path's bounding box.
    const labelEl = Array.from(container?.querySelectorAll(".edgeLabel") ?? []).find(
      (el) => el.querySelector("[data-id]")?.getAttribute("data-id") === dataId,
    );
    const pathEl = container?.querySelector(`path.relationshipLine[data-id="${dataId}"]`) ?? null;
    let rect = (labelEl ?? pathEl)?.getBoundingClientRect() ?? null;
    if (rect && rect.width === 0 && rect.height === 0)
      rect = pathEl?.getBoundingClientRect() ?? rect;
    const r = rect ?? new DOMRect(0, 0, 0, 0);
    openErEdgeLabelEditor(rel.lineIndex, rel.label, r.left + r.width / 2, r.top + r.height / 2);
  }, [resolveSelectedErEdge, selectedNodeId, openErEdgeLabelEditor]);

  // US4 — live per-keystroke sync (debounced) so the code mirrors typing without re-rendering the
  // canvas on every keystroke (which would risk focus loss). The final value also commits on
  // Enter / blur via `commitErEdgeLabelEdit`.
  const erLabelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleErEdgeLabelLiveChange = useCallback(
    (value: string) => {
      if (!erEdgeLabelEdit) return;
      const lineIndex = erEdgeLabelEdit.lineIndex;
      if (erLabelDebounceRef.current) clearTimeout(erLabelDebounceRef.current);
      erLabelDebounceRef.current = setTimeout(() => {
        const newCode = setErRelationshipLabel(code, lineIndex, value);
        if (newCode !== code) handleCodeChange(newCode);
      }, 250);
    },
    [code, handleCodeChange, erEdgeLabelEdit],
  );

  const commitErEdgeLabelEdit = useCallback(
    (value: string) => {
      if (erLabelDebounceRef.current) clearTimeout(erLabelDebounceRef.current);
      if (erEdgeLabelEdit) {
        const newCode = setErRelationshipLabel(code, erEdgeLabelEdit.lineIndex, value);
        if (newCode !== code) handleCodeChange(newCode);
      }
      setErEdgeLabelEdit(null);
    },
    [code, handleCodeChange, erEdgeLabelEdit],
  );

  const toMermaidColorToken = useCallback((value: string | null | undefined): string | null => {
    if (!value) return null;
    const v = value.trim();
    if (!v || v === "none" || v === "transparent" || v === "rgba(0, 0, 0, 0)") return null;
    if (v.startsWith("#")) return v;

    const rgb = v.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)$/i);
    if (!rgb) return v;

    const r = Math.max(0, Math.min(255, Number(rgb[1])));
    const g = Math.max(0, Math.min(255, Number(rgb[2])));
    const b = Math.max(0, Math.min(255, Number(rgb[3])));
    const alpha = rgb[4] !== undefined ? Number(rgb[4]) : 1;
    if (!Number.isFinite(alpha) || alpha <= 0) return null;

    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }, []);

  const sanitizeMermaidStyleColors = useCallback(
    (input: string): string => {
      return input
        .split("\n")
        .map((line) => {
          if (!/^\s*style\s+\S+\s+/i.test(line) || !/rgba?\(/i.test(line)) {
            return line;
          }

          return line.replace(/rgba?\([^)]*\)/gi, (match) => {
            const token = toMermaidColorToken(match);
            return token ?? "transparent";
          });
        })
        .join("\n");
    },
    [toMermaidColorToken],
  );

  useEffect(() => {
    const sanitized = sanitizeMermaidStyleColors(code);
    if (sanitized !== code) {
      handleCodeChange(sanitized);
    }
  }, [code, handleCodeChange, sanitizeMermaidStyleColors]);

  const resolveSequenceDisplayName = useCallback(
    (actorId: string) => {
      const lines = code.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        const match = trimmed.match(
          /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i,
        );
        if (match && match[1] === actorId) {
          // Always return the ID (alias key), not the display name
          return match[1].trim();
        }
      }
      return actorId;
    },
    [code],
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

  const sequenceMessageEntries = useMemo(
    () => getSequenceMessageEntries(code),
    [code, getSequenceMessageEntries],
  );

  const getSelectedSequenceParticipantForNote = useCallback(() => {
    if (!selectedNodeId) return null;

    if (selectedNodeId.startsWith("SEQ_ACTOR_")) {
      const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
      return actorId;
    }

    if (selectedNodeId.startsWith("SEQ_MSG_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
      const msg = getSequenceMessageEntries(code)[idx]?.line?.trim();
      const actorMatch = msg?.match(
        /^(\S+)\s*(?:<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)\s*(\S+)\s*:/,
      );
      if (actorMatch?.[1]) {
        return actorMatch[1];
      }
      return null;
    }

    if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
      const noteEntry = getSequenceNoteEntries(code)[idx];
      return noteEntry?.participant || null;
    }

    return null;
  }, [code, getSequenceMessageEntries, getSequenceNoteEntries, selectedNodeId]);

  const handleAddSequenceNote = useCallback(
    (position: "left" | "right" | "over") => {
      if (!selectedNodeId) return;

      const participant = getSelectedSequenceParticipantForNote();
      if (!participant) return;

      let insertIndex = getSequenceMessageEntries(code).length;
      if (selectedNodeId.startsWith("SEQ_MSG_")) {
        const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
        if (Number.isFinite(idx) && idx >= 0) {
          insertIndex = idx;
        }
      }

      const updatedCode = insertSequenceNoteAtIndex(code, position, participant, insertIndex);
      handleCodeChange(updatedCode);
    },
    [
      code,
      getSelectedSequenceParticipantForNote,
      getSequenceMessageEntries,
      handleCodeChange,
      insertSequenceNoteAtIndex,
      selectedNodeId,
    ],
  );

  const currentSequenceNotePosition = useMemo<"left" | "right" | "over" | null>(() => {
    if (!selectedNodeId?.startsWith("SEQ_NOTE_")) return null;
    const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
    if (!Number.isFinite(idx) || idx < 0) return null;
    return getSequenceNoteEntries(code)[idx]?.position ?? null;
  }, [code, getSequenceNoteEntries, selectedNodeId]);

  const handleSequencePlusSelfLoop = useCallback(
    (actorId: string, anchorY: number) => {
      if (!actorId || !Number.isFinite(anchorY)) return;
      const insertIndex = getSequenceInsertIndexForAnchor(anchorY);
      const actorNodeId = `SEQ_ACTOR_${actorId}`;
      handleAddNodeFromSelected(actorNodeId, actorNodeId, undefined, insertIndex);
    },
    [getSequenceInsertIndexForAnchor, handleAddNodeFromSelected],
  );

  const handleSequencePlusNote = useCallback(
    (actorId: string, anchorY: number, position: "left" | "right" | "over") => {
      if (!actorId || !Number.isFinite(anchorY)) return;
      const participant = actorId;
      const insertIndex = getSequenceInsertIndexForAnchor(anchorY);
      const updatedCode = insertSequenceNoteAtIndex(code, position, participant, insertIndex);
      handleCodeChange(updatedCode);
    },
    [code, getSequenceInsertIndexForAnchor, handleCodeChange, insertSequenceNoteAtIndex],
  );

  // Insert a logic block fragment (loop/alt/opt/par/critical/break) or a `rect` highlight at the
  // chronological position indicated by `anchorY`. The block boilerplate is injected at the SOURCE
  // line of the message currently at that anchor (or appended after the last message when dropped
  // at the bottom), wrapping a placeholder message so the structure renders immediately. Mermaid
  // requires the first two participants for the placeholder; we resolve them from the live lifelines
  // (falling back to A/B) so the inserted code parses without error. Routes through handleCodeChange
  // (single undo).
  const handleSequencePlusBlock = useCallback(
    (anchorY: number, type: "loop" | "alt" | "opt" | "par" | "critical" | "break" | "rect") => {
      if (!Number.isFinite(anchorY)) return;
      const lifelines = getSequenceLifelines();
      const a = lifelines[0]?.actorId ?? "A";
      const b = lifelines[1]?.actorId ?? lifelines[0]?.actorId ?? "B";

      let body = "";
      if (type === "alt") {
        body = `    alt Condition\n        ${a}->>${b}: Message\n    else Alternative\n        ${a}->>${b}: Message\n    end`;
      } else if (type === "loop") {
        body = `    loop Loop\n        ${a}->>${b}: Message\n    end`;
      } else if (type === "opt") {
        body = `    opt Optional\n        ${a}->>${b}: Message\n    end`;
      } else if (type === "par") {
        body = `    par Action 1\n        ${a}->>${b}: Message 1\n    and Action 2\n        ${a}->>${b}: Message 2\n    end`;
      } else if (type === "critical") {
        body = `    critical Action\n        ${a}->>${b}: Message\n    option Failure\n        ${a}->>${b}: Message\n    end`;
      } else if (type === "break") {
        body = `    break Condition\n        ${a}->>${b}: Message\n    end`;
      } else {
        // rect highlight
        body = `    rect rgb(200, 220, 255)\n        ${a}->>${b}: Message\n    end`;
      }

      const lines = code.split("\n");
      const messageIndex = getSequenceInsertIndexForAnchor(anchorY);
      const entries = getSequenceMessageEntries(code);
      const insertAt = entries[messageIndex]?.index ?? lines.length;
      lines.splice(insertAt, 0, ...body.split("\n"));
      handleCodeChange(lines.join("\n"));
    },
    [
      code,
      getSequenceInsertIndexForAnchor,
      getSequenceMessageEntries,
      getSequenceLifelines,
      handleCodeChange,
    ],
  );

  const handleMoveSequenceNote = useCallback(
    (position: "left" | "right" | "over") => {
      if (!selectedNodeId?.startsWith("SEQ_NOTE_")) return;
      const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
      if (!Number.isFinite(idx) || idx < 0) return;
      const updatedCode = updateNotePosition(code, idx, position);
      if (updatedCode !== code) handleCodeChange(updatedCode);
    },
    [code, handleCodeChange, selectedNodeId, updateNotePosition],
  );

  const handleLinkSequenceNote = useCallback(() => {
    toast.info("Link/Connect for sequence notes is not available yet.");
  }, []);

  const handleResetStyle = useCallback(() => {
    if (!selectedNodeId) return;
    let newCode = code;

    // 1. Remove style lines
    const lines = newCode.split("\n");
    const filteredLines = lines.filter((line) => {
      const isStyleLine = line.match(new RegExp(`^\\s*style\\s+${selectedNodeId}\\b`));
      return !isStyleLine;
    });
    newCode = filteredLines.join("\n");

    // 2. Remove inline HTML formatting tags from label
    const nodeRegex = new RegExp(
      `(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
      "m",
    );
    const match = newCode.match(nodeRegex);
    if (match) {
      const originalLabel = match[3];
      const cleanLabel = originalLabel
        .replace(/<b[^>]*>/gi, "")
        .replace(/<\/b>/gi, "")
        .replace(/<i[^>]*>/gi, "")
        .replace(/<\/i>/gi, "")
        .replace(/<span[^>]*>/gi, "")
        .replace(/<\/span>/gi, "");

      const nodeRegexGlobal = new RegExp(nodeRegex.source, "gm");
      newCode = newCode.replace(nodeRegexGlobal, `$1$2${cleanLabel}$4`);
    }

    handleCodeChange(newCode);

    const nodeId = selectedNodeId;
    setSelectedNodeId(null);
    setTimeout(() => {
      setSelectedNodeId(nodeId);
    }, 50);
  }, [code, handleCodeChange, selectedNodeId, setSelectedNodeId]);

  const handleUpdateEdgeStyle = useCallback(
    (updates: { stroke?: string; arrowType?: string; label?: string }) => {
      if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
      const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
      if (!src || !dst) return;
      const updatedCode = updateLinkStyleAndLabel(code, src, dst, updates, occurrenceIndex);
      const healedCode = rebuildLinkStyles(code, updatedCode);
      handleCodeChange(healedCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleUpdateEdgeColor = useCallback(
    (hexColor: string) => {
      if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
      const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
      if (!src || !dst) return;
      const linkIndex = getLinkIndex(code, src, dst, occurrenceIndex);
      const updatedCode = updateLinkColor(code, linkIndex, hexColor);
      handleCodeChange(updatedCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleUpdateEdgeCurve = useCallback(
    (curve: string) => {
      const updatedCode = updateMermaidCurve(code, curve);
      handleCodeChange(updatedCode);
    },
    [code, handleCodeChange],
  );

  const handleUpdateEdgeAnimation = useCallback(
    (animate: boolean) => {
      if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
      const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
      if (!src || !dst) return;
      const updatedCode = updateLinkAnimation(code, src, dst, occurrenceIndex, animate);
      handleCodeChange(updatedCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleDeleteEdge = useCallback(() => {
    if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
    const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
    if (!src || !dst) return;
    const updatedCode = deleteLink(code, src, dst, occurrenceIndex);
    const healedCode = rebuildLinkStyles(code, updatedCode);
    handleCodeChange(healedCode);
    handleDeselect();
  }, [code, handleCodeChange, selectedNodeId, handleDeselect]);

  const editorRef = useRef<MonacoCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Epic 4.1 — Canvas-to-code highlighting. Resolve the 0-indexed source line
  // range that defines the currently selected canvas element so the code panel
  // can highlight + scroll to it. Returns null when nothing is selected (which
  // clears the decoration) or when no confident mapping exists. Read-only
  // parsing, so it is safe in demo mode too (AC 4.1.3).
  const highlightRange = useMemo<{ startLine: number; endLine: number } | null>(() => {
    const toRange = (line: number) => (line >= 0 ? { startLine: line, endLine: line } : null);

    // Class diagram: highlight the source line of the selected element.
    //  - relationship edge (`CLASS_EDGE_…`) → its relationship line.
    //  - class node → its `class X` definition line. Single-click sets `selectedSvgId`
    //    (`…classId-<Name>-<n>`); double-click also sets the sticky `selectedClassName`. Resolve
    //    from EITHER so the highlight works on single-click too.
    //  - note → its `note "…"` / `note for X "…"` line (resolved from a `…-note<N>` svg id).
    if (selectedNodeId?.startsWith("CLASS_EDGE_")) {
      const rel = classRelationshipFromEdgeDataId(code, selectedNodeId.replace("CLASS_EDGE_", ""));
      return rel ? toRange(rel.lineIndex) : null;
    }
    // ER relationship edge → its source line.
    if (selectedNodeId?.startsWith("ER_EDGE_")) {
      const rel = erRelationshipFromEdgeDataId(code, selectedNodeId.replace("ER_EDGE_", ""));
      return rel ? toRange(rel.lineIndex) : null;
    }
    if (determineDiagramType(code) === "classDiagram" && selectedSvgId) {
      const noteMatch = selectedSvgId.match(/-note(\d+)$/);
      if (noteMatch) {
        const note = getClassNotes(code)[parseInt(noteMatch[1], 10)];
        return note ? toRange(note.lineIndex) : null;
      }
      const className = classNameFromSvgId(selectedSvgId);
      if (className) return toRange(findClassDefinitionLine(code, className));
      // Namespace container → its `namespace Name {` declaration line.
      if (selectedNodeId && getNamespaceNames(code).includes(selectedNodeId)) {
        return toRange(findNamespaceDefinitionLine(code, selectedNodeId));
      }
    }
    if (selectedClassName) {
      return toRange(findClassDefinitionLine(code, selectedClassName));
    }

    // ER diagram: highlight the selected entity's definition line. Single-click sets `selectedSvgId`
    // (`…-entity-<Name>-<idx>`); double-click also sets the sticky `selectedEntityName`.
    if (determineDiagramType(code) === "erDiagram" && selectedSvgId) {
      const entityName = entityNameFromSvgId(selectedSvgId);
      if (entityName) return toRange(findEntityDefinitionLine(code, entityName));
    }
    if (selectedEntityName) {
      return toRange(findEntityDefinitionLine(code, selectedEntityName));
    }

    // State diagram: highlight the selected state's definition line. Single-click sets
    // `selectedSvgId` (`…-state-<Name>-<idx>`); the note/edge cases are handled below / in Phase 3.
    if (determineDiagramType(code) === "stateDiagram" && selectedSvgId) {
      const noteM = selectedSvgId.match(/----note-(\d+)$/);
      if (noteM) {
        const note = getStateNotes(code)[parseInt(noteM[1], 10)];
        return note ? toRange(note.lineIndex) : null;
      }
      const stateId = stateNameFromSvgId(selectedSvgId);
      if (stateId) return toRange(findStateDefinitionLine(code, stateId));
    }

    if (!selectedNodeId) return null;

    if (selectedNodeId.startsWith("SEQ_MSG_")) {
      const idx = parseInt(selectedNodeId.slice("SEQ_MSG_".length), 10);
      const entry = getSequenceMessageEntries(code)[idx];
      return entry ? toRange(entry.index) : null;
    }

    if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const idx = parseInt(selectedNodeId.slice("SEQ_NOTE_".length), 10);
      const entry = getSequenceNoteEntries(code)[idx];
      return entry ? toRange(entry.index) : null;
    }

    if (selectedNodeId.startsWith("SEQ_ACTOR_")) {
      const actorId = selectedNodeId.slice("SEQ_ACTOR_".length);
      const declLine = findSequenceParticipantLine(code, actorId);
      if (declLine >= 0) return toRange(declLine);
      // Implicit participant (never declared): fall back to the first message
      // line that references it.
      const esc = actorId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tokenRe = new RegExp(`(^|[^A-Za-z0-9_-])${esc}([^A-Za-z0-9_-]|$)`);
      const msg = getSequenceMessageEntries(code).find((e) => tokenRe.test(e.line));
      return msg ? toRange(msg.index) : null;
    }

    if (isEdgeId(selectedNodeId)) {
      const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
      return toRange(findFlowchartEdgeLine(code, src, dst, occurrenceIndex));
    }

    // Flowchart node (plain id).
    return toRange(findFlowchartNodeLine(code, selectedNodeId));
  }, [
    selectedNodeId,
    selectedClassName,
    selectedSvgId,
    selectedEntityName,
    code,
    getSequenceMessageEntries,
    getSequenceNoteEntries,
    getSequenceBlockEntries,
  ]);

  const handleThemeChange = (theme: string) => {
    const validThemes = new Set(["default", "forest", "dark", "neutral", "base", "redux"]);
    const safeTheme = validThemes.has(theme) ? theme : "default";
    const updatedCode = updateMermaidConfigProperty(code, "theme", safeTheme);
    handleCodeChange(updatedCode);
  };

  const defaultHistoryLabel = useCallback((version: VersionHistoryEntry, index: number) => {
    if (version.label?.trim()) return version.label.trim();
    const d = new Date(version.timestamp);
    const h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `Snapshot ${index + 1} - ${h}:${m} ${ampm}`;
  }, []);

  const sortedComments = useMemo(
    () =>
      [...((doc?.comments ?? []) as DiagramComment[])].sort(
        (a, b) =>
          Number(Boolean(a.resolved)) - Number(Boolean(b.resolved)) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [doc?.comments],
  );
  const openComments = useMemo(
    () => sortedComments.filter((comment) => !comment.resolved),
    [sortedComments],
  );
  const resolvedComments = useMemo(
    () => sortedComments.filter((comment) => comment.resolved),
    [sortedComments],
  );
  const commentSortStorageKey = useMemo(() => `livemaid:comment-sort:${documentId}`, [documentId]);

  const replaceCommentInDoc = useCallback(
    (commentId: string, updatedComment: DiagramComment) => {
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              comments: (prev.comments ?? []).map((comment) =>
                comment.id === commentId ? updatedComment : comment,
              ),
            }
          : prev,
      );
    },
    [setDoc],
  );

  const refreshCommentDraft = useCallback((commentId: string, value: string) => {
    setCommentReplyDrafts((current) => ({ ...current, [commentId]: value }));
  }, []);

  const createCommentThread = useCallback(
    async (composer: NonNullable<typeof commentComposer>, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const tempCommentId = `temp-comment-${nanoid()}`;
      const tempMessageId = `temp-message-${nanoid()}`;
      const now = new Date().toISOString();
      const tempComment: DiagramComment = {
        id: tempCommentId,
        anchor: composer.anchor,
        messages: [
          {
            id: tempMessageId,
            content: trimmed,
            authorId: "anonymous",
            timestamp: now,
          },
        ],
        resolved: false,
        starred: false,
        createdAt: now,
        updatedAt: now,
      };
      const previousActiveCommentId = activeCommentId;
      setDoc((prev) =>
        prev ? { ...prev, comments: [...(prev.comments ?? []), tempComment] } : prev,
      );
      setCommentDraft("");
      setCommentComposer(null);
      setActiveCommentId(tempCommentId);
      try {
        const response = await fetch(`/api/diagrams/${documentId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            authorId: "anonymous",
            anchor: composer.anchor,
          }),
        });
        if (!response.ok) throw new Error("Failed to create comment");
        const created = (await response.json()) as DiagramComment;
        if (!created) throw new Error("Failed to create comment");
        replaceCommentInDoc(tempCommentId, created);
        setActiveCommentId(created.id);
        toast.success("Comment added", {
          action: {
            label: "Open comments",
            onClick: () => setIsCommentsOpen(true),
          },
        });
      } catch {
        setDoc((prev) =>
          prev
            ? {
                ...prev,
                comments: (prev.comments ?? []).filter((comment) => comment.id !== tempCommentId),
              }
            : prev,
        );
        setCommentComposer(composer);
        setCommentDraft(trimmed);
        setActiveCommentId((current) =>
          current === tempCommentId ? previousActiveCommentId : current,
        );
        toast.error("Failed to add comment");
      }
    },
    [activeCommentId, documentId, replaceCommentInDoc, setDoc],
  );

  const submitCommentComposer = useCallback(
    (content?: string) => {
      if (!commentComposer) return;
      void createCommentThread(commentComposer, content ?? commentDraft);
    },
    [commentComposer, commentDraft, createCommentThread],
  );

  const openSelectionCommentComposer = useCallback(() => {
    if (!selectedNodeId || !selectionBox) return;
    const sequenceMessageIndex = selectedNodeId.startsWith("SEQ_MSG_")
      ? parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10)
      : null;
    const sequenceGeometry =
      Number.isFinite(sequenceMessageIndex ?? Number.NaN) && sequenceMessageIndex !== null
        ? getSequenceMessageEndpointGeometry(sequenceMessageIndex)
        : null;
    const fallbackPos =
      sequenceGeometry &&
      Number.isFinite(sequenceGeometry.source.x) &&
      Number.isFinite(sequenceGeometry.target.x)
        ? {
            x: Math.max(sequenceGeometry.source.x, sequenceGeometry.target.x) + 16,
            y: (sequenceGeometry.source.y + sequenceGeometry.target.y) / 2,
          }
        : {
            x: selectionBox.x + selectionBox.width / 2,
            y: selectionBox.y + selectionBox.height / 2,
          };
    const anchor: DiagramCommentAnchor = {
      type: "shape",
      shapeId: selectedNodeId,
      fallbackPos,
    };

    if (sequenceMessageIndex !== null && Number.isFinite(sequenceMessageIndex)) {
      const messageEntries = getSequenceMessageEntries(code);
      const sequenceMessage = buildSequenceMessageAnchor(messageEntries, sequenceMessageIndex);
      if (sequenceMessage) {
        anchor.sequenceMessage = sequenceMessage;
      }
    }

    setCommentComposer({
      anchor,
      position: {
        x: sequenceGeometry
          ? Math.max(sequenceGeometry.source.x, sequenceGeometry.target.x) + 28
          : selectionBox.x + selectionBox.width + 12,
        y: sequenceGeometry ? Math.max(12, fallbackPos.y - 12) : Math.max(12, selectionBox.y - 12),
      },
      targetLabel: `Anchored to ${selectedNodeId}`,
      commentMode: "shape",
    });
    setCommentDraft("");
    setIsCommentMode(false);
    setActiveCommentId(null);
  }, [
    code,
    getSequenceMessageEntries,
    getSequenceMessageEndpointGeometry,
    selectedNodeId,
    selectionBox,
  ]);

  const appendCommentReply = useCallback(
    async (commentId: string) => {
      const content = (commentReplyDrafts[commentId] ?? "").trim();
      if (!content) return;
      const originalComment = doc?.comments.find((comment) => comment.id === commentId);
      if (!originalComment) return;
      const tempMessageId = `temp-message-${nanoid()}`;
      const now = new Date().toISOString();
      const optimisticComment: DiagramComment = {
        ...originalComment,
        messages: [
          ...originalComment.messages,
          {
            id: tempMessageId,
            content,
            authorId: "anonymous",
            timestamp: now,
          },
        ],
        updatedAt: now,
      };
      const previousDraft = commentReplyDrafts[commentId];
      replaceCommentInDoc(commentId, optimisticComment);
      setCommentReplyDrafts((current) => ({ ...current, [commentId]: "" }));
      try {
        const response = await fetch(`/api/diagrams/${documentId}/comments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentId,
            content,
            authorId: "anonymous",
          }),
        });
        if (!response.ok) throw new Error("Failed to update comment");
        const updated = (await response.json()) as DiagramComment | null;
        if (!updated) throw new Error("Failed to update comment");
        replaceCommentInDoc(commentId, updated);
        toast.success("Reply added");
      } catch {
        replaceCommentInDoc(commentId, originalComment);
        setCommentReplyDrafts((current) => ({ ...current, [commentId]: previousDraft }));
        toast.error("Failed to add reply");
      }
    },
    [commentReplyDrafts, doc?.comments, documentId, replaceCommentInDoc],
  );

  const toggleCommentResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      try {
        const response = await fetch(`/api/diagrams/${documentId}/comments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId, resolved }),
        });
        if (!response.ok) throw new Error("Failed to update comment");
        const updated = (await response.json()) as DiagramComment | null;
        if (updated) {
          replaceCommentInDoc(commentId, updated);
        }
      } catch {
        toast.error("Failed to update comment");
      }
    },
    [documentId, replaceCommentInDoc],
  );

  const toggleCommentStar = useCallback(
    async (commentId: string, starred: boolean) => {
      try {
        const response = await fetch(`/api/diagrams/${documentId}/comments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId, starred }),
        });
        if (!response.ok) throw new Error("Failed to update comment");
        const updated = (await response.json()) as DiagramComment | null;
        if (updated) {
          replaceCommentInDoc(commentId, updated);
        }
      } catch {
        toast.error("Failed to update comment");
      }
    },
    [documentId, replaceCommentInDoc],
  );

  const activateCommentThread = useCallback((commentId: string | null) => {
    setActiveCommentId(commentId);
    setCommentComposer(null);
    if (commentId) {
      setActiveCommentFocusToken((token) => token + 1);
    }
  }, []);

  const persistHistoryEntries = useCallback(
    async (updatedHistory: VersionHistoryEntry[]) => {
      if (!doc) return;

      try {
        const response = await fetch(`/api/diagrams/${documentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionHistory: updatedHistory }),
        });

        if (!response.ok) {
          throw new Error("Failed to update version history");
        }

        const updatedDoc = await response.json();
        setDoc(updatedDoc);
        setHistoryDrafts(
          Object.fromEntries(
            (updatedDoc.versionHistory ?? []).map((version: VersionHistoryEntry, index: number) => [
              version.id,
              defaultHistoryLabel(version, index),
            ]),
          ),
        );
      } catch (error) {
        toast.error("Failed to update version history");
      }
    },
    [defaultHistoryLabel, doc, documentId, setDoc],
  );

  const handleRollbackToVersion = useCallback(
    (versionCode: string) => {
      setIsHistoryOpen(false);
      setPreviewVersionId(null);
      handleCodeChange(versionCode);
      toast.success("Rolled back successfully", {
        description: "The diagram has been restored to the selected version.",
      });
    },
    [handleCodeChange],
  );

  useEffect(() => {
    const previewVersion = (doc?.versionHistory ?? []).find(
      (version) => version.id === previewVersionId,
    );
    if (!isHistoryOpen || !previewVersion) {
      setPreviewSvgContent("");
      setPreviewParseError(null);
      return;
    }

    let cancelled = false;

    const renderPreview = async () => {
      try {
        setPreviewParseError(null);
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          flowchart: { htmlLabels: true },
        });
        await mermaid.parse(previewVersion.code, { suppressErrors: true });
        const { svg } = await mermaid.render(`history-preview-${Date.now()}`, previewVersion.code);
        if (!cancelled) {
          setPreviewSvgContent(svg);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewSvgContent("");
          setPreviewParseError(
            error instanceof Error ? error.message : "Failed to render preview diagram",
          );
        }
      }
    };

    void renderPreview();

    return () => {
      cancelled = true;
    };
  }, [doc?.versionHistory, isHistoryOpen, previewVersionId]);

  const handleRenameHistoryEntry = useCallback(
    (versionId: string, label: string) => {
      if (!doc) return;

      const trimmedLabel = label.trim();
      const updatedHistory = (doc.versionHistory ?? []).map((version) =>
        version.id === versionId ? { ...version, label: trimmedLabel || undefined } : version,
      );

      setHistoryDrafts((current) => ({
        ...current,
        [versionId]: trimmedLabel || current[versionId] || "",
      }));
      void persistHistoryEntries(updatedHistory);
    },
    [doc, persistHistoryEntries],
  );

  const handleToggleHistoryStar = useCallback(
    (versionId: string) => {
      if (!doc) return;

      const updatedHistory = (doc.versionHistory ?? []).map((version) =>
        version.id === versionId ? { ...version, starred: !version.starred } : version,
      );

      void persistHistoryEntries(updatedHistory);
    },
    [doc, persistHistoryEntries],
  );

  const handleFontChange = (font: (typeof FONT_OPTIONS)[0]) => {
    // Optimistically update selection highlight in the dropdown before Mermaid re-render finishes.
    setCurrentFont(font.label);
    const updatedCode = updateMermaidFontFamily(code, font.value);
    handleCodeChange(updatedCode);
  };

  const activeFontLabel = useMemo(() => {
    if (currentFont && currentFont !== "Default") return currentFont;

    const fontLineMatch = code.match(/fontFamily:\s*([^\n\r]+)/);
    if (!fontLineMatch) return "Default";

    let fontVal = fontLineMatch[1].trim();
    if (
      (fontVal.startsWith("'") && fontVal.endsWith("'")) ||
      (fontVal.startsWith('"') && fontVal.endsWith('"'))
    ) {
      fontVal = fontVal.slice(1, -1);
    }
    const normalizedFont = fontVal.replace(/["']/g, "").toLowerCase();

    const found = FONT_OPTIONS.find((f) => {
      const optionPrimary = f.value.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
      return normalizedFont.includes(optionPrimary);
    });

    return found?.label || "Default";
  }, [code, currentFont]);

  const handleUpdateStyle = useCallback(
    (property: string, value: string) => {
      if (!selectedNodeId) return;
      let newCode = code;
      const styleRegex = new RegExp(`^\\s*style\\s+${selectedNodeId}\\s+(.*?)$`, "m");
      const match = newCode.match(styleRegex);
      if (match) {
        let styleProps = match[1];
        const propRegex = new RegExp(`${property}:[^,]+`);
        if (propRegex.test(styleProps)) {
          styleProps = styleProps.replace(propRegex, `${property}:${value}`);
        } else {
          styleProps += `,${property}:${value}`;
        }
        newCode = newCode.replace(styleRegex, `style ${selectedNodeId} ${styleProps}`);
      } else {
        newCode += `\n    style ${selectedNodeId} ${property}:${value}`;
      }
      handleCodeChange(newCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleGlobalBoldItalic = useCallback(
    (format: "bold" | "italic") => {
      if (!selectedNodeId) return;

      const toggleGlobalStyle = (text: string, style: "bold" | "italic") => {
        let isBold = false;
        let isItalic = false;

        let temp = text.trim();
        let peeled = true;
        while (peeled) {
          peeled = false;
          if (temp.startsWith("<b>") && temp.endsWith("</b>")) {
            isBold = true;
            temp = temp.substring(3, temp.length - 4).trim();
            peeled = true;
          } else if (temp.startsWith("<i>") && temp.endsWith("</i>")) {
            isItalic = true;
            temp = temp.substring(3, temp.length - 4).trim();
            peeled = true;
          }
        }

        const cleanInner = temp
          .replace(/<\/?b>/gi, "")
          .replace(/<\/?i>/gi, "")
          .replace(/<span[^>]*>/gi, "")
          .replace(/<\/span>/gi, "");

        if (style === "bold") {
          isBold = !isBold;
        } else if (style === "italic") {
          isItalic = !isItalic;
        }

        let result = cleanInner;
        if (isItalic) {
          result = `<i>${result}</i>`;
        }
        if (isBold) {
          result = `<b>${result}</b>`;
        }
        return result;
      };

      if (isEdgeId(selectedNodeId)) {
        const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
        if (!src || !dst) return;
        const lines = code.split("\n");
        let currentOccurrence = 0;
        let currentLabel = "";
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
              currentLabel = getLinkLabelFromMiddle(match[2]);
              break;
            }
            currentOccurrence++;
          }
        }
        const newLabel = toggleGlobalStyle(currentLabel, format);
        handleUpdateEdgeStyle({ label: newLabel });
      } else {
        const nodeRegex = new RegExp(
          `(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\/|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
          "m",
        );
        const match = code.match(nodeRegex);
        let currentLabel = "";
        if (match) {
          currentLabel = match[3];
        } else {
          currentLabel = selectedNodeId;
        }
        const newLabel = toggleGlobalStyle(currentLabel, format);
        let newCode = code;
        if (match) {
          const nodeRegexGlobal = new RegExp(nodeRegex.source, "gm");
          newCode = newCode.replace(nodeRegexGlobal, `$1$2${newLabel}$4`);
        } else {
          newCode += `\n    ${selectedNodeId}["${newLabel}"]`;
        }
        handleCodeChange(newCode);
      }
    },
    [code, selectedNodeId, handleCodeChange, handleUpdateEdgeStyle],
  );

  const handleFormatNodeLabel = useCallback(
    (format: string, colorValue?: string) => {
      if (!selectedNodeId) return;
      const getStyleVal = (property: string): string | null => {
        const match = code.match(new RegExp(`^\\s*style\\s+${selectedNodeId}\\s+(.*?)$`, "m"));
        if (match) {
          const propMatch = match[1].match(new RegExp(`${property}:\\s*([^,;\\s]+)`));
          return propMatch ? propMatch[1] : null;
        }
        return null;
      };

      if (format === "bold") {
        handleGlobalBoldItalic("bold");
        if (getStyleVal("font-weight")) {
          handleUpdateStyle("font-weight", "normal");
        }
      } else if (format === "italic") {
        handleGlobalBoldItalic("italic");
        if (getStyleVal("font-style")) {
          handleUpdateStyle("font-style", "normal");
        }
      } else if (format === "color" && colorValue) {
        handleUpdateStyle("color", colorValue);
      }
    },
    [code, selectedNodeId, selectedSvgId, handleUpdateStyle, handleGlobalBoldItalic],
  );

  const handleFormatText = (format: string, colorValue?: string) => {
    console.log("[handleFormatText] format:", format, "colorValue:", colorValue);
    if (!inlineInputRef.current) {
      console.log("[handleFormatText] inlineInputRef.current is null/undefined");
      return;
    }

    let start = inlineInputRef.current.selectionStart;
    let end = inlineInputRef.current.selectionEnd;

    const augmentedInput = inlineInputRef.current as HTMLTextAreaElement & {
      _lastSelectionStart?: number;
      _lastSelectionEnd?: number;
    };
    if (start === end && typeof augmentedInput._lastSelectionStart === "number") {
      const lastStart = augmentedInput._lastSelectionStart;
      const lastEnd = augmentedInput._lastSelectionEnd ?? lastStart;
      if (lastStart !== lastEnd) {
        start = lastStart;
        end = lastEnd;
      }
    }

    let selectedText = editingText.substring(start, end);
    console.log(
      "[handleFormatText] start:",
      start,
      "end:",
      end,
      "selectedText:",
      selectedText,
      "editingText:",
      editingText,
    );

    const isSelectionEmpty = !selectedText;
    if (isSelectionEmpty) {
      start = 0;
      end = editingText.length;
      selectedText = editingText;
    }

    let before = "";
    let after = "";

    if (format === "bold") {
      before = "<b>";
      after = "</b>";
    } else if (format === "italic") {
      before = "<i>";
      after = "</i>";
    } else if (format === "color" && colorValue) {
      before = `<span style='color:${colorValue}'>`;
      after = "</span>";
    }

    const newText =
      editingText.substring(0, start) + before + selectedText + after + editingText.substring(end);
    console.log("[handleFormatText] setting editingText to:", newText);
    setEditingText(newText);

    setTimeout(() => {
      if (inlineInputRef.current) {
        inlineInputRef.current.focus();
        inlineInputRef.current.setSelectionRange(
          start,
          start + before.length + selectedText.length + after.length,
        );
      }
    }, 10);
  };

  const handleEditSubmit = () => {
    if (!selectedNodeId || !isInlineEditing) {
      setIsInlineEditing(false);
      return;
    }

    let newCode = code;

    const isMessageLine = (line: string) => {
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
      if (keywords.some((kw) => trimmed.startsWith(kw) || trimmed.startsWith(kw + " ")))
        return false;
      return trimmed.includes(":");
    };

    const isNoteLine = (line: string) => {
      const trimmed = line.trim();
      return trimmed.startsWith("Note ") || trimmed.startsWith("note ");
    };

    const getCodeLineMappings = (lines: string[]) => {
      let msgCount = 0;
      let noteCount = 0;
      let inFrontmatter = false;

      return lines
        .map((line, lineIndex) => {
          const trimmed = line.trim();

          // Skip frontmatter sections (--- ... ---)
          if (trimmed === "---") {
            inFrontmatter = !inFrontmatter;
            return null;
          }
          if (inFrontmatter) return null;

          if (isMessageLine(line)) {
            return { type: "msg", index: msgCount++, lineIndex };
          } else if (isNoteLine(line)) {
            return { type: "note", index: noteCount++, lineIndex };
          }
          return null;
        })
        .filter((m) => m !== null) as { type: string; index: number; lineIndex: number }[];
    };

    if (selectedNodeId.startsWith("SEQ_ACTOR_")) {
      const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
      const newText = editingText.replace(/\n/g, "<br/>");

      let found = false;
      const lines = code.split("\n");
      newCode = lines
        .map((line) => {
          const trimmed = line.trim();
          // Match all participant declaration types including special @{} syntax
          // e.g. "participant P843@{ "type": "database" } as New Database"
          // e.g. "participant Alice as Alice"
          // e.g. "actor Bob"
          const declMatch =
            trimmed.match(
              /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s*@\{[^}]*\})?\s+as\s+(.+)$/i,
            ) ||
            trimmed.match(
              /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s*@\{[^}]*\})?$/i,
            );
          if (declMatch) {
            const id = declMatch[2];
            const alias = declMatch[3];

            if (id === actorId) {
              found = true;
              if (alias !== undefined) {
                // Replace "as [old alias]" at end of line
                const asIdx = line.lastIndexOf(` as `);
                if (asIdx !== -1) {
                  return line.substring(0, asIdx) + ` as ${newText}`;
                }
              } else {
                // No alias yet — append "as [newText]"
                return line.trimEnd() + ` as ${newText}`;
              }
            }
          }
          return line;
        })
        .join("\n");

      if (!found) {
        // Only insert a new declaration if we truly couldn't find this actor at all
        const headerIdx = lines.findIndex((l) => l.trim().startsWith("sequenceDiagram"));
        const declLine = `    participant ${actorId} as ${newText}`;
        if (headerIdx !== -1) {
          lines.splice(headerIdx + 1, 0, declLine);
        } else {
          lines.unshift("sequenceDiagram", declLine);
        }
        newCode = lines.join("\n");
      }
    } else if (selectedNodeId.startsWith("SEQ_MSG_")) {
      const parts = selectedNodeId.split("_");
      const targetIndex = parseInt(parts[2], 10);
      const newText = editingText.replace(/\n/g, "<br/>");
      const lines = code.split("\n");

      const mappings = getCodeLineMappings(lines);
      const targetMapping = mappings.find((m) => m.type === "msg" && m.index === targetIndex);
      if (targetMapping) {
        const lineIdx = targetMapping.lineIndex;
        const line = lines[lineIdx];
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          lines[lineIdx] = line.substring(0, colonIdx + 1) + " " + newText;
          newCode = lines.join("\n");
        }
      }
    } else if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const parts = selectedNodeId.split("_");
      const targetIndex = parseInt(parts[2], 10);
      const newText = editingText.replace(/\n/g, "<br/>");
      const lines = code.split("\n");

      const mappings = getCodeLineMappings(lines);
      const targetMapping = mappings.find((m) => m.type === "note" && m.index === targetIndex);
      if (targetMapping) {
        const lineIdx = targetMapping.lineIndex;
        const line = lines[lineIdx];
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          lines[lineIdx] = line.substring(0, colonIdx + 1) + " " + newText;
          newCode = lines.join("\n");
        }
      }
    } else if (selectedNodeId.startsWith("SEQ_BLK_")) {
      // Rename a logic-block / section label (loop/alt/opt/par/critical/break opener, or an
      // else/and/option divider). The node id carries the absolute source line index. Only the
      // label portion after the keyword is rewritten; the keyword + indentation are preserved.
      // An empty new label collapses to just the keyword (valid Mermaid, e.g. bare `loop`).
      const lineIdx = parseInt(selectedNodeId.replace("SEQ_BLK_", ""), 10);
      const newText = editingText.replace(/\n/g, " ").trim();
      const lines = code.split("\n");
      const line = lines[lineIdx];
      if (line != null) {
        const m = line.match(
          /^(\s*)(loop|alt|opt|par|critical|break|else|and|option)\b[ \t]*(.*)$/i,
        );
        if (m) {
          lines[lineIdx] = newText ? `${m[1]}${m[2]} ${newText}` : `${m[1]}${m[2]}`;
          newCode = lines.join("\n");
        }
      }
    } else if (selectedNodeId.startsWith("SEQ_")) {
      const oldText = selectedNodeId.replace("SEQ_", "");
      const newText = editingText.replace(/\n/g, "<br/>");
      newCode = newCode
        .split("\n")
        .map((line) => {
          if (line.includes(oldText)) {
            return line.replace(oldText, newText);
          }
          return line;
        })
        .join("\n");
    } else if (isEdgeId(selectedNodeId)) {
      const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
      if (src && dst) {
        newCode = updateLinkStyleAndLabel(
          newCode,
          src,
          dst,
          { label: editingText },
          occurrenceIndex,
        );
      }
    } else {
      // Flowchart cluster/subgraph title rename path.
      // When a cluster is selected, selectedNodeId can be a normalized label-like id,
      // so generic node regex replacement may fail and incorrectly append a new node.
      let handledClusterRename = false;
      if (selectedSvgId && containerRef.current) {
        const selectedEl = containerRef.current.querySelector(
          `#${CSS.escape(selectedSvgId)}`,
        ) as SVGElement | null;
        if (selectedEl?.classList?.contains("cluster")) {
          const oldLabel = (
            selectedEl.querySelector(".cluster-label, .nodeLabel, text, tspan, p")?.textContent ||
            ""
          ).trim();
          const lines = newCode.split("\n");

          const extractSubgraphLabel = (line: string): string | null => {
            const trimmed = line.trim();
            if (!trimmed.startsWith("subgraph ")) return null;
            // subgraph id["Label"] or subgraph id[Label]
            const bracketMatch = trimmed.match(/^subgraph\s+\S+\s*\[(.*)\]\s*$/);
            if (bracketMatch) {
              return bracketMatch[1].replace(/^"|"$/g, "").trim();
            }
            // subgraph "Label" or subgraph Label
            const plainMatch = trimmed.match(/^subgraph\s+(.+)$/);
            if (plainMatch) {
              const raw = plainMatch[1].trim();
              if (raw.startsWith('"') && raw.endsWith('"')) {
                return raw.slice(1, -1).trim();
              }
            }
            return null;
          };

          let renameIndex = -1;
          if (oldLabel) {
            renameIndex = lines.findIndex((line) => {
              const lbl = extractSubgraphLabel(line);
              return lbl !== null && lbl === oldLabel;
            });
          }

          if (renameIndex === -1) {
            // Fallback: try matching subgraph id against selectedNodeId if possible.
            renameIndex = lines.findIndex((line) => {
              const trimmed = line.trim();
              if (!trimmed.startsWith("subgraph ")) return false;
              return new RegExp(`^subgraph\\s+${selectedNodeId}\\b`).test(trimmed);
            });
          }

          if (renameIndex !== -1) {
            const original = lines[renameIndex];
            const lead = original.match(/^\s*/)?.[0] || "";
            const trimmed = original.trim();

            // Preserve subgraph id; update visible title.
            const idAndMaybeLabel = trimmed.match(/^subgraph\s+(\S+)(?:\s*\[.*\])?\s*$/);
            if (idAndMaybeLabel) {
              const subId = idAndMaybeLabel[1];
              lines[renameIndex] = `${lead}subgraph ${subId}["${editingText}"]`;
              newCode = lines.join("\n");
              handledClusterRename = true;
            }
          }
        }
      }

      if (handledClusterRename) {
        // no-op, newCode already updated
      } else {
        const nodeRegex = new RegExp(
          `(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
          "m",
        );
        if (nodeRegex.test(newCode)) {
          const nodeRegexGlobal = new RegExp(nodeRegex.source, "gm");
          newCode = newCode.replace(nodeRegexGlobal, `$1$2${editingText}$4`);
        } else {
          const standaloneRegex = new RegExp(`(^|\\n)(\\s*)${selectedNodeId}(\\s*)($|\\r?\\n)`);
          if (standaloneRegex.test(newCode)) {
            newCode = newCode.replace(standaloneRegex, `$1$2${selectedNodeId}["${editingText}"]$4`);
          } else {
            const lines = newCode.split("\n");
            let insertIndex = -1;
            for (let i = 0; i < lines.length; i++) {
              const trimmed = lines[i].trim();
              if (
                trimmed.startsWith("style ") ||
                trimmed.startsWith("linkStyle ") ||
                trimmed.startsWith("classDef ") ||
                trimmed.startsWith("class ")
              ) {
                insertIndex = i;
                break;
              }
            }

            const newDeclaration = `    ${selectedNodeId}["${editingText}"]`;
            if (insertIndex !== -1) {
              lines.splice(insertIndex, 0, newDeclaration);
              newCode = lines.join("\n");
            } else {
              newCode += `\n${newDeclaration}`;
            }
          }
        }
      }
    }

    // If nothing changed, skip recompile and keep selection — behaves like Escape.
    // This prevents an unnecessary SVG recompile that shifts node positions,
    // which would cause the next click to miss the node (the "clicks die" bug).
    if (newCode === code) {
      setIsInlineEditing(false);
      return;
    }

    handleCodeChange(newCode);
    setIsInlineEditing(false);
    // Clear selection after edit so sequence overlay doesn't auto-re-appear
    setSelectedNodeId(null);
    setSelectedSvgId(null);
    setSelectionBox(null);
    setTextBox(null);
  };
  // Keep commitEditRef fresh every render so the interaction hook can commit
  // the current edit before any cross-element or background transition.
  commitEditRef.current = handleEditSubmit;

  const handleChangeShape = useCallback(
    (shape: ShapeOption) => {
      if (!selectedNodeId) return;
      let newCode = code;
      const escapedNodeId = selectedNodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Remove standalone text-shape helper lines only; do not strip inline declarations
      // that may be part of an edge statement on the same line.
      const standaloneTextShapeRegex = new RegExp(
        `(^|\\n)\\s*${escapedNodeId}\\s*@\\{\\s*shape:\\s*text\\s*\\}\\s*(?=\\n|$)`,
        "g",
      );
      newCode = newCode.replace(standaloneTextShapeRegex, "$1");

      let replaced = false;

      const formatReplacement = (label: string): string => {
        if (shape.isText) {
          return `${selectedNodeId}["${label}"]\\n    ${selectedNodeId}@{ shape: text }`;
        }
        if (shape.expanded) {
          return `${selectedNodeId}@{ shape: ${shape.expanded}, label: "${label}" }`;
        }
        if (shape.b) {
          return `${selectedNodeId}${shape.b[0]}"${label}"${shape.b[1]}`;
        }
        return `${selectedNodeId}["${label}"]`;
      };

      // Token-only replacement for @{} declarations. This preserves any trailing
      // edge content on the same line, e.g. A@{...} --> B.
      const atDeclarationRegex = new RegExp(
        `${escapedNodeId}\\s*@\\{\\s*shape:[^,]+,\\s*label:\\s*["']?([\\s\\S]*?)["']?\\s*\\}`,
        "g",
      );
      newCode = newCode.replace(atDeclarationRegex, (_m, label) => {
        replaced = true;
        return formatReplacement(label ?? selectedNodeId);
      });

      // Token-only replacement for bracket/delimiter based node shapes.
      const bracketTokenRegex = new RegExp(
        `${escapedNodeId}\\s*(?:\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?([\\s\\S]*?)["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\})`,
        "gm",
      );
      newCode = newCode.replace(bracketTokenRegex, (_m, label) => {
        replaced = true;
        return formatReplacement(label ?? selectedNodeId);
      });

      if (!replaced) {
        if (shape.isText) {
          newCode += `\\n    ${selectedNodeId}["${selectedNodeId}"]\\n    ${selectedNodeId}@{ shape: text }`;
        } else if (shape.expanded) {
          newCode += `\\n    ${selectedNodeId}@{ shape: ${shape.expanded}, label: "${selectedNodeId}" }`;
        } else if (shape.b) {
          newCode += `\\n    ${selectedNodeId}${shape.b[0]}"${selectedNodeId}"${shape.b[1]}`;
        }
      }

      handleCodeChange(newCode);
    },
    [code, handleCodeChange, selectedNodeId],
  );

  const handleDuplicateNode = useCallback(() => {
    if (!selectedNodeId) return;
    let newCode = code;
    const escapedNodeId = selectedNodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    let prefix = "n";
    const prefixMatch = selectedNodeId.match(/^([a-zA-Z]+)/);
    if (prefixMatch) {
      prefix = prefixMatch[1];
    }

    let i = 1;
    while (new RegExp(`(^|[^a-zA-Z0-9_])${prefix}${i}([^a-zA-Z0-9_]|$)`, "m").test(newCode)) {
      i++;
    }
    const newNodeId = `${prefix}${i}`;

    const nodeRegex = new RegExp(
      `(^|[^a-zA-Z0-9_])(${escapedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
      "m",
    );
    const match = newCode.match(nodeRegex);
    let duplicatedDeclaration = "";
    if (match) {
      duplicatedDeclaration = `    ${match[2].replace(selectedNodeId, newNodeId)}${match[3]}${match[4]}`;
    } else {
      duplicatedDeclaration = `    ${newNodeId}["Copy of Node"]`;
    }

    // Keep duplicate inside the same subgraph block as the source node when possible.
    const linesForPlacement = code.split("\n");
    const declLineIdx = linesForPlacement.findIndex((line) => {
      const trimmed = line.trim();
      return (
        new RegExp(`(^|[^a-zA-Z0-9_])${escapedNodeId}([^a-zA-Z0-9_]|$)`).test(trimmed) &&
        !trimmed.startsWith("style ") &&
        !trimmed.startsWith("class ") &&
        !trimmed.startsWith("classDef ") &&
        !trimmed.startsWith("linkStyle ")
      );
    });

    let inserted = false;
    if (declLineIdx !== -1) {
      const stack: number[] = [];
      let targetEnd = -1;
      for (let i = 0; i < linesForPlacement.length; i++) {
        const t = linesForPlacement[i].trim();
        if (t.startsWith("subgraph ")) stack.push(i);
        else if (t === "end" && stack.length > 0) {
          const start = stack.pop()!;
          if (start <= declLineIdx && declLineIdx <= i) {
            targetEnd = i;
          }
        }
      }

      if (targetEnd !== -1) {
        linesForPlacement.splice(targetEnd, 0, `    ${duplicatedDeclaration.trim()}`);
        newCode = linesForPlacement.join("\n");
        inserted = true;
      }
    }

    if (!inserted) {
      newCode += `\n${duplicatedDeclaration}`;
    }

    const lines = newCode.split("\n");
    const propertiesToDuplicate: string[] = [];
    let copiedExplicitStyle = false;
    lines.forEach((line) => {
      if (line.match(new RegExp(`^\\s*style\\s+${escapedNodeId}\\s+`))) {
        propertiesToDuplicate.push(
          line.replace(new RegExp(`style\\s+${escapedNodeId}`), `style ${newNodeId}`),
        );
        copiedExplicitStyle = true;
      }
      if (line.match(new RegExp(`^\\s*click\\s+${escapedNodeId}\\s+`))) {
        propertiesToDuplicate.push(
          line.replace(new RegExp(`click\\s+${escapedNodeId}`), `click ${newNodeId}`),
        );
      }
      if (line.match(new RegExp(`^\\s*class\\s+.*\\b${escapedNodeId}\\b.*\\s+\\S+\\s*$`))) {
        const m = line.match(/^\s*class\s+(.+?)\s+(\S+)\s*$/);
        if (m) {
          const nodeList = m[1].split(",").map((s) => s.trim());
          const className = m[2];
          if (nodeList.includes(selectedNodeId)) {
            propertiesToDuplicate.push(`    class ${newNodeId} ${className}`);
          }
        }
      }
      if (line.match(new RegExp(`^\\s*${escapedNodeId}\\@\\{\\s*shape:`))) {
        propertiesToDuplicate.push(
          line.replace(new RegExp(`^(\\s*)${escapedNodeId}(\\@\\{.*\\})`), `$1${newNodeId}$2`),
        );
      }
    });
    if (propertiesToDuplicate.length > 0) {
      newCode += "\n" + propertiesToDuplicate.join("\n");
    }

    // Fallback style clone: if there was no explicit style line to copy, clone
    // currently rendered fill/stroke/text colors from the selected SVG element.
    if (!copiedExplicitStyle && selectedSvgId) {
      try {
        const selectedEl = document.getElementById(selectedSvgId);
        if (selectedEl) {
          const shapeEl = selectedEl.querySelector(
            "rect, circle, polygon, path.node, path, ellipse",
          ) as Element | null;
          const textEl = selectedEl.querySelector(".label, text, .nodeLabel") as Element | null;

          const shapeStyle = shapeEl ? window.getComputedStyle(shapeEl) : null;
          const textStyle = textEl ? window.getComputedStyle(textEl) : null;

          const styleParts: string[] = [];
          const fill = toMermaidColorToken(shapeStyle?.fill);
          const stroke = toMermaidColorToken(shapeStyle?.stroke);
          const textColor = toMermaidColorToken(textStyle?.fill);

          if (fill) styleParts.push(`fill:${fill}`);
          if (stroke) styleParts.push(`stroke:${stroke}`);
          if (textColor) styleParts.push(`color:${textColor}`);

          if (styleParts.length > 0) {
            newCode += `\n    style ${newNodeId} ${styleParts.join(",")}`;
          }
        }
      } catch (err) {
        // Non-fatal: duplication should still succeed even if style fallback fails.
        console.warn("Duplicate style fallback failed:", err);
      }
    }

    const toRegex = new RegExp(
      `([a-zA-Z0-9_]+)\\s*(-->|==>|-\\.->)\\s*${escapedNodeId}([^a-zA-Z0-9_]|$)`,
      "g",
    );
    const edgesToAppend = [];
    let matchTo;
    while ((matchTo = toRegex.exec(code)) !== null) {
      edgesToAppend.push(`\n    ${matchTo[1]} ${matchTo[2]} ${newNodeId}`);
    }

    const fromRegex = new RegExp(
      `(^|[^a-zA-Z0-9_])${escapedNodeId}\\s*(-->|==>|-\\.->)\\s*([a-zA-Z0-9_]+)`,
      "g",
    );
    let matchFrom;
    while ((matchFrom = fromRegex.exec(code)) !== null) {
      edgesToAppend.push(`\n    ${newNodeId} ${matchFrom[2]} ${matchFrom[3]}`);
    }

    newCode += edgesToAppend.join("");
    handleCodeChange(newCode);
  }, [code, handleCodeChange, selectedNodeId, selectedSvgId, toMermaidColorToken]);

  // Reorder a sequence message to a new chronological slot (0..N). The moved message's
  // source line is spliced relative to the other message lines, so interleaved notes/blocks
  // stay in place. Routes through handleCodeChange so undo/redo + autonumber behave normally.
  // Reorder a sequence item (message OR note) to a new slot in the UNIFIED visual order of all
  // reorderable rows (messages + notes, sorted by source line). `item` identifies the dragged
  // row by kind + its per-kind DOM index; `toSlot` is the unified slot (0 = before first row,
  // M = after last). The single source line is spliced relative to the other rows, so unrelated
  // lines (blocks, participants) stay put. Routes through handleCodeChange (undo/autonumber).
  const handleReorderSequenceItem = useCallback(
    (item: { kind: "msg" | "note"; index: number }, toSlot: number) => {
      const msgs = getSequenceMessageEntries(code).map((e, i) => ({
        srcIndex: e.index,
        kind: "msg" as const,
        domIndex: i,
      }));
      const notes = getSequenceNoteEntries(code).map((e, i) => ({
        srcIndex: e.index,
        kind: "note" as const,
        domIndex: i,
      }));
      const unified: UnifiedRow[] = [...msgs, ...notes].sort((a, b) => a.srcIndex - b.srcIndex);
      const N = unified.length;
      const fromPos = unified.findIndex((u) => u.kind === item.kind && u.domIndex === item.index);
      if (fromPos < 0) return;
      const slot = Math.max(0, Math.min(N, toSlot));
      if (slot === fromPos || slot === fromPos + 1) return;

      const lines = code.split("\n");
      const srcIdx = unified[fromPos].srcIndex;
      const movedLine = lines[srcIdx];
      const insertAt = computeInsertionIndex(unified, fromPos, slot);

      lines.splice(srcIdx, 1);
      lines.splice(insertAt, 0, movedLine);

      const pruned = pruneEmptySequenceBlocks(lines);
      handleCodeChange(pruned.join("\n"));
      setSelectionBox(null);
      setSelectedNodeId(null);
    },
    [
      code,
      getSequenceMessageEntries,
      getSequenceNoteEntries,
      handleCodeChange,
      setSelectionBox,
      setSelectedNodeId,
    ],
  );

  // Reorder participant lifelines (the visual columns) to match a new left-to-right order produced
  // by a horizontal drag on the canvas. Mermaid lays out columns in FIRST-APPEARANCE order, so to
  // force an arbitrary order we DECLARE every lifeline explicitly at the top in the target order:
  //   1. Parse existing `participant`/`actor`/typed declaration lines → map actorId → full line.
  //   2. Build the new declaration block in `newOrderIds` order, REUSING each participant's existing
  //      declaration verbatim (keyword + `@{type}` + ` as Alias` all preserved); synthesize a plain
  //      `    participant <id>` only for implicit participants that had no declaration line.
  //   3. Remove all old declaration lines and splice the new block in at the first-declaration
  //      position (or right after `sequenceDiagram` + optional `autonumber`/frontmatter when the
  //      diagram had only implicit participants).
  // Only the participant declaration ORDER changes — message lines, blocks, notes, and the logical
  // flow are untouched. Routes through handleCodeChange (single undo). `newOrderIds` is the FULL set
  // of current lifelines (explicit + implicit) in the desired left-to-right order.
  const handleReorderSequenceLifelines = useCallback(
    (newOrderIds: string[]) => {
      if (!Array.isArray(newOrderIds) || newOrderIds.length === 0) return;
      const lines = code.split("\n");

      // [indent] keyword <id>[@{...}][ as Alias] — id is g2 (matched against the lifeline order).
      const declRe =
        /^(\s*)(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s*@\{[^}]*\})?(\s+as\s+.+?)?\s*$/i;
      // Map actorId → full declaration line for every existing declaration, plus their line indices.
      const declLine = new Map<string, string>();
      const declIdxs: number[] = [];
      let inFrontmatter = false;
      let headerEndIdx = 0; // index just after `sequenceDiagram` (+ autonumber/frontmatter)
      for (let i = 0; i < lines.length; i += 1) {
        const trimmed = lines[i].trim();
        if (trimmed === "---") {
          inFrontmatter = !inFrontmatter;
          headerEndIdx = i + 1;
          continue;
        }
        if (inFrontmatter) {
          headerEndIdx = i + 1;
          continue;
        }
        if (/^sequenceDiagram\b/.test(trimmed)) {
          headerEndIdx = i + 1;
          continue;
        }
        if (/^(autonumber|title)\b/.test(trimmed)) {
          headerEndIdx = i + 1;
          continue;
        }
        const m = lines[i].match(declRe);
        if (m && m[2]) {
          declLine.set(m[2], lines[i]);
          declIdxs.push(i);
        }
      }

      const indent = "    ";
      const block = newOrderIds.map((id) => declLine.get(id) ?? `${indent}participant ${id}`);

      // Insertion anchor: where the first existing declaration sat (so the block stays where the
      // user already had it); otherwise right after the diagram header.
      const anchor = declIdxs.length > 0 ? Math.min(...declIdxs) : headerEndIdx;
      const declSet = new Set(declIdxs);
      const remaining = lines.filter((_, i) => !declSet.has(i));
      // Recompute the anchor against the filtered array (removed decls before the anchor shift it up).
      const removedBeforeAnchor = declIdxs.filter((i) => i < anchor).length;
      const insertAt = Math.max(0, Math.min(remaining.length, anchor - removedBeforeAnchor));
      remaining.splice(insertAt, 0, ...block);

      const next = remaining.join("\n");
      if (next === code) return; // order unchanged — no-op
      handleCodeChange(next);
      setSelectionBox(null);
      setSelectedNodeId(null);
    },
    [code, handleCodeChange, setSelectionBox, setSelectedNodeId],
  );

  // Change the connector operator of the selected sequence message (e.g. `->>` → `-->>` → `-x`),
  // preserving the sender, receiver, message text, and surrounding spacing. The operator is
  // swapped only at the position between the two actors and before the colon, so participant IDs
  // and the label payload are never touched.
  const handleChangeSequenceMessageType = useCallback(
    (operator: string) => {
      if (!selectedNodeId?.startsWith("SEQ_MSG_")) return;
      const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
      if (!Number.isFinite(idx) || idx < 0) return;
      const entries = getSequenceMessageEntries(code);
      const entry = entries[idx];
      if (!entry) return;

      const lines = code.split("\n");
      const line = lines[entry.index];
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return;
      const beforeColon = line.substring(0, colonIdx);
      const afterColon = line.substring(colonIdx);

      // Swap the operator that sits immediately before the receiver actor at the end of the
      // pre-colon segment. Anchoring on the trailing actor avoids matching a stray `-` inside the
      // sender id. Operator alternation is longest-first to avoid prefix conflicts.
      const swapRe = /(<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)(\s*)(\S+)(\s*)$/;
      if (!swapRe.test(beforeColon)) return;
      const newBefore = beforeColon.replace(swapRe, `${operator}$2$3$4`);
      if (newBefore === beforeColon) return;
      lines[entry.index] = newBefore + afterColon;
      handleCodeChange(lines.join("\n"));
    },
    [code, getSequenceMessageEntries, handleCodeChange, selectedNodeId],
  );

  // Reassign one endpoint (sender or receiver) of the selected sequence message to a different
  // participant — the code-side of the visual endpoint drag-and-drop. The sender, receiver, and
  // operator each sit in a fixed slot of the pre-colon segment, so we swap ONLY the targeted
  // actor id and leave the operator, the OTHER actor, the message label (everything from the
  // colon onward), and all surrounding whitespace untouched. When the new sender equals the
  // receiver (or vice-versa) the resulting `A->>A: msg` line is a valid Mermaid self-message, so
  // cross→self and self→cross morphing falls out for free from this single substitution.
  const handleChangeSequenceMessageEndpoint = useCallback(
    (endpoint: "source" | "target", newActorId: string) => {
      if (!selectedNodeId?.startsWith("SEQ_MSG_")) return;
      if (!newActorId) return;
      const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
      if (!Number.isFinite(idx) || idx < 0) return;
      const entry = getSequenceMessageEntries(code)[idx];
      if (!entry) return;

      const lines = code.split("\n");
      const line = lines[entry.index];
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return;
      const beforeColon = line.substring(0, colonIdx);
      const afterColon = line.substring(colonIdx);

      // [indent] SENDER [sp] OPERATOR [sp] RECEIVER [trailing sp]. The SENDER group is LAZY
      // (`\S+?`) so a greedy match can't swallow the leading dash of a double-dash operator
      // (e.g. `B-->>A` would otherwise split as sender `B-` + op `-->>`).
      const m = beforeColon.match(
        /^(\s*)(\S+?)(\s*)(<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)(\s*)(\S+)(\s*)$/,
      );
      if (!m) return;
      const [, indent, from, sp1, op, sp2, to, sp3] = m;
      const newFrom = endpoint === "source" ? newActorId : from;
      const newTo = endpoint === "target" ? newActorId : to;
      if (newFrom === from && newTo === to) return; // dropped on the same lifeline — no-op
      lines[entry.index] = `${indent}${newFrom}${sp1}${op}${sp2}${newTo}${sp3}${afterColon}`;
      handleCodeChange(lines.join("\n"));
    },
    [code, getSequenceMessageEntries, handleCodeChange, selectedNodeId],
  );

  // The connector operator of the currently selected sequence message (for the toolbar's active
  // state). Null when no message is selected or it can't be parsed.
  const currentSequenceMessageOperator = useMemo(() => {
    if (!selectedNodeId?.startsWith("SEQ_MSG_")) return null;
    const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
    if (!Number.isFinite(idx) || idx < 0) return null;
    const entry = getSequenceMessageEntries(code)[idx];
    if (!entry) return null;
    const colonIdx = entry.line.indexOf(":");
    const beforeColon = colonIdx === -1 ? entry.line : entry.line.substring(0, colonIdx);
    const m = beforeColon.match(/(<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)(\s*)(\S+)(\s*)$/);
    return m ? m[1] : null;
  }, [code, getSequenceMessageEntries, selectedNodeId]);

  // Regex that splits a sequence participant declaration into [indent, id, " as Alias"], tolerating
  // an optional `@{ ... }` metadata token (which carries the visual type). Used by both the type
  // mutation and the active-type read-back. The keyword (participant/actor/database/…) and the
  // `@{}` token are deliberately NOT captured for reuse — they are rewritten from scratch.
  const SEQ_PARTICIPANT_DECL_RE =
    /^(\s*)(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s*@\{[^}]*\})?(\s+as\s+.+?)?\s*$/i;

  // Change the architectural TYPE of the selected participant (e.g. standard box → database). Only
  // the type flag is rewritten; the participant id, alias, and indentation are preserved. `participant`
  // and `actor` use Mermaid keyword syntax (and any prior `@{}` token is dropped); every other type
  // uses the `participant ID@{ "type": "X" } as Alias` metadata form — matching what the top
  // "Participants" picker writes. Routes through handleCodeChange so it is a single undo transaction.
  const handleChangeSequenceParticipantType = useCallback(
    (typeKey: string) => {
      if (!selectedNodeId?.startsWith("SEQ_ACTOR_")) return;
      if (!typeKey) return;
      const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(SEQ_PARTICIPANT_DECL_RE);
        if (!m || m[2] !== actorId) continue;
        const indent = m[1] ?? "";
        const asClause = m[3] ?? "";
        let newLine: string;
        if (typeKey === "participant") newLine = `${indent}participant ${actorId}${asClause}`;
        else if (typeKey === "actor") newLine = `${indent}actor ${actorId}${asClause}`;
        else newLine = `${indent}participant ${actorId}@{ "type": "${typeKey}" }${asClause}`;
        if (newLine === lines[i]) return; // already this type — no-op
        lines[i] = newLine;
        handleCodeChange(lines.join("\n"));
        return;
      }
    },
    [code, handleCodeChange, selectedNodeId, SEQ_PARTICIPANT_DECL_RE],
  );

  // The visual type of the currently selected participant (for the toolbar's active-state
  // highlight). Reads the `@{ "type": "X" }` token if present, else falls back to the declaration
  // keyword (`actor` → actor, plain `participant` → participant). Null when no actor is selected.
  const currentSequenceParticipantType = useMemo(() => {
    if (!selectedNodeId?.startsWith("SEQ_ACTOR_")) return null;
    const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
    const keywordRe =
      /^\s*(participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(\s*@\{[^}]*\})?(?:\s+as\s+.+?)?\s*$/i;
    for (const line of code.split("\n")) {
      const m = line.match(keywordRe);
      if (!m || m[2] !== actorId) continue;
      const meta = m[3] || "";
      const typeMatch = meta.match(/"type"\s*:\s*"([^"]+)"/i);
      if (typeMatch) return typeMatch[1].toLowerCase();
      const keyword = m[1].toLowerCase();
      return keyword === "actor" ? "actor" : keyword === "participant" ? "participant" : keyword;
    }
    return null;
  }, [code, selectedNodeId]);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    let newCode = code;

    // Sequence diagram deletions
    if (selectedNodeId.startsWith("SEQ_ACTOR_")) {
      const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
      // Remove participant/actor declaration lines and all lines referencing this actor
      const lines = code.split("\n");
      const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        // Remove declaration — handles all types including @{} syntax
        // e.g. "participant P843@{ "type": "database" } as New Database"
        const declMatch = trimmed.match(
          /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s*@\{[^}]*\})?(?:\s+as\s+.+)?$/i,
        );
        if (declMatch && declMatch[1] === actorId) return false;
        // Remove lines referencing this actor (as sender, receiver, or in notes)
        const refRegex = new RegExp(`(^|[^a-zA-Z0-9_])${actorId}(?:[^a-zA-Z0-9_]|$)`);
        if (refRegex.test(trimmed) && trimmed !== "sequenceDiagram") return false;
        return true;
      });
      newCode = filtered.join("\n");
    } else if (selectedNodeId.startsWith("SEQ_MSG_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
      if (Number.isFinite(idx) && idx >= 0) {
        const entries = getSequenceMessageEntries(code);
        const targetLineIndex = entries[idx]?.index;
        if (Number.isFinite(targetLineIndex)) {
          const lines = code.split("\n");
          const filtered = lines.filter((_, lineIndex) => lineIndex !== targetLineIndex);
          newCode = filtered.join("\n");
        }
      }
    } else if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
      const isNoteLine = (line: string) => {
        const trimmed = line.trim();
        return trimmed.startsWith("Note ") || trimmed.startsWith("note ");
      };
      const lines = code.split("\n");
      let noteCount = 0;
      const filtered = lines.filter((line) => {
        if (isNoteLine(line)) {
          if (noteCount === idx) {
            noteCount++;
            return false;
          }
          noteCount++;
        }
        return true;
      });
      newCode = filtered.join("\n");
    } else {
      // Flowchart deletion logic
      const toRegex = new RegExp(
        `([a-zA-Z0-9_]+)\\s*(-->|==>|-\\.->)\\s*${selectedNodeId}([^a-zA-Z0-9_]|$)`,
        "g",
      );
      const fromRegex = new RegExp(
        `(^|[^a-zA-Z0-9_])${selectedNodeId}\\s*(-->|==>|-\\.->)\\s*([a-zA-Z0-9_]+)`,
        "g",
      );

      const parents = [];
      let matchTo;
      while ((matchTo = toRegex.exec(code)) !== null) {
        parents.push({ id: matchTo[1], arrow: matchTo[2] });
      }

      const children = [];
      let matchFrom;
      while ((matchFrom = fromRegex.exec(code)) !== null) {
        children.push({ id: matchFrom[3], arrow: matchFrom[2] });
      }

      const nodesToPreserve = new Set([...parents.map((p) => p.id), ...children.map((c) => c.id)]);
      const preservedDefinitions = [];
      for (const nodeId of nodesToPreserve) {
        const nodeRegex = new RegExp(
          `(^|[^a-zA-Z0-9_])(${nodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`,
          "m",
        );
        const match = newCode.match(nodeRegex);
        if (match) {
          preservedDefinitions.push(`\n    ${match[2]}${match[3]}${match[4]}`);
        } else {
          preservedDefinitions.push(`\n    ${nodeId}`);
        }
      }

      const lines = newCode.split("\n");
      const filteredLines = lines.filter((line) => {
        const mentionRegex = new RegExp(`(^|[^a-zA-Z0-9_])${selectedNodeId}([^a-zA-Z0-9_]|$)`);
        return !mentionRegex.test(line);
      });

      newCode = filteredLines.join("\n") + preservedDefinitions.join("");
    }

    handleCodeChange(newCode);
    setSelectionBox(null);
    setSelectedNodeId(null);
  }, [
    code,
    getSequenceMessageEntries,
    handleCodeChange,
    selectedNodeId,
    setSelectionBox,
    setSelectedNodeId,
  ]);

  const performNavigation = useCallback(
    (url: string, message: string) => {
      setNavigatingState({ isNavigating: true, message });
      setTimeout(() => {
        router.push(url);
      }, 400);
    },
    [router],
  );

  const handleNavigate = useCallback(
    (url: string, message: string, skipConfirm: boolean = false) => {
      if (skipConfirm || !hasUnsavedChangesRef.current) {
        performNavigation(url, message);
      } else {
        setPendingNavigation({ url, message });
        setIsExitConfirmOpen(true);
      }
    },
    [performNavigation, hasUnsavedChangesRef],
  );

  const handleConfirmExitNavigation = useCallback(() => {
    if (!pendingNavigation) return;
    const next = pendingNavigation;
    setPendingNavigation(null);
    setIsExitConfirmOpen(false);
    if (next.url === "__browser_back__") {
      allowBrowserBackRef.current = true;
      window.history.back();
      return;
    }
    performNavigation(next.url, next.message);
  }, [pendingNavigation, performNavigation]);

  const handleCancelExitNavigation = useCallback(() => {
    setPendingNavigation(null);
    setIsExitConfirmOpen(false);
  }, []);

  const handleDuplicate = () => {
    if (!doc) return null;

    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.localStorage.setItem(
      `livemaid:duplicate:${token}`,
      JSON.stringify({
        name: `${doc.name} (Copy)`,
        code,
        type: doc.type,
        folderId: doc.folderId ?? null,
      }),
    );

    return `/editor/${doc.id}/duplicate?token=${encodeURIComponent(token)}`;
  };

  const handleCreateSubmit = async () => {
    if (!createName.trim()) return;
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          code: `graph TD\n    A[Start] --> B[End]`,
        }),
      });
      if (res.ok) {
        const newDiagram = await res.json();
        setIsNewDiagramOpen(false);
        handleNavigate(`/editor/${newDiagram.id}`, "Loading Workspace...");
      } else {
        toast.error("Failed to create diagram");
      }
    } catch {
      toast.error("Failed to create diagram");
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameName.trim()) return;
    const ok = await renameDiagram(renameName);
    if (ok) setIsRenameOpen(false);
  };

  const renameDiagram = async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (trimmed === doc?.name) return true;
    try {
      const res = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setDoc((prev) => (prev ? { ...prev, name: trimmed } : prev));
        toast.success("Diagram renamed");
        return true;
      }
      toast.error("Failed to rename");
      return false;
    } catch (e) {
      toast.error("Failed to rename");
      return false;
    }
  };

  const handleExport = async () => {
    getTelemetry()?.addBreadcrumb({
      category: "export",
      message: "Export triggered",
      data: { format: exportFormat, background: exportBg },
    });

    let finalSvgContent = svgContent;

    // Inject background if needed for SVG/PNG
    if (exportBg !== "transparent") {
      const bgRect = `<rect width="100%" height="100%" fill="${exportBg}" />`;
      finalSvgContent = finalSvgContent.replace(/(<svg[^>]*>)/, `$1${bgRect}`);
    }

    if (exportFormat === "SVG") {
      const blob = new Blob([finalSvgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc?.name || "diagram"}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === "PNG") {
      try {
        const svgContainer = containerRef.current?.querySelector("svg");
        if (!svgContainer) throw new Error("No SVG found");

        let w = 800;
        let h = 600;
        const viewBoxMatch = svgContainer.outerHTML.match(
          /viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/,
        );
        if (viewBoxMatch) {
          w = parseFloat(viewBoxMatch[1]);
          h = parseFloat(viewBoxMatch[2]);
        }

        // Use html-to-image to properly render foreignObjects and bypass canvas taint
        const dataUrl = await htmlToImage.toPng(svgContainer as unknown as HTMLElement, {
          backgroundColor: exportBg === "transparent" ? undefined : exportBg,
          pixelRatio: 5,
          skipFonts: true,
          fontEmbedCSS: "",
          width: w,
          height: h,
          style: {
            transform: "none",
            transformOrigin: "top left",
            width: `${w}px`,
            height: `${h}px`,
          },
        });

        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${doc?.name || "diagram"}.png`;
        a.click();
      } catch (err) {
        console.error("PNG export error", err);
        getTelemetry()?.captureError(err instanceof Error ? err : new Error("PNG export failed"), {
          format: exportFormat,
        });
        toast.error("Failed to export PNG");
      }
    } else if (exportFormat === "MMD") {
      const blob = new Blob([code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc?.name || "diagram"}.mmd`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.info(`${exportFormat} export coming soon!`);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return;

      // Intercept Ctrl+A / Cmd+A globally when ANY inline text editor is active.
      // This is a belt-and-suspenders guard: even if the textarea lost focus
      // (e.g. due to a re-render race), select-all is confined to the active
      // editor textarea instead of selecting everything on the page.
      const isAnyInlineEditing =
        isInlineEditing || classTextEdit || stateTextEdit || erTitleEdit || erEdgeLabelEdit;
      if (isAnyInlineEditing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        e.stopPropagation();
        const textarea =
          document.querySelector("textarea[data-scale-lock]") ||
          document.querySelector("[data-class-text-editor] textarea");
        if (textarea instanceof HTMLTextAreaElement) {
          textarea.focus();
          textarea.select();
        }
        return;
      }

      if (isInlineEditing) return;

      // Ignore keydown if the user is typing in any text input, textarea, or Monaco editor
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true" ||
          activeEl.closest(".monaco-editor"));

      // Undo/redo: always handled globally (routes to Monaco even when canvas has focus)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (isInputActive) return; // let Monaco handle it natively
        e.preventDefault();
        getTelemetry()?.addBreadcrumb({ category: "editor", message: "Undo" });
        editorRef.current?.trigger("keyboard", "undo", null);
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        if (isInputActive) return;
        e.preventDefault();
        getTelemetry()?.addBreadcrumb({ category: "editor", message: "Redo" });
        editorRef.current?.trigger("keyboard", "redo", null);
        return;
      }

      if (!selectedNodeId) return;
      if (isInputActive) return;

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (isEdgeId(selectedNodeId)) {
          handleDeleteEdge();
        } else {
          handleDeleteNode();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleGlobalBoldItalic("bold");
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        handleGlobalBoldItalic("italic");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isLocked,
    isInlineEditing,
    classTextEdit,
    stateTextEdit,
    erTitleEdit,
    erEdgeLabelEdit,
    selectedNodeId,
    handleDeleteEdge,
    handleDeleteNode,
    handleGlobalBoldItalic,
  ]);

  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        const isAnyInlineEditing =
          isInlineEditing || classTextEdit || stateTextEdit || erTitleEdit || erEdgeLabelEdit;
        if (!isAnyInlineEditing) return;
        e.preventDefault();
        const textarea =
          document.querySelector("textarea[data-scale-lock]") ||
          document.querySelector("[data-class-text-editor] textarea");
        if (textarea instanceof HTMLTextAreaElement) {
          textarea.focus();
          textarea.select();
        }
        // Clear any page-level selection the browser may have created before
        // our handler fired (e.g. if the textarea momentarily lost focus).
        window.getSelection()?.removeAllRanges();
      }
    };
    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => document.removeEventListener("keydown", onKeyDownCapture, true);
  }, [isInlineEditing, classTextEdit, stateTextEdit, erTitleEdit, erEdgeLabelEdit]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only interrupt the exit when there is genuinely unsaved work in flight (the user edited and
      // the debounced auto-save hasn't been confirmed by the server yet). Once everything is saved
      // the ref is false and the browser leaves without the "are you sure you want to exit" prompt.
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChangesRef]);

  useEffect(() => {
    const guardState = { __editorGuard: true };
    window.history.pushState(guardState, "", window.location.href);

    const handlePopState = () => {
      if (allowBrowserBackRef.current) {
        allowBrowserBackRef.current = false;
        return;
      }

      if (!hasUnsavedChangesRef.current) {
        allowBrowserBackRef.current = true;
        window.history.back();
        return;
      }

      setPendingNavigation({
        url: "__browser_back__",
        message: "Leaving editor...",
      });
      setIsExitConfirmOpen(true);
      window.history.pushState(guardState, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-zinc-500 flex-col gap-4 transition-all duration-300">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
        <p className="text-lg font-medium text-foreground animate-pulse">Loading Workspace...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground flex-col gap-5 px-6 text-center transition-all duration-300">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <FileQuestion className="h-8 w-8 text-red-500" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold">Diagram not found</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The diagram you&apos;re looking for doesn&apos;t exist or may have been deleted.
          </p>
        </div>
        <Button onClick={() => router.push("/")} className="mt-1">
          Back to Workspace
        </Button>
      </div>
    );
  }

  const currentType = determineDiagramType(code);
  const sortedHistory = [...(doc?.versionHistory ?? [])].sort(
    (a, b) =>
      Number(Boolean(b.starred)) - Number(Boolean(a.starred)) ||
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const selectedPreviewVersion = previewVersionId
    ? (sortedHistory.find((version) => version.id === previewVersionId) ?? null)
    : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {navigatingState.isNavigating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-300">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
            <p className="text-lg font-medium text-foreground animate-pulse">
              {navigatingState.message}
            </p>
          </div>
        </div>
      )}

      <EditorHeader
        doc={doc}
        folders={folders}
        saving={saving}
        isDemo={IS_DEMO_MODE}
        onNavigate={handleNavigate}
        onDuplicate={handleDuplicate}
        onNewDiagram={() => {
          setCreateName("New Diagram");
          setIsNewDiagramOpen(true);
        }}
        onRename={() => {
          setRenameName(doc?.name || "");
          setIsRenameOpen(true);
        }}
        onRenameInline={renameDiagram}
        onExport={() => setIsExportOpen(true)}
        onVersionHistory={() => setIsHistoryOpen(true)}
        onComments={() => setIsCommentsOpen((current) => !current)}
      />

      {IS_DEMO_MODE && <DemoBanner />}

      {/* Version History Sidebar */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-40" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/35 dark:bg-black/70 backdrop-blur-[2px]"
            onClick={() => {
              setIsHistoryOpen(false);
              setPreviewVersionId(null);
            }}
          />

          <div className="relative z-10 flex h-full w-full">
            <div className="min-w-0 flex-1 p-6 pr-6">
              <div className="relative h-full rounded-xl border border-border bg-background/95 dark:bg-zinc-800/90 shadow-2xl">
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:bg-zinc-800/95">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Snapshot Diagram Preview
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pan, zoom, and inspect safely before applying rollback.
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                      {selectedPreviewVersion
                        ? defaultHistoryLabel(selectedPreviewVersion, 0)
                        : "No snapshot selected"}
                    </span>
                  </div>

                  <div className="relative min-h-0 flex-1 overflow-hidden bg-background/30 dark:bg-zinc-700/35">
                    {selectedPreviewVersion ? (
                      previewParseError ? (
                        <div className="flex h-full items-center justify-center p-6">
                          <div className="max-w-lg rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                            Preview render failed: {previewParseError}
                          </div>
                        </div>
                      ) : previewSvgContent ? (
                        <TransformWrapper
                          initialScale={DEFAULT_HISTORY_PREVIEW_SCALE}
                          minScale={0.5}
                          maxScale={50}
                          wheel={{ wheelDisabled: true, step: 0.05 }}
                          panning={{ velocityDisabled: false }}
                          trackPadPanning={{ disabled: false }}
                          doubleClick={{ disabled: true }}
                          limitToBounds={false}
                        >
                          {({ zoomIn, zoomOut, resetTransform }) => (
                            <>
                              <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 rounded-lg border border-border bg-background p-1 shadow-sm">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => zoomIn()}
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4">
                                    <path
                                      fill="currentColor"
                                      d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"
                                    />
                                  </svg>
                                </Button>
                                <div className="h-px bg-border" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => resetTransform()}
                                >
                                  <span className="text-[10px] font-bold">1:1</span>
                                </Button>
                                <div className="h-px bg-border" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => zoomOut()}
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4">
                                    <path fill="currentColor" d="M19 13H5V11H19V13Z" />
                                  </svg>
                                </Button>
                              </div>

                              <TransformComponent
                                wrapperStyle={{ width: "100%", height: "100%" }}
                                contentStyle={{ width: "100%", height: "100%" }}
                              >
                                <div className="flex h-full w-full cursor-grab items-center justify-center bg-white active:cursor-grabbing">
                                  <div
                                    className="select-none"
                                    dangerouslySetInnerHTML={{ __html: previewSvgContent }}
                                  />
                                </div>
                              </TransformComponent>
                            </>
                          )}
                        </TransformWrapper>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Rendering selected snapshot...
                        </div>
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center p-8">
                        <div className="max-w-md text-center">
                          <p className="text-sm font-medium text-foreground">
                            Select a snapshot to preview
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Use the Preview button in the right panel to render that version on this
                            read-only canvas.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-full w-[26rem] border-l border-border bg-background shadow-2xl">
              <div className="flex h-full flex-col">
                <div className="shrink-0 border-b border-border px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Version History</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Preview first, then apply rollback.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsHistoryOpen(false);
                        setPreviewVersionId(null);
                      }}
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Close version history"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <div className="rounded-lg border border-border bg-muted/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Current saved version</p>
                        <p className="text-xs text-muted-foreground">
                          {doc?.updatedAt
                            ? format(new Date(doc.updatedAt), "MMM d, yyyy h:mm a")
                            : "Unknown save time"}
                        </p>
                      </div>
                      <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {doc?.versionHistory?.length ?? 0} snapshot
                        {(doc?.versionHistory?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {sortedHistory.length > 0 ? (
                      sortedHistory.map((version, index) => (
                        <div
                          key={version.id}
                          className={`rounded-lg border bg-background shadow-sm transition-colors ${previewVersionId === version.id ? "border-indigo-500 ring-1 ring-indigo-500/30" : "border-border"}`}
                        >
                          <div className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleHistoryStar(version.id)}
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    aria-label={
                                      version.starred
                                        ? "Unstar history entry"
                                        : "Star history entry"
                                    }
                                    title={version.starred ? "Unstar" : "Star"}
                                  >
                                    <Star
                                      className={`h-3.5 w-3.5 ${version.starred ? "fill-amber-400 text-amber-400" : ""}`}
                                    />
                                  </button>
                                  <Input
                                    value={
                                      historyDrafts[version.id] ??
                                      defaultHistoryLabel(version, index)
                                    }
                                    onChange={(event) =>
                                      setHistoryDrafts((current) => ({
                                        ...current,
                                        [version.id]: event.target.value,
                                      }))
                                    }
                                    onBlur={(event) =>
                                      handleRenameHistoryEntry(version.id, event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") event.currentTarget.blur();
                                    }}
                                    className="h-7 flex-1 bg-background text-xs"
                                    aria-label="Rename history entry"
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(version.timestamp), "MMM d, yyyy h:mm a")}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPreviewVersionId(
                                    previewVersionId === version.id ? null : version.id,
                                  )
                                }
                                className="h-7 px-2 text-xs text-muted-foreground"
                              >
                                {previewVersionId === version.id ? "Hide Preview" : "Preview"}
                              </Button>
                              <Button
                                variant={previewVersionId === version.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleRollbackToVersion(version.code)}
                                className="h-7 px-2 text-xs"
                              >
                                {previewVersionId === version.id ? "Apply Rollback" : "Rollback"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
                        <p className="text-sm font-medium text-foreground">No saved versions yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          The first snapshot is created after you make and save a code change.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={isExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelExitNavigation();
          } else {
            setIsExitConfirmOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-md bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Leave this editor?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              You are about to exit the current diagram editor. Continue?
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelExitNavigation}>
              Stay
            </Button>
            <Button onClick={handleConfirmExitNavigation}>Leave Editor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative flex flex-1 min-h-0 min-w-0">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 min-w-0">
          {isCodePanelOpen && (
            <>
              <ResizablePanel
                defaultSize={26}
                minSize={15}
                className="bg-background flex flex-col border-r border-border"
              >
                <EditorCodePanel
                  code={code}
                  handleCodeChange={handleCodeChange}
                  handleEditorDidMount={handleEditorDidMount}
                  parseError={parseError}
                  highlightRange={highlightRange}
                />
              </ResizablePanel>
              <ResizableHandle className="w-[1px] bg-slate-200 hover:bg-black transition-colors cursor-col-resize" />
            </>
          )}

          <ResizablePanel
            defaultSize={isCodePanelOpen ? 74 : 100}
            className="bg-white relative overflow-hidden text-zinc-900 min-w-0"
          >
            <div className="absolute top-4 left-4 z-10 flex gap-3 pointer-events-auto">
              <div className="flex items-center gap-2 rounded-xl bg-background p-2 border border-border shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
                  onClick={() => setIsCodePanelOpen(!isCodePanelOpen)}
                  title={isCodePanelOpen ? "Collapse code section" : "Expand code section"}
                >
                  {isCodePanelOpen ? (
                    <PanelLeftClose className="w-4 h-4" />
                  ) : (
                    <PanelLeftOpen className="w-4 h-4" />
                  )}
                </Button>
                <div className="h-5 w-px bg-border" />

                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => editorRef.current?.trigger("keyboard", "undo", null)}
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => editorRef.current?.trigger("keyboard", "redo", null)}
                  title="Redo"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
                <div className="h-5 w-px bg-border" />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
                      >
                        <div
                          className={`w-5 h-5 rounded-full border ${currentTheme === "dark" ? "bg-zinc-800 border-zinc-900" : currentTheme === "forest" ? "bg-green-400 border-green-500" : currentTheme === "neutral" ? "bg-slate-200 border-slate-300" : currentTheme === "base" ? "bg-orange-100 border-orange-200" : currentTheme === "redux" ? "bg-[#4f197b] border-[#4f197b]" : "bg-pink-100 border-pink-200"}`}
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuContent
                    className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-2"
                    sideOffset={10}
                    align="start"
                  >
                    <p className="text-xs font-medium text-slate-500 px-2 pt-2">Diagram theme</p>
                    <div className="flex flex-col">
                      {["default", "forest", "dark", "neutral", "base", "redux"].map((t) => (
                        <DropdownMenuItem
                          key={t}
                          onClick={() => handleThemeChange(t)}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <div
                            className={`w-4 h-4 rounded border ${t === "dark" ? "bg-zinc-800 border-zinc-900" : t === "forest" ? "bg-green-200 border-green-300" : t === "neutral" ? "bg-slate-200 border-slate-300" : t === "base" ? "bg-orange-100 border-orange-200" : t === "redux" ? "bg-[#4f197b] border-[#4f197b]" : "bg-pink-100 border-pink-200"} ${currentTheme === t ? "ring-2 ring-indigo-500" : ""}`}
                          />
                          <span className="capitalize">{t}</span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="icon"
                  className={`shrink-0 rounded-md p-1 h-8 w-8 flex items-center justify-center ${isCommentMode ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" : "text-foreground hover:bg-accent hover:text-accent-foreground"}`}
                  onClick={() => setIsCommentMode((current) => !current)}
                  title={isCommentMode ? "Exit comment mode" : "Enter comment mode"}
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
                      >
                        <Type className="w-4 h-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent
                    className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-2"
                    sideOffset={10}
                    align="start"
                  >
                    <p className="text-xs font-medium text-slate-500 px-2 pt-2">Font Family</p>
                    <div className="flex flex-col">
                      {FONT_OPTIONS.map((f) => (
                        <DropdownMenuItem
                          key={f.label}
                          onClick={() => handleFontChange(f)}
                          className={`flex items-center gap-3 cursor-pointer ${activeFontLabel === f.label ? "bg-accent/70" : ""}`}
                        >
                          <span
                            className={
                              activeFontLabel === f.label ? "font-bold text-indigo-500" : ""
                            }
                          >
                            {f.label}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {currentType === "sequence" && (
                  <>
                    <div className="h-5 w-px bg-border mx-1" />
                    <div className="flex items-center gap-2 px-2 h-8 select-none">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground whitespace-nowrap">
                        <Hash className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        <span>Auto number</span>
                      </span>
                      <button
                        onClick={() => {
                          if (code.match(/autonumber/i)) {
                            handleCodeChange(code.replace(/\r?\n\s*autonumber/gi, ""));
                          } else {
                            handleCodeChange(
                              code.replace(/(sequenceDiagram)/i, "$1\n    autonumber"),
                            );
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          code.match(/autonumber/i)
                            ? "bg-indigo-600"
                            : "bg-slate-200 dark:bg-slate-700"
                        }`}
                        aria-label="Toggle Autonumber"
                      >
                        <span
                          className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                            code.match(/autonumber/i) ? "translate-x-[18px]" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </>
                )}

                <div className="h-5 w-px bg-border" />

                {DiagramRegistry[currentType] &&
                  DiagramRegistry[currentType].ToolbarComponent &&
                  (() => {
                    const ToolbarComp = DiagramRegistry[currentType].ToolbarComponent;
                    return ToolbarComp ? (
                      <ToolbarComp
                        code={code}
                        setCode={handleCodeChange}
                        editorRef={editorRef}
                        selectedNodeId={selectedNodeId}
                        requestConfirm={requestConfirm}
                      />
                    ) : null;
                  })()}
              </div>
            </div>

            <EditorCanvas
              code={code}
              parseError={parseError}
              svgContent={svgContent}
              isLocked={isLocked}
              setIsLocked={setIsLocked}
              containerRef={containerRef}
              handleSvgClick={handleSvgClick}
              handleMouseMove={handleMouseMove}
              handleMouseUp={handleMouseUp}
              handleSequenceHoverOver={handleSequenceHoverOver}
              handleSequenceHoverOut={handleSequenceHoverOut}
              handleSequenceMessageHoverEnter={handleSequenceMessageHoverEnter}
              handleSequenceMessageHoverMove={handleSequenceMessageHoverMove}
              handleSequenceMessageHoverLeave={handleSequenceMessageHoverLeave}
              handleEditClick={handleEditClick}
              isCommentMode={isCommentMode}
              selectionBox={selectionBox}
              connectionState={connectionState}
              setConnectionState={setConnectionState}
              sequenceLifelineOverlay={sequenceLifelineOverlay}
              hoveredSequenceActorBox={hoveredSequenceActorBox}
              hoveredSequenceMessageBox={hoveredSequenceMessageBox}
              hoveredSequenceMessageIndex={hoveredSequenceMessageIndex}
              hoveredSequenceNoteBox={hoveredSequenceNoteBox}
              hoveredFlowchartNodeBox={hoveredFlowchartNodeBox}
              comments={doc?.comments ?? []}
              activeCommentId={activeCommentId}
              activeCommentFocusToken={activeCommentFocusToken}
              onActivateComment={activateCommentThread}
              onOpenSelectionCommentComposer={openSelectionCommentComposer}
              commentComposer={commentComposer}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              onSubmitCommentComposer={submitCommentComposer}
              commentReplyDrafts={commentReplyDrafts}
              onChangeCommentReplyDraft={refreshCommentDraft}
              onSubmitCommentReply={appendCommentReply}
              onToggleCommentResolved={toggleCommentResolved}
              renderIdRef={renderIdRef}
              commentsRailWidth={isCommentsOpen ? 384 : 0}
              sequenceMessageEntries={sequenceMessageEntries}
              getSequenceMessageEndpointGeometry={getSequenceMessageEndpointGeometry}
              sequenceMessageTriggerAreas={sequenceMessageTriggerAreas}
              sequenceBlockAreas={sequenceBlockAreas}
              startSequenceConnection={startSequenceConnection}
              onSequencePlusSelfLoop={handleSequencePlusSelfLoop}
              onSequencePlusNote={handleSequencePlusNote}
              onSequencePlusBlock={handleSequencePlusBlock}
              currentSequenceNotePosition={currentSequenceNotePosition}
              isInlineEditing={isInlineEditing}
              selectedSvgId={selectedSvgId}
              selectedNodeId={selectedNodeId}
              currentType={currentType}
              selectedClass={selectedClass}
              onApplyClassEdits={handleApplyClassEdits}
              onCloseClassPanel={handleDeselect}
              onClassPanelValidityChange={handleClassPanelValidityChange}
              onAddClassRelationship={handleAddClassRelationship}
              onLinkNoteToClass={handleLinkNoteToClass}
              onCreateClassLinked={handleCreateClassLinked}
              onCreateNoteForClass={handleCreateNoteForClass}
              onUpdateClassRelationshipType={handleUpdateClassRelationshipType}
              onSetClassRelationshipCardinality={handleSetClassRelationshipCardinality}
              onDeleteClassRelationship={handleDeleteClassRelationship}
              onEditClassEdgeLabel={handleEditClassEdgeLabel}
              onDeleteClassNode={handleDeleteClassNode}
              onDeleteClassNote={handleDeleteClassNote}
              onEditClassNode={handleEditClassNodeFromToolbar}
              onDeleteClassNamespace={handleDeleteClassNamespace}
              onMoveClassToNamespace={handleMoveClassToNamespace}
              onMoveClassToNewNamespace={handleMoveClassToNewNamespace}
              onRemoveClassFromNamespace={handleRemoveClassFromNamespace}
              selectedEntity={selectedEntity}
              onApplyEntityEdits={handleApplyEntityEdits}
              onCloseEntityPanel={handleCloseEntityPanel}
              onEntityPanelValidityChange={handleEntityPanelValidityChange}
              onDuplicateEntity={handleDuplicateEntity}
              onDeleteEntity={handleDeleteEntity}
              onEditEntityNode={handleEditEntityFromToolbar}
              onSetEntityStyle={handleSetEntityStyle}
              onResetEntityStyle={handleResetEntityStyle}
              currentEntityStyle={currentEntityStyle}
              onUpdateErRelationshipOperator={handleUpdateErRelationshipOperator}
              onDeleteErRelationship={handleDeleteErRelationship}
              onEditErEdgeLabel={handleEditErEdgeLabel}
              onAddErRelationship={handleAddErRelationship}
              onCreateErEntityLinked={handleCreateErEntityLinked}
              onDeleteStateNode={handleDeleteStateNode}
              onDeleteStateNote={handleDeleteStateNote}
              onRenameStateNode={handleRenameStateFromToolbar}
              onSetStateStyle={handleSetStateStyle}
              onResetStateStyle={handleResetStateStyle}
              onAddStateNote={handleAddStateNote}
              onFlipStateNote={handleFlipStateNote}
              onMoveStateIntoComposite={handleMoveStateIntoComposite}
              onMoveStateToNewComposite={handleMoveStateToNewComposite}
              onMoveStateToRoot={handleMoveStateToRoot}
              onChangeStateShape={handleChangeStateShape}
              onAddStateConcurrencyDivider={handleAddStateConcurrencyDivider}
              onDeleteStateTransition={handleDeleteStateTransition}
              onAddStateTransition={handleAddStateTransition}
              onCreateStateShapeLinked={handleCreateStateShapeLinked}
              handleUpdateStyle={handleUpdateStyle}
              handleFormatNodeLabel={handleFormatNodeLabel}
              handleChangeShape={handleChangeShape}
              handleDuplicateNode={handleDuplicateNode}
              handleDeleteNode={handleDeleteNode}
              onAddSequenceNote={handleAddSequenceNote}
              onMoveSequenceNote={handleMoveSequenceNote}
              onChangeSequenceMessageType={handleChangeSequenceMessageType}
              currentSequenceMessageOperator={currentSequenceMessageOperator}
              onChangeSequenceParticipantType={handleChangeSequenceParticipantType}
              currentSequenceParticipantType={currentSequenceParticipantType}
              onChangeSequenceMessageEndpoint={handleChangeSequenceMessageEndpoint}
              onLinkSequenceNote={handleLinkSequenceNote}
              setIsInlineEditing={setIsInlineEditing}
              textBox={textBox}
              theme={currentTheme}
              editingText={editingText}
              setEditingText={setEditingText}
              handleEditSubmit={handleEditSubmit}
              inlineInputRef={inlineInputRef}
              handleAddNodeFromSelected={handleAddNodeFromSelected}
              onHoveredSequenceMessageHover={(index) => triggerSequenceMessageHoverByIndex(index)}
              onHoveredSequenceMessageClick={(index) =>
                triggerHoveredSequenceMessageSelection(false, index)
              }
              onHoveredSequenceMessageDoubleClick={(index) =>
                triggerHoveredSequenceMessageSelection(true, index)
              }
              onHoveredSequenceNoteClick={(index) =>
                triggerHoveredSequenceNoteSelection(false, index)
              }
              onHoveredSequenceNoteDoubleClick={(index) =>
                triggerHoveredSequenceNoteSelection(true, index)
              }
              onReorderSequenceItem={handleReorderSequenceItem}
              onReorderSequenceLifelines={handleReorderSequenceLifelines}
              getSequenceLifelines={getSequenceLifelines}
              onDeselect={handleDeselect}
              onResetStyle={handleResetStyle}
              onUpdateEdgeStyle={handleUpdateEdgeStyle}
              onUpdateEdgeColor={handleUpdateEdgeColor}
              onUpdateEdgeCurve={handleUpdateEdgeCurve}
              onUpdateEdgeAnimation={handleUpdateEdgeAnimation}
              onDeleteEdge={handleDeleteEdge}
              shapePicker={shapePicker}
              setShapePicker={setShapePicker}
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        {isCommentsOpen && (
          <div className="absolute inset-y-0 right-0 z-30 h-full w-[24rem] min-h-0 border-l border-border bg-background shadow-2xl">
            <CommentSidebar
              key={commentSortStorageKey}
              openComments={openComments}
              resolvedComments={resolvedComments}
              activeCommentId={activeCommentId ?? null}
              showResolvedComments={showResolvedComments}
              isCommentMode={isCommentMode}
              sortStorageKey={commentSortStorageKey}
              onClose={handleCloseComments}
              onStartCommentMode={() => setIsCommentMode(true)}
              onActivateComment={activateCommentThread}
              onToggleResolvedComment={toggleCommentResolved}
              onToggleStarComment={toggleCommentStar}
              onToggleResolvedSection={() => {
                setShowResolvedComments?.((current) => !current);
              }}
            />
          </div>
        )}
      </div>

      {/* Class-diagram title/note inline editor (double-click to edit, click outside to exit). */}
      {classTextEdit && (
        <ClassTextEditor
          key={`${classTextEdit.kind}-${classTextEdit.noteIndex}`}
          kind={classTextEdit.kind}
          initialValue={classTextEdit.value}
          rect={classTextEdit.rect}
          onCommit={commitClassTextEdit}
          onCancel={() => setClassTextEdit(null)}
        />
      )}

      {/* ER-diagram title inline editor (double-click the title to edit, click outside to exit).
          Reuses the shared ClassTextEditor overlay (kind="title"). */}
      {erTitleEdit && (
        <ClassTextEditor
          kind="title"
          initialValue={erTitleEdit.value}
          rect={erTitleEdit.rect}
          onCommit={commitErTitleEdit}
          onCancel={() => setErTitleEdit(null)}
        />
      )}

      {/* ER-diagram relationship LABEL inline editor (US4) — double-click an edge / its label or
          click the edge toolbar pencil. Commits live per-keystroke (debounced) AND on Enter/blur. */}
      {erEdgeLabelEdit && (
        <ClassTextEditor
          key={`er-edge-${erEdgeLabelEdit.lineIndex}`}
          kind="relationship"
          initialValue={erEdgeLabelEdit.value}
          rect={erEdgeLabelEdit.rect}
          onCommit={commitErEdgeLabelEdit}
          onCancel={() => setErEdgeLabelEdit(null)}
          onLiveChange={handleErEdgeLabelLiveChange}
        />
      )}

      {/* State-diagram inline editor (double-click a state / composite / note / title to edit, click
          outside or Enter to commit). Reuses the shared ClassTextEditor overlay. */}
      {stateTextEdit && (
        <ClassTextEditor
          key={`state-${stateTextEdit.kind}-${stateTextEdit.id}-${stateTextEdit.noteIndex}-${stateTextEdit.lineIndex ?? -1}`}
          kind={
            stateTextEdit.kind === "title"
              ? "title"
              : stateTextEdit.kind === "note"
                ? "note"
                : stateTextEdit.kind === "edge"
                  ? "relationship"
                  : "state"
          }
          initialValue={stateTextEdit.value}
          rect={stateTextEdit.rect}
          onCommit={commitStateTextEdit}
          onCancel={() => setStateTextEdit(null)}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={isNewDiagramOpen} onOpenChange={setIsNewDiagramOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Diagram</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Diagram name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewDiagramOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubmit} className="bg-black text-white hover:bg-zinc-800">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Diagram</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Diagram name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} className="bg-black text-white hover:bg-zinc-800">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[1200px] w-[90vw] max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Export diagram</DialogTitle>
          </DialogHeader>
          <div className="flex gap-6 py-4">
            {/* Left Column (Options) */}
            <div className="w-1/3 flex flex-col gap-4">
              <div>
                <p className="text-sm font-semibold mb-2">Export format</p>
                <div className="flex flex-col gap-2">
                  {[
                    { id: "PNG", label: "PNG", desc: "High quality raster image" },
                    { id: "SVG", label: "SVG", desc: "Scalable vector graphics" },
                    { id: "MMD", label: "MMD", desc: "Mermaid syntax code" },
                  ].map((fmt) => (
                    <div
                      key={fmt.id}
                      onClick={() => {
                        setExportFormat(fmt.id);
                        if (fmt.id !== "PNG" && exportBg === "transparent") setExportBg("white");
                      }}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${exportFormat === fmt.id ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-border hover:border-foreground/20"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${exportFormat === fmt.id ? "border-indigo-500" : "border-border"}`}
                        >
                          {exportFormat === fmt.id && (
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                          )}
                        </div>
                        <span className="font-semibold text-foreground">{fmt.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">{fmt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-2">Background color</p>
                <div className="flex gap-2">
                  {(exportFormat === "PNG"
                    ? ["transparent", "white", "black"]
                    : ["white", "black"]
                  ).map((c) => (
                    <div
                      key={c}
                      onClick={() => setExportBg(c)}
                      className={`w-8 h-8 rounded-md border-2 cursor-pointer ${exportBg === c ? "border-indigo-500" : "border-border"} ${c === "white" ? "bg-white" : c === "black" ? "bg-black" : ""}`}
                      style={
                        c === "transparent"
                          ? {
                              backgroundImage:
                                "conic-gradient(#e5e7eb 90deg, #fff 90deg 180deg, #e5e7eb 180deg 270deg, #fff 270deg)",
                              backgroundSize: "10px 10px",
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* Right Column (Preview) */}
            <div className="w-2/3 flex flex-col">
              <p className="text-sm font-semibold mb-2">Preview</p>
              <div
                className="flex-grow border border-border rounded-lg overflow-hidden relative flex items-center justify-center min-h-[300px]"
                style={{
                  backgroundColor: exportBg === "transparent" ? "transparent" : exportBg,
                  backgroundImage:
                    exportBg === "transparent"
                      ? "conic-gradient(#e5e7eb 90deg, #fff 90deg 180deg, #e5e7eb 180deg 270deg, #fff 270deg)"
                      : "none",
                  backgroundSize: "10px 10px",
                }}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                  className="max-w-full max-h-full object-contain p-4 relative z-10"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm z-20"
                  onClick={() => {
                    navigator.clipboard.writeText(svgContent);
                    toast.success("SVG code copied to clipboard!");
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} className="bg-black text-white hover:bg-zinc-800">
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared confirmation dialog driven by `requestConfirm` (used by diagram plugins). */}
      <AlertDialog
        open={!!confirmState?.open}
        onOpenChange={(open) => {
          if (!open) resolveConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {confirmState?.description ? (
              <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resolveConfirm(true)}
              className={
                confirmState?.destructive ? "bg-red-500 hover:bg-red-600 text-white" : undefined
              }
            >
              {confirmState?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
