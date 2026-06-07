"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, GitBranch, Hash } from "lucide-react";
import {
  CLASS_END_MARKERS,
  ClassEndMarker,
  ClassLineStyle,
  classRelationshipFromEdgeDataId,
  parseClassRelationshipOperator,
  buildClassRelationshipOperator,
} from "@/lib/diagrams/classDiagram";

interface ClassEdgeToolbarProps {
  selectedNodeId: string | null; // `CLASS_EDGE_id_<Src>_<Dst>_<N>`
  code: string;
  scale: number;
  onUpdateRelationshipType: (operator: string) => void;
  onSetCardinality: (sourceCard: string, targetCard: string) => void;
  onDeleteRelationship: () => void;
}

// Cardinality presets ("" renders as the clear/none chip).
const CARDINALITY_PRESETS = ["", "1", "0..1", "*", "1..*", "0..*", "n"];

// Glyphs used in the per-end marker selectors (left = source end, right = target end).
const MARKER_GLYPH: Record<ClassEndMarker, { left: string; right: string }> = {
  none: { left: "—", right: "—" },
  arrow: { left: "◀", right: "▶" },
  triangle: { left: "◁", right: "▷" },
  diamondFilled: { left: "◆", right: "◆" },
  diamondHollow: { left: "◇", right: "◇" },
};

