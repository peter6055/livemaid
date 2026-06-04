import { useRef, useEffect, useState } from "react";
import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";

interface SequenceManipulationToolbarProps {
  selectedNodeId: string | null;
  scale: number;
  onEditLabel: (e: React.MouseEvent) => void;
  onAddNote: (position: "left" | "right" | "over") => void;
  onMoveNote: (position: "left" | "right" | "over") => void;
  onDeleteNode: () => void;
}

export function SequenceManipulationToolbar({
  selectedNodeId,
  scale,
  onEditLabel,
  onAddNote,
  onMoveNote,
  onDeleteNode,
}: SequenceManipulationToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNoteSelected = Boolean(selectedNodeId?.startsWith("SEQ_NOTE_"));
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stopNativePropagation = (e: Event) => e.stopPropagation();
    el.addEventListener("mousedown", stopNativePropagation);
    el.addEventListener("pointerdown", stopNativePropagation);
    el.addEventListener("touchstart", stopNativePropagation);
    return () => {
      el.removeEventListener("mousedown", stopNativePropagation);
      el.removeEventListener("pointerdown", stopNativePropagation);
      el.removeEventListener("touchstart", stopNativePropagation);
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

  useEffect(() => {
    setMoveMenuOpen(false);
  }, [selectedNodeId]);

  const btnCls = "pointer-events-auto flex items-center justify-center h-8 rounded-md px-2.5 gap-1 hover:bg-accent hover:text-accent-foreground text-foreground transition-colors";

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-base-transform="translateX(-50%) translateY(-100%)"
      className="absolute left-1/2 pointer-events-auto z-30 origin-bottom"
      style={{
        top: `calc(-10px * var(--zoom-inverse-scale, ${1 / scale}))`,
        transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`
      }}
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

        {isNoteSelected && (
          <>
            <div className="relative">
              <button
                className={btnCls}
                title="Change position"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoveMenuOpen((o) => !o);
                }}
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
