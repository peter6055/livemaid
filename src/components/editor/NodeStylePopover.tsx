"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { COLOR_FAMILIES } from "@/lib/diagrams/constants";

interface NodeStylePopoverProps {
  currentStyle: Record<string, string>;
  onSetStyle: (patch: Record<string, string>) => void;
  onResetStyle: () => void;
  showBorderStyle: boolean;
}

/** Border line styles offered in the style popover (Solid / Dashed / Dotted / Large Dashed). */
const BORDER_STYLES: Array<{ id: string; label: string; dash: string }> = [
  { id: "solid", label: "Solid", dash: "" },
  { id: "dashed", label: "Dashed", dash: "5 5" },
  { id: "dotted", label: "Dotted", dash: "2 3" },
  { id: "large", label: "Large Dashed", dash: "12 8" },
];

/**
 * Shared node style popover panel (border line-style, border/text/fill color swatches, reset).
 * Renders only the popover body — each consuming toolbar supplies its own trigger + open state.
 *
 * Border color / Text color use the STRONG shade of each `COLOR_FAMILIES` entry; Fill uses the
 * LIGHT shade plus an explicit `Transparent` swatch (Mermaid `fill:transparent`, distinct from
 * toggling a tint off, which removes the property). The border-style grid renders only when
 * `showBorderStyle` is true (currently only state diagrams expose it; flowchart/class/ER do not).
 */
export function NodeStylePopover({
  currentStyle,
  onSetStyle,
  onResetStyle,
  showBorderStyle,
}: NodeStylePopoverProps) {
  const activeDash = (currentStyle["stroke-dasharray"] ?? "").trim();
  const activeBorderStyle =
    BORDER_STYLES.find((b) => b.dash === activeDash)?.id ?? (activeDash ? "dashed" : "solid");

  // The popover opens upward by default, but the fixed editor chrome (header + top toolbox) sits
  // in a higher stacking context and would cover it. If the opened panel would poke into that
  // zone AND there is room below the trigger, flip it to open downward instead.
  const popRef = useRef<HTMLDivElement | null>(null);
  const [flipDown, setFlipDown] = useState(false);
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const chromeBottom =
      document.querySelector(".top-4.left-4")?.getBoundingClientRect().bottom ?? 0;
    // Measure available space below the TRIGGER container (the panel, when rendered upward, sits
    // *above* the trigger, so its own rect.bottom is not the right probe for downward space).
    const triggerBottom = el.parentElement?.getBoundingClientRect().bottom ?? 0;
    if (rect.top < chromeBottom + 8 && window.innerHeight - triggerBottom > rect.height) {
      setFlipDown(true);
    }
  }, []);

  const applyBorderStyle = (dash: string) => {
    // A dashed/dotted border reads best with a slightly heavier stroke; solid resets the width.
    onSetStyle({ "stroke-dasharray": dash, "stroke-width": dash ? "2px" : "" });
  };

  // A swatch row (rendered via a plain function call, NOT a nested component, so it does not
  // violate the react-hooks/static-components rule — mirrors the `renderColorRow` pattern used by
  // the toolbars).
  const renderColorRow = (label: string, prop: "stroke" | "color" | "fill") => {
    const swatches = COLOR_FAMILIES.map((f) => ({
      name: f.name,
      value: prop === "fill" ? f.light : f.strong,
    }));
    // Fill also exposes an explicit `Transparent` (fill:transparent) entry — a deliberate choice
    // that is NOT the same as toggling a tint off (which removes the property entirely).
    if (prop === "fill") swatches.push({ name: "Transparent", value: "transparent" });
    const activeValue = (currentStyle[prop] ?? "").toLowerCase();
    const active = swatches.find((c) => c.value.toLowerCase() === activeValue);
    // White checks vanish on the light fill tints — darken them there.
    const checkClass = prop === "fill" ? "text-slate-700" : "text-white drop-shadow";

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {active && (
            <code className="font-mono text-[10px] font-medium uppercase text-muted-foreground/80">
              {active.value}
            </code>
          )}
        </div>
        <div className={`grid gap-1.5 ${prop === "fill" ? "grid-cols-10" : "grid-cols-9"}`}>
          {swatches.map((c) => {
            const isActive = activeValue === c.value.toLowerCase();
            const isTransparent = c.value === "transparent";
            return (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onClick={() => onSetStyle({ [prop]: isActive ? "" : c.value })}
                data-transparent-swatch={isTransparent || undefined}
                className={`relative h-7 w-7 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? "border-indigo-500 ring-2 ring-indigo-500/40"
                    : "border-black/10 dark:border-white/15"
                }`}
                style={{
                  backgroundColor: isTransparent ? undefined : c.value,
                  ...(isTransparent
                    ? {
                        // Convey transparency with a diagonal slash pattern instead of a solid.
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent 0 3px, rgba(0,0,0,0.08) 3px 6px)",
                      }
                    : {}),
                }}
              >
                {isActive && <Check className={`absolute inset-0 m-auto h-4 w-4 ${checkClass}`} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={popRef}
      className={`absolute left-0 z-40 flex w-[21rem] flex-col gap-3.5 rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-xl ${
        flipDown ? "top-full mt-2" : "bottom-full mb-2"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {showBorderStyle && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Border
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {BORDER_STYLES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => applyBorderStyle(b.dash)}
                className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  activeBorderStyle === b.id
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "border-border text-foreground hover:bg-accent"
                }`}
              >
                <span className="whitespace-nowrap">{b.label}</span>
                <svg width="26" height="6" className="shrink-0">
                  <line
                    x1="1"
                    y1="3"
                    x2="25"
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
      )}

      {renderColorRow("Border color", "stroke")}
      {renderColorRow("Text color", "color")}
      {renderColorRow("Fill", "fill")}

      <button
        type="button"
        onClick={onResetStyle}
        className="mt-0.5 flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset style
      </button>
    </div>
  );
}
