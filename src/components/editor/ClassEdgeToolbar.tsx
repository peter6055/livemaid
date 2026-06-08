"use client";

import { useEffect, useRef, useState } from "react";
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
      <div className="flex w-max min-w-[16rem] max-w-[22rem] flex-col gap-1 rounded-xl border border-border bg-background px-2 py-1.5 shadow-lg">
        {/* Row 1 — indicator: source → target. Truncates when the class names are too long. */}
        <div className="flex min-w-0 items-center gap-1 px-1 font-mono text-sm font-semibold">
          <span className="truncate text-foreground">{rel.source}</span>
          <span className="shrink-0 text-muted-foreground">→</span>
          <span className="truncate text-foreground">{rel.target}</span>
        </div>

        <div className="h-px w-full bg-border" />

        {/* Row 2 — controls: Relationship / Cardinality / Delete. */}
        <div className="flex items-center gap-1">
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
                className="absolute left-0 bottom-full z-40 mb-12 w-max rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
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
                className="absolute left-0 bottom-full z-40 mb-12 w-64 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-4">
                  {(["source", "target"] as const).map((end) => {
                    const currentCard = end === "source" ? rel.sourceCard : rel.targetCard;
                    // The custom input is "active" (shows the value) when the current cardinality is
                    // something the user typed rather than one of the presets.
                    const isCustom =
                      currentCard !== "" && !CARDINALITY_PRESETS.includes(currentCard);
                    return (
                      <div key={end} className="flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {end === "source" ? `Source · ${rel.source}` : `Target · ${rel.target}`}
                        </span>
                        {/* 4-column grid → the 7 presets + the custom input lay out as two rows. */}
                        <div className="grid grid-cols-4 gap-2">
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
                                className={`flex h-7 items-center justify-center rounded-md border px-2 font-mono text-sm transition-colors hover:bg-accent ${
                                  active
                                    ? "border-indigo-500 bg-accent ring-1 ring-indigo-500"
                                    : "border-border"
                                }`}
                              >
                                {preset === "" ? "—" : preset}
                              </button>
                            );
                          })}
                          {/* Last option: free-type a custom cardinality (commits on Enter / blur). */}
                          <CustomCardInput
                            key={`${selectedNodeId}-${end}`}
                            value={isCustom ? currentCard : ""}
                            active={isCustom}
                            onCommit={(v) =>
                              end === "source"
                                ? onSetCardinality(v, rel.targetCard)
                                : onSetCardinality(rel.sourceCard, v)
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
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
      </div>
    </div>
  );
}

/**
 * The last cardinality "option" in each row: a free-type input for any value the presets don't
 * cover (e.g. `2..4`, `0..n`). Maintains its own draft so typing doesn't re-render the whole edge;
 * commits on Enter / blur and reverts on Escape. Remounted per edge+end via a `key`, so the seeded
 * value always matches the freshly selected relationship.
 */
function CustomCardInput({
  value,
  active,
  onCommit,
}: {
  value: string;
  active: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  const commit = () => {
    if (draft !== value) onCommit(draft.trim());
  };

  return (
    <input
      value={draft}
      placeholder="type…"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      title="Type a custom cardinality"
      className={`h-7 w-full min-w-0 rounded-md border bg-background px-1.5 text-center font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-indigo-500 ${
        active ? "border-indigo-500 ring-1 ring-indigo-500" : "border-border hover:bg-accent"
      }`}
    />
  );
}
