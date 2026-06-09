"use client";

import { useEffect, useRef } from "react";
import { Trash2, Pencil } from "lucide-react";

interface StateNodeToolbarProps {
  /** Which kind of element is selected — drives the tooltip + available actions. */
  kind: "state" | "composite" | "note";
  scale: number;
  /** Open the inline label editor (states / composites / notes are all renamable). */
  onRename?: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

/**
 * Minimal inline floating toolbar shown when a state node, composite container, or note is
 * single-clicked on a state diagram. Exposes a Rename affordance (the same inline-edit flow as a
 * double-click) and Delete (with cascade cleanup). Mirrors the floating-bar chrome of the other
 * inline toolbars (scale-locked, `data-inline-toolbar`, capture-phase native-event guard) so it
 * never leaks clicks to the canvas underneath. (Notes + color customization arrive in Phase 4.)
 */
export function StateNodeToolbar({ kind, scale, onRename, onDelete }: StateNodeToolbarProps) {
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

  const deleteTitle =
    kind === "note" ? "Delete note" : kind === "composite" ? "Delete composite" : "Delete state";

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-state-node-toolbar
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
        {onRename && (
          <>
            <button
              type="button"
              className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Rename (double-click)"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename(e);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <div className="mx-0.5 h-4 w-px bg-border" />
          </>
        )}

        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          title={deleteTitle}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
