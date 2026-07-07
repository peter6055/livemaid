import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Circle, Cloud, Hexagon, Loader, Square, Trash2 } from "lucide-react";
import type { MindmapShapeKind } from "@/lib/diagrams/mindmap";

interface MindmapNodeToolbarProps {
  scale: number;
  currentShape: MindmapShapeKind;
  onChangeShape: (shape: MindmapShapeKind) => void;
  onDelete: () => void;
}

const MINDMAP_SHAPES: Array<{ id: MindmapShapeKind; label: string; icon: ReactNode }> = [
  { id: "default", label: "Default", icon: <Square className="h-3.5 w-3.5" /> },
  { id: "square", label: "Square", icon: <Square className="h-3.5 w-3.5" /> },
  { id: "rounded", label: "Rounded", icon: <Square className="h-3.5 w-3.5 rounded-sm" /> },
  { id: "circle", label: "Circle", icon: <Circle className="h-3.5 w-3.5" /> },
  { id: "cloud", label: "Cloud", icon: <Cloud className="h-3.5 w-3.5" /> },
  { id: "hexagon", label: "Hexagon", icon: <Hexagon className="h-3.5 w-3.5" /> },
  { id: "bang", label: "Bang", icon: <Loader className="h-3.5 w-3.5" /> },
];

export function MindmapNodeToolbar({
  scale,
  currentShape,
  onChangeShape,
  onDelete,
}: MindmapNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shapeOpen, setShapeOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("mousedown", stop);
    el.addEventListener("pointerdown", stop);
    el.addEventListener("dblclick", stop);
    return () => {
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("dblclick", stop);
    };
  }, []);

  useEffect(() => {
    if (!shapeOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setShapeOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [shapeOpen]);

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-mindmap-node-toolbar
      data-base-transform="translateX(-50%) translateY(-100%)"
      className="absolute left-1/2 pointer-events-auto z-30 origin-bottom"
      style={{
        top: `calc(-14px * var(--zoom-inverse-scale, ${1 / scale}))`,
        transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
        padding: "12px",
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex w-max items-center gap-1 rounded-xl border border-border bg-background px-1.5 py-1 shadow-lg">
        <div className="relative">
          <button
            type="button"
            className={`pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
              shapeOpen
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title="Change shape"
            onMouseDownCapture={(e) => {
              e.stopPropagation();
              setShapeOpen((open) => !open);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Square className="h-3.5 w-3.5" />
            Shape
          </button>

          {shapeOpen && (
            <div
              className="absolute left-0 bottom-full z-40 mb-2 grid w-48 grid-cols-1 gap-0.5 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {MINDMAP_SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChangeShape(shape.id);
                    setShapeOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                    currentShape === shape.id
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {shape.icon}
                    {shape.label}
                  </span>
                  {currentShape === shape.id && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          title="Delete element and descendants"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
