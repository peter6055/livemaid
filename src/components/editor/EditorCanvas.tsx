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
  hoveredFlowchartNodeBox: { x: number, y: number, width: number, height: number } | null;
  sequenceMessageTriggerAreas: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  startSequenceConnection: (actorId: string, anchorY: number) => void;
  onSequencePlusSelfLoop: (actorId: string, anchorY: number) => void;
  onSequencePlusNote: (actorId: string, anchorY: number, position: 'left' | 'right' | 'over') => void;
  onHoveredSequenceMessageHover: (index: number) => void;
  onHoveredSequenceMessageClick: (index: number) => void;
  onHoveredSequenceMessageDoubleClick: (index: number) => void;
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
  onLinkSequenceNote: () => void;
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
  handleEditClick,
  selectionBox,
  connectionState,
  setConnectionState,
  sequenceLifelineOverlay,
  hoveredSequenceActorBox,
  hoveredSequenceMessageBox,
  hoveredFlowchartNodeBox,
  sequenceMessageTriggerAreas,
  startSequenceConnection,
  onSequencePlusSelfLoop,
  onSequencePlusNote,
  onHoveredSequenceMessageHover,
  onHoveredSequenceMessageClick,
  onHoveredSequenceMessageDoubleClick,
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
  const sequencePlusMenuRef = useRef<HTMLDivElement | null>(null);

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
          panning={{ velocityDisabled: false, disabled: isInlineEditing || connectionState.isDragging }}
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
                  onDoubleClick={!isLocked ? ((e) => { handleEditClick(e); }) : undefined}
                  onMouseMove={handleMouseMove}
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
                      className="absolute pointer-events-none z-20 border-indigo-500 rounded-md"
                      style={{
                        left: hoveredSequenceMessageBox.x - 4,
                        top: hoveredSequenceMessageBox.y - 4,
                        width: hoveredSequenceMessageBox.width + 8,
                        height: hoveredSequenceMessageBox.height + 8,
                        borderWidth: `calc(1.25px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        boxShadow: `0 0 0 calc(2px * var(--zoom-inverse-scale, ${1 / state.scale})) rgba(99, 102, 241, 0.2)`,
                      }}
                    />
                  )}

                  {currentType === 'sequence' && hoveredSequenceActorBox && !selectedNodeId?.startsWith('SEQ_ACTOR_') && !selectedNodeId?.startsWith('SEQ_MSG_') && !selectedNodeId?.startsWith('SEQ_NOTE_') && !isInlineEditing && !connectionState.active && (
                    <div
                      className="absolute pointer-events-none z-[19] border-indigo-400 rounded-md"
                      style={{
                        left: hoveredSequenceActorBox.x - 4,
                        top: hoveredSequenceActorBox.y - 4,
                        width: hoveredSequenceActorBox.width + 8,
                        height: hoveredSequenceActorBox.height + 8,
                        borderWidth: `calc(1.5px * var(--zoom-inverse-scale, ${1 / state.scale}))`,
                        borderStyle: 'solid',
                        opacity: 0.55,
                      }}
                    />
                  )}

                  {(currentType === 'flowchart' || currentType === 'graph') && hoveredFlowchartNodeBox && !isInlineEditing && !connectionState.active && !selectionBox && (
                    <div
                      className="absolute pointer-events-none z-[19] border-indigo-400 rounded-md"
                      style={{
                        left: hoveredFlowchartNodeBox.x - 3,
                        top: hoveredFlowchartNodeBox.y - 3,
                        width: hoveredFlowchartNodeBox.width + 6,
                        height: hoveredFlowchartNodeBox.height + 6,
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
                          className="absolute pointer-events-auto w-6 h-6 rounded-full bg-indigo-600 text-white ring-2 ring-white/90 shadow-lg hover:bg-indigo-700 transition-colors"
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
                              }
                            };
                            const onUp = () => {
                              window.removeEventListener('mousemove', onMove);
                              window.removeEventListener('mouseup', onUp);
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

                  {connectionState.isDragging && connectionState.startPos && connectionState.mousePos && (
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

                  {selectionBox && !isLocked && (
                    <div 
                      data-scale-lock-border
                      data-scale-lock-shadow
                      className="absolute border-indigo-500 rounded-md pointer-events-none z-20"
                      style={{
                        left: selectionBox.x - 4,
                        top: selectionBox.y - 4,
                        width: selectionBox.width + 8,
                        height: selectionBox.height + 8,
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
                            onLinkNote={onLinkSequenceNote}
                            onDeleteNode={handleDeleteNode}
                          />
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

        {sequencePlusMenu && (
          <div
            ref={sequencePlusMenuRef}
            className={
              sequencePlusMenu.mode === 'root'
                ? 'absolute pointer-events-auto z-30 rounded-xl border border-border bg-popover px-1.5 py-1 shadow-xl'
                : 'absolute pointer-events-auto z-30 w-52 rounded-xl border border-border bg-popover p-2 shadow-xl'
            }
            style={{
              left: sequencePlusMenu.x,
              top: sequencePlusMenu.y,
              transform: sequencePlusMenu.mode === 'root' ? 'translate(-50%, calc(-100% - 32px))' : 'translate(-50%, calc(-100% - 32px))',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {sequencePlusMenu.mode === 'root' ? (
              <div className="flex items-center gap-1">
                <button
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-popover-foreground hover:bg-accent"
                  title="Note"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSequencePlusMenu((prev) => prev ? { ...prev, mode: 'note' } : prev);
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
            ) : (
              <div className="flex flex-col gap-1 text-popover-foreground">
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
