import { useRef, useEffect, useState } from "react";
import { ArrowLeftRight, Pencil, Trash2, Spline } from "lucide-react";

interface SequenceManipulationToolbarProps {
  selectedNodeId: string | null;
  scale: number;
  onEditLabel: (e: React.MouseEvent) => void;
  onAddNote: (position: "left" | "right" | "over") => void;
  onMoveNote: (position: "left" | "right" | "over") => void;
  onChangeMessageType?: (operator: string) => void;
  currentMessageOperator?: string | null;
  onDeleteNode: () => void;
}

// Four standard UML sequence message styles: {solid, dashed} × {filled arrowhead, open cross}.
const MESSAGE_TYPES: Array<{ operator: string; label: string; preview: string }> = [
  { operator: "->>", label: "Solid line + filled arrow", preview: "──▶" },
  { operator: "-->>", label: "Dashed line + filled arrow", preview: "--▶" },
  { operator: "-x", label: "Solid line + cross", preview: "──✕" },
  { operator: "--x", label: "Dashed line + cross", preview: "--✕" },
];

export function SequenceManipulationToolbar({
  selectedNodeId,
  scale,
  onEditLabel,
  onAddNote,
  onMoveNote,
  onChangeMessageType,
  currentMessageOperator,
  onDeleteNode,
}: SequenceManipulationToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNoteSelected = Boolean(selectedNodeId?.startsWith("SEQ_NOTE_"));
  const isMessageSelected = Boolean(selectedNodeId?.startsWith("SEQ_MSG_"));
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stopNativePropagation = (e: Event) => e.stopPropagation();
    el.addEventListener("mousedown", stopNativePropagation);
    el.addEventListener("pointerdown", stopNativePropagation);
    el.addEventListener("touchstart", stopNativePropagation);
    el.addEventListener("dblclick", stopNativePropagation);
    return () => {
      el.removeEventListener("mousedown", stopNativePropagation);
      el.removeEventListener("pointerdown", stopNativePropagation);
      el.removeEventListener("touchstart", stopNativePropagation);
      el.removeEventListener("dblclick", stopNativePropagation);
    };
  }, []);

  // Close the Move popup when clicking outside it or when the selection changes.
  useEffect(() => {
    if (!moveMenuOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setMoveMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [moveMenuOpen]);

  // Close the Message Type dropdown on outside click.
  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setTypeMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [typeMenuOpen]);

  useEffect(() => {
    setMoveMenuOpen(false);
    setTypeMenuOpen(false);
  }, [selectedNodeId]);

  const btnCls = "pointer-events-auto flex items-center justify-center h-9 rounded-md px-3 gap-1 whitespace-nowrap hover:bg-accent hover:text-accent-foreground text-foreground transition-colors";

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-base-transform="translateX(-50%) translateY(-100%)"
      className="absolute left-1/2 pointer-events-auto z-30 origin-bottom"
      style={{
        top: `calc(-14px * var(--zoom-inverse-scale, ${1 / scale}))`,
        transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
        // Transparent padding "shield" so near-miss clicks around the bar are absorbed here
        // (stopPropagation) instead of leaking through to canvas elements behind the toolbar.
        padding: '12px',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 bg-background border border-border rounded-xl shadow-lg px-2 py-1">
        {!isNoteSelected && (
          <>
            <button className={btnCls} onClick={onEditLabel} title="Rename">
              <Pencil className="w-3.5 h-3.5" />
              <span className="text-sm font-semibold">Rename</span>
            </button>

            <div className="w-px h-5 bg-border mx-0.5" />
          </>
        )}

        {isMessageSelected && onChangeMessageType && (
          <>
            <div className="relative">
              <button
                className={btnCls}
                title="Message Type"
                onMouseDownCapture={(e) => {
                  // Toggle on mousedown in the CAPTURE phase, not onClick. Near the button's
                  // top edge a transient re-render can move the toolbar so that mouseup lands
                  // on a different element, and the browser then fires NO native click — the
                  // menu would silently fail to open. mousedown always fires on press.
                  // Capture phase runs before the toolbar container's native bubble-phase
                  // stopPropagation listener, so the handler is not suppressed.
                  e.stopPropagation();
                  setTypeMenuOpen((o) => !o);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Spline className="w-3.5 h-3.5 shrink-0" />
                <span className="text-sm font-semibold whitespace-nowrap">Message Type</span>
              </button>

              {typeMenuOpen && (
                <div
                  className="absolute left-1/2 top-full z-40 mt-2 w-max min-w-[280px] max-w-[340px] -translate-x-1/2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col gap-1">
                    <div className="px-3 pb-1 text-base font-semibold text-popover-foreground">Message Type</div>
                    {MESSAGE_TYPES.map((mt) => {
                      const active = currentMessageOperator === mt.operator;
                      return (
                        <button
                          key={mt.operator}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${active ? "bg-accent ring-1 ring-indigo-500" : ""}`}
                          onClick={() => { onChangeMessageType(mt.operator); setTypeMenuOpen(false); }}
                        >
                          <span className="w-10 shrink-0 text-center font-mono text-base tracking-tighter text-indigo-500">{mt.preview}</span>
                          <span className="flex-1 whitespace-nowrap">{mt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-5 bg-border mx-0.5" />
          </>
        )}

        {isNoteSelected && (
          <>
            <div className="relative">
              <button
                className={btnCls}
                title="Change position"
                onMouseDownCapture={(e) => {
                  // Toggle on capture-phase mousedown for the same reliability reason as the
                  // Message Type button (a missed native click would leave the menu closed).
                  e.stopPropagation();
                  setMoveMenuOpen((o) => !o);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span className="text-sm font-semibold">Move</span>
              </button>

              {moveMenuOpen && (
                <div
                  className="absolute left-1/2 top-full z-40 mt-2 w-52 -translate-x-1/2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col gap-1">
                    <div className="px-2 pb-1 text-base font-semibold text-popover-foreground">Note</div>
                    <button
                      className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                      onClick={() => { onMoveNote("left"); setMoveMenuOpen(false); }}
                    >
                      Move note to the left
                    </button>
                    <button
                      className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                      onClick={() => { onMoveNote("right"); setMoveMenuOpen(false); }}
                    >
                      Move note to the right
                    </button>
                    <button
                      className="w-full rounded-md px-2 py-2 text-left text-base hover:bg-accent"
                      onClick={() => { onMoveNote("over"); setMoveMenuOpen(false); }}
                    >
                      Move note over
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-5 bg-border mx-0.5" />
          </>
        )}

        <button
          className={`${btnCls} text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30`}
          onClick={onDeleteNode}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="text-sm font-semibold">Delete</span>
        </button>
      </div>

    </div>
  );
}
