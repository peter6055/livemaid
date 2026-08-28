"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Copy, Palette } from "lucide-react";
import { NodeStylePopover } from "./NodeStylePopover";

interface ErNodeToolbarProps {
  scale: number;
  /** The selected entity's current `style` properties (fill / stroke / color / stroke-dasharray …). */
  currentStyle: Record<string, string>;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Merge a style patch onto the entity (an empty value removes that property). */
  onSetStyle: (patch: Record<string, string>) => void;
  /** Remove the entity's whole `style` line (revert to the active theme). */
  onResetStyle: () => void;
  /** Open the property panel for the selected entity. */
  onRename?: () => void;
}

/**
 * Minimal inline toolbar shown when an ER entity is single-clicked. Exposes:
 *  - Duplicate (US4): clone the entity (+offset, collision-free `_Copy_N` id).
 *  - Style (US5): a popover for border line-style, border color, text color, and fill color —
 *    each writes a localized `style <Entity> …` override that does not leak to other entities.
 *  - Delete: remove the entity and its relationship lines.
 *
 * Mirrors the chrome of the other inline toolbars (scale-locked, `data-inline-toolbar`, capture-phase
 * native-event guard) so it never leaks clicks to the canvas underneath.
 */
export function ErNodeToolbar({
  scale,
  currentStyle,
  onDuplicate,
  onDelete,
  onSetStyle,
  onResetStyle,
  onRename,
}: ErNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [styleOpen, setStyleOpen] = useState(false);

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

  // Close the style popover on an outside click.
  useEffect(() => {
    if (!styleOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setStyleOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [styleOpen]);

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-er-node-toolbar
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
              title="Edit entity properties"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename();
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <div className="mx-0.5 h-4 w-px bg-border" />
          </>
        )}
        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Duplicate entity"
          onClick={onDuplicate}
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>

        <div className="relative">
          <button
            type="button"
            className={`pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
              styleOpen
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title="Custom style"
            onMouseDownCapture={(e) => {
              e.stopPropagation();
              setStyleOpen((o) => !o);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Palette className="h-3.5 w-3.5" />
            Style
          </button>

          {styleOpen && (
            <NodeStylePopover
              currentStyle={currentStyle}
              onSetStyle={onSetStyle}
              onResetStyle={onResetStyle}
              showBorderStyle={false}
            />
          )}
        </div>

        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="Delete entity"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
