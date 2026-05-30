import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Lock, Unlock, Plus } from "lucide-react";
import { NodeManipulationToolbar } from "./NodeManipulationToolbar";
import { InlineTextEditor } from "./InlineTextEditor";
import { CSSProperties, RefObject } from "react";

interface EditorCanvasProps {
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
  connectionState: { isDragging: boolean; mousePos: { x: number, y: number } | null; active: boolean; startNodeId: string | null };
  setConnectionState: (state: any) => void;
  isInlineEditing: boolean;
  selectedSvgId: string | null;
  selectedNodeId: string | null;
  currentType: string;
  toolbarStyle: CSSProperties;
  handleUpdateStyle: (property: string, value: string) => void;
  handleFormatNodeLabel: (format: string, value?: string) => void;
  handleChangeShape: (shape: any) => void;
  handleDuplicateNode: () => void;
  handleDeleteNode: () => void;
  setIsInlineEditing: (v: boolean) => void;
  textBox: { x: number, y: number, width: number, height: number } | null;
  theme: string | undefined;
  editingText: string;
  setEditingText: (text: string) => void;
  handleEditSubmit: () => void;
  handleFormatText: (format: string, value?: string) => void;
  inlineInputRef: RefObject<HTMLTextAreaElement | null>;
}

export function EditorCanvas({
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
  isInlineEditing,
  selectedSvgId,
  selectedNodeId,
  currentType,
  toolbarStyle,
  handleUpdateStyle,
  handleFormatNodeLabel,
  handleChangeShape,
  handleDuplicateNode,
  handleDeleteNode,
  setIsInlineEditing,
  textBox,
  theme,
  editingText,
  setEditingText,
  handleEditSubmit,
  handleFormatText,
  inlineInputRef
}: EditorCanvasProps) {

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-50 dark:bg-[#1e1e24] transition-colors duration-300">
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={4}
          centerOnInit
          wheel={{ step: 0.1 }}
          panning={{ disabled: isLocked, velocityDisabled: true }}
          doubleClick={{ disabled: true }}
        >
          {({ state }) => (
            <>
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <div 
                  ref={containerRef}
                  className="w-full h-full relative flex items-center justify-center cursor-grab active:cursor-grabbing"
                  onClick={!isLocked ? handleSvgClick : undefined}
                  onDoubleClick={(e) => { if (!isLocked) handleEditClick(e); }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {parseError && (
                    <div 
                      className="absolute inset-0 z-40 bg-white/60 dark:bg-zinc-900/60 cursor-not-allowed flex items-center justify-center pointer-events-auto" 
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  <div 
                    className={`mermaid-container select-none ${parseError ? 'opacity-30' : ''}`}
                    dangerouslySetInnerHTML={{ __html: svgContent }} 
                  />

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
                      className="absolute border-indigo-500 rounded-md pointer-events-none z-20"
                      style={{
                        left: selectionBox.x - 4,
                        top: selectionBox.y - 4,
                        width: selectionBox.width + 8,
                        height: selectionBox.height + 8,
                        borderWidth: `${2 / state.scale}px`,
                        boxShadow: `0 0 0 ${4 / state.scale}px rgba(99, 102, 241, 0.2)`
                      }}
                    >
                      {connectionState.isDragging && connectionState.mousePos && (
                        <svg 
                            className="absolute pointer-events-none z-30" 
                            style={{
                                top: selectionBox.height + 4,
                                left: selectionBox.width / 2,
                                width: Math.abs(connectionState.mousePos.x - (selectionBox.x + selectionBox.width / 2)) + 100,
                                height: Math.abs(connectionState.mousePos.y - (selectionBox.y + selectionBox.height)) + 100,
                                overflow: 'visible'
                            }}
                        >
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                                </marker>
                            </defs>
                            <line 
                                x1={0} 
                                y1={0} 
                                x2={connectionState.mousePos.x - (selectionBox.x + selectionBox.width / 2)} 
                                y2={connectionState.mousePos.y - (selectionBox.y + selectionBox.height + 4)} 
                                stroke="#6366f1" 
                                strokeWidth={2 / state.scale} 
                                strokeDasharray="5,5"
                                markerEnd="url(#arrowhead)"
                            />
                        </svg>
                      )}
                      
                      {!isInlineEditing && (
                        <NodeManipulationToolbar 
                          currentType={currentType}
                          selectedSvgId={selectedSvgId}
                          toolbarStyle={toolbarStyle}
                          onUpdateStyle={handleUpdateStyle}
                          onFormatNodeLabel={handleFormatNodeLabel}
                          onChangeShape={handleChangeShape}
                          onDuplicateNode={handleDuplicateNode}
                          onDeleteNode={handleDeleteNode}
                        />
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
                        handleFormatText={handleFormatText}
                        inlineInputRef={inlineInputRef}
                      />

                      {!isInlineEditing && (
                        <div 
                          className="absolute left-1/2 pointer-events-auto origin-top"
                          style={{ 
                            bottom: `-${12 / state.scale}px`,
                            transform: `translateX(-50%) translateY(100%) scale(${1 / state.scale})`
                          }}
                        >
                          <button
                             onMouseDown={(e) => { 
                                 e.stopPropagation(); 
                                 e.preventDefault();
                                 setConnectionState({
                                     active: true,
                                     startNodeId: selectedNodeId,
                                     mousePos: null,
                                     isDragging: false
                                 });
                             }}
                             onClick={(e) => e.stopPropagation()}
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

              <div className="absolute bottom-6 right-6 z-10 flex gap-2">
                <button
                  onClick={() => setIsLocked(!isLocked)}
                  className={`p-3 rounded-full shadow-lg transition-all ${
                    isLocked 
                      ? 'bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50' 
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  }`}
                  title={isLocked ? "Unlock Canvas Pan" : "Lock Canvas Pan"}
                >
                  {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                </button>
              </div>
            </>
          )}
        </TransformWrapper>
    </div>
  );
}