export function ClassEdgeToolbar({
  selectedNodeId,
  code,
  scale,
  onUpdateRelationshipType,
  onSetCardinality,
  onDeleteRelationship,
}: ClassEdgeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Menu-first UX: the bar shows only the Relationship / Cardinality choices; clicking one opens
  // the corresponding panel as a popover. `null` = no panel open (compact bar only).
  const [openPanel, setOpenPanel] = useState<"relationship" | "cardinality" | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

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

  // Close the open panel on an outside click (the custom-cardinality modal manages its own state).
  useEffect(() => {
    if (!openPanel) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [openPanel]);

  // Reset transient UI when the selected edge changes.
  useEffect(() => {
    setOpenPanel(null);
    setCustomOpen(false);
  }, [selectedNodeId]);

  const dataId = selectedNodeId?.replace("CLASS_EDGE_", "") ?? null;
  const rel = classRelationshipFromEdgeDataId(code, dataId);

  // If the edge can no longer be resolved (e.g. it was just deleted) render nothing.
  if (!rel) return null;

  const parts = parseClassRelationshipOperator(rel.operator);

  const applyParts = (next: Partial<typeof parts>) =>
    onUpdateRelationshipType(buildClassRelationshipOperator({ ...parts, ...next }));

  const setLineStyle = (lineStyle: ClassLineStyle) => applyParts({ lineStyle });

  const btnCls =
    "pointer-events-auto flex items-center justify-center h-8 rounded-md px-2.5 gap-1.5 whitespace-nowrap text-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
  // Menu trigger: highlighted (filled) while its panel is open so the active choice is obvious.
  const triggerCls = (active: boolean) =>
    `pointer-events-auto flex items-center gap-1.5 h-8 rounded-md px-3 text-sm font-semibold transition-colors ${
      active ? "bg-indigo-600 text-white shadow-sm" : "text-foreground hover:bg-accent"
    }`;

  const renderMarkerRow = (end: "source" | "target") => {
    const current = end === "source" ? parts.sourceMarker : parts.targetMarker;
    return (
      <div className="flex items-center gap-1">
        {CLASS_END_MARKERS.map((m) => {
          const active = current === m.key;
          return (
            <button
              key={m.key}
              type="button"
              title={m.label}
              onClick={() =>
                applyParts(end === "source" ? { sourceMarker: m.key } : { targetMarker: m.key })
              }
              className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-base transition-colors hover:bg-accent ${
                active ? "border-indigo-500 bg-accent ring-1 ring-indigo-500" : "border-border"
              }`}
            >
              {MARKER_GLYPH[m.key][end === "source" ? "left" : "right"]}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-class-edge-toolbar
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
      <div className="flex w-max items-center gap-1 rounded-xl border border-border bg-background px-2 py-1.5 shadow-lg">
        {/* Source → target context label */}
        <span className="mr-1 flex items-center gap-1 px-1 font-mono text-sm font-semibold text-muted-foreground">
          <span className="text-foreground">{rel.source}</span>
          <span>→</span>
          <span className="text-foreground">{rel.target}</span>
        </span>
        <div className="mx-0.5 h-5 w-px bg-border" />

        {/* Relationship menu trigger + popover */}
        <div className="relative">
          <button
            type="button"
            className={triggerCls(openPanel === "relationship")}
            title="Edit relationship type"
            onMouseDownCapture={(e) => {
              // Toggle on capture-phase mousedown — a transient toolbar reflow can swallow
              // the native click near the button edge (same rationale as the sequence toolbar).
              e.stopPropagation();
              setOpenPanel((p) => (p === "relationship" ? null : "relationship"));
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Relationship
          </button>

          {openPanel === "relationship" && (
            <div
              className="absolute left-0 bottom-full z-40 mb-2 w-max rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2.5">
                {/* Line style segmented control */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Line
                  </span>
                  {(["solid", "dashed"] as ClassLineStyle[]).map((ls) => (
                    <button
                      key={ls}
                      type="button"
                      title={ls === "solid" ? "Solid line" : "Dashed line"}
                      onClick={() => setLineStyle(ls)}
                      className={`flex h-7 w-11 items-center justify-center rounded-md border transition-colors hover:bg-accent ${
                        parts.lineStyle === ls
                          ? "border-indigo-500 bg-accent ring-1 ring-indigo-500"
                          : "border-border"
                      }`}
                    >
                      <svg width="24" height="2" viewBox="0 0 24 2" aria-hidden="true">
                        <line
                          x1="1"
                          y1="1"
                          x2="23"
                          y2="1"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeDasharray={ls === "dashed" ? "4 3" : undefined}
                        />
                      </svg>
                    </button>
                  ))}
                </div>

                {/* Per-end marker selectors — always visible so any relationship type can be
                    composed directly from the two ends + line style (the preset grid is gone). */}
                <div className="flex flex-col gap-2 border-t border-border pt-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Source end
                    </span>
                    {renderMarkerRow("source")}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Target end
                    </span>
                    {renderMarkerRow("target")}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cardinality menu trigger + popover */}
        <div className="relative">
          <button
            type="button"
            className={triggerCls(openPanel === "cardinality")}
            title="Edit cardinality"
            onMouseDownCapture={(e) => {
              e.stopPropagation();
              setOpenPanel((p) => (p === "cardinality" ? null : "cardinality"));
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Hash className="h-3.5 w-3.5" />
            Cardinality
          </button>

          {openPanel === "cardinality" && (
            <div
              className="absolute left-0 bottom-full z-40 mb-2 w-max rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2.5">
                {(["source", "target"] as const).map((end) => {
                  const currentCard = end === "source" ? rel.sourceCard : rel.targetCard;
                  return (
                    <div key={end} className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {end === "source" ? `Source · ${rel.source}` : `Target · ${rel.target}`}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {CARDINALITY_PRESETS.map((preset) => {
                          const active = currentCard === preset;
                          return (
                            <button
                              key={preset || "none"}
                              type="button"
                              onClick={() =>
                                end === "source"
                                  ? onSetCardinality(preset, rel.targetCard)
                                  : onSetCardinality(rel.sourceCard, preset)
                              }
                              className={`flex h-7 min-w-[2.25rem] items-center justify-center rounded-md border px-2 font-mono text-sm transition-colors hover:bg-accent ${
                                active
                                  ? "border-indigo-500 bg-accent ring-1 ring-indigo-500"
                                  : "border-border"
                              }`}
                            >
                              {preset === "" ? "—" : preset}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-2.5">
                  <button
                    type="button"
                    onClick={() => setCustomOpen(true)}
                    className="pointer-events-auto flex h-8 w-full items-center justify-center rounded-md border border-border text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    Custom…
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          className={`${btnCls} hover:bg-red-500/10 hover:text-red-500`}
          title="Delete relationship"
          onClick={onDeleteRelationship}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {customOpen && (
        <CardinalityModal
          source={rel.source}
          target={rel.target}
          initialSource={rel.sourceCard}
          initialTarget={rel.targetCard}
          onCancel={() => setCustomOpen(false)}
          onSave={(s, t) => {
            onSetCardinality(s, t);
            setCustomOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Custom-cardinality dialog, portalled to <body> so the toolbar's `scale()` transform can't shrink it. */
function CardinalityModal({
  source,
  target,
  initialSource,
  initialTarget,
  onCancel,
  onSave,
}: {
  source: string;
  target: string;
  initialSource: string;
  initialTarget: string;
  onCancel: () => void;
  onSave: (sourceCard: string, targetCard: string) => void;
}) {
  const [sourceCard, setSourceCard] = useState(initialSource);
  const [targetCard, setTargetCard] = useState(initialTarget);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const inputCls =
    "h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-[320px] rounded-xl border border-border bg-background p-4 shadow-2xl">
        <div className="mb-3 text-base font-semibold text-foreground">Custom cardinality</div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source · {source}
            </span>
            <input
              autoFocus
              className={inputCls}
              value={sourceCard}
              placeholder="e.g. 1, 0..1, *"
              onChange={(e) => setSourceCard(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(sourceCard, targetCard);
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Target · {target}
            </span>
            <input
              className={inputCls}
              value={targetCard}
              placeholder="e.g. 1, 1..*, n"
              onChange={(e) => setTargetCard(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(sourceCard, targetCard);
              }}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(sourceCard, targetCard)}
            className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
