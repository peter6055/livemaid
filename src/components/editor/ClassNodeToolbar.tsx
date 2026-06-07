"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

interface ClassNodeToolbarProps {
  /** Whether a class node or a floating/attached note is selected (affects the label/tooltip). */
  kind: "class" | "note";
  scale: number;
  onDelete: () => void;
}

/**
 * Minimal inline toolbar shown when a class node or note is single-clicked on a class diagram.
 * Currently exposes a single **Delete** action (the property panel for richer editing opens on
 * double-click). Mirrors the floating-bar chrome of the other inline toolbars (scale-locked,
 * `data-inline-toolbar`, capture-phase native-event guard) so it never leaks clicks to the canvas.
 */
export function ClassNodeToolbar({ kind, scale, onDelete }: ClassNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Block native canvas mousedown/dblclick leakage (same rationale as the other inline toolbars).
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

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-class-node-toolbar
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
        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          title={kind === "note" ? "Delete note" : "Delete class"}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
