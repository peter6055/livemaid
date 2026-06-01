import { useRef, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";

interface SequenceManipulationToolbarProps {
  scale: number;
  onEditLabel: (e: React.MouseEvent) => void;
  onDeleteNode: () => void;
}

export function SequenceManipulationToolbar({
  scale,
  onEditLabel,
  onDeleteNode,
}: SequenceManipulationToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  const btnCls = "pointer-events-auto flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent hover:text-accent-foreground text-foreground transition-colors";

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
        {/* Rename button — all types */}
        <button className={btnCls} onClick={onEditLabel} title="Rename">
          <Pencil className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Delete — all types */}
        <button className={`${btnCls} hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30`} onClick={onDeleteNode} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
