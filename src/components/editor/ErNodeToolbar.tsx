"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Copy, Palette, Check } from "lucide-react";
import { PRESET_COLORS } from "@/lib/diagrams/constants";

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
}

/** Border line styles offered in the style popover (US5: Solid / Dashed / Dotted / Large Dashed). */
const BORDER_STYLES: Array<{ id: string; label: string; dash: string }> = [
  { id: "solid", label: "Solid", dash: "" },
  { id: "dashed", label: "Dashed", dash: "5 5" },
  { id: "dotted", label: "Dotted", dash: "2 3" },
  { id: "large", label: "Large Dashed", dash: "12 8" },
];

/**
 * Inline floating toolbar shown when an ER entity is single-clicked. Exposes:
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

  const activeDash = (currentStyle["stroke-dasharray"] ?? "").trim();
  const activeBorderStyle =
    BORDER_STYLES.find((b) => b.dash === activeDash)?.id ?? (activeDash ? "dashed" : "solid");

  const applyBorderStyle = (dash: string) => {
    // A dashed/dotted border reads best with a slightly heavier stroke; solid resets the width.
    onSetStyle({ "stroke-dasharray": dash, "stroke-width": dash ? "2px" : "" });
  };

  // A swatch row (rendered via a plain function call, NOT a nested component, so it does not
  // violate the react-hooks/static-components rule — mirrors the `renderSection` pattern used by
  // ClassPropertyPanel).
  const renderColorRow = (label: string, prop: "stroke" | "color" | "fill") => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => {
          const isActive = (currentStyle[prop] ?? "").toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => onSetStyle({ [prop]: isActive ? "" : c.value })}
              className={`relative h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
                isActive ? "border-indigo-500 ring-2 ring-indigo-500/40" : "border-border"
              } ${c.value === "transparent" ? "bg-white dark:bg-slate-800" : ""}`}
              style={c.value === "transparent" ? undefined : { backgroundColor: c.value }}
            >
              {c.value === "transparent" && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                  ø
                </span>
              )}
              {isActive && c.value !== "transparent" && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

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
            <div
              className="absolute left-0 bottom-full z-40 mb-2 flex w-64 flex-col gap-3 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Border
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {BORDER_STYLES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => applyBorderStyle(b.dash)}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm font-medium transition-colors ${
                        activeBorderStyle === b.id
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "border-border text-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="truncate">{b.label}</span>
                      <svg width="34" height="6" className="shrink-0">
                        <line
                          x1="1"
                          y1="3"
                          x2="33"
                          y2="3"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeDasharray={b.dash || undefined}
                        />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {renderColorRow("Border color", "stroke")}
              {renderColorRow("Text color", "color")}
              {renderColorRow("Fill", "fill")}

              <button
                type="button"
                onClick={() => {
                  onResetStyle();
                  setStyleOpen(false);
                }}
                className="mt-0.5 flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Reset style
              </button>
            </div>
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
