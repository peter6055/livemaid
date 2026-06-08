"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, GitBranch, Hash, Pencil } from "lucide-react";
import {
    erRelationshipFromEdgeDataId,
    parseErOperator,
    buildErOperator,
    ER_SOURCE_CARDINALITIES,
    ER_TARGET_CARDINALITIES,
    ER_LINE_STYLES,
} from "@/lib/diagrams/erDiagram";

interface ErEdgeToolbarProps {
    selectedNodeId: string | null; // `ER_EDGE_id_<src>_<dst>_<N>`
    code: string;
    scale: number;
    /** Commit a new full 6-char operator (left-card + line + right-card). */
    onUpdateOperator: (operator: string) => void;
    /** Enter inline label editing for this edge (mirrors the flowchart edge toolbar's pencil). */
    onEditLabel: (e: React.MouseEvent) => void;
    onDeleteRelationship: () => void;
}

/**
 * Floating toolbar shown when an ER relationship edge is selected. Provides:
 *  - **Style** (US2): the relationship line — Identifying (solid `--`) vs Non-identifying (dashed `..`).
 *  - **Cardinality** (US3): separate Source / Target crow's-foot pickers (zero-or-one `|o`/`o|`,
 *    exactly-one `||`, zero-or-more `}o`/`o{`, one-or-more `}|`/`|{`).
 *  - **Edit label** (US4): a pencil that opens the inline label editor (double-click also works).
 *  - **Delete** (US2): removes the relationship line.
 *
 * Mirrors `ClassEdgeToolbar`'s menu-first chrome (scale-locked, `data-inline-toolbar`, capture-phase
 * toggles, outside-click close). Every pick rebuilds the operator with `buildErOperator` and routes
 * through `onUpdateOperator` (a single Monaco undo step), so the canvas + code stay in sync.
 */
export function ErEdgeToolbar({
    selectedNodeId,
    code,
    scale,
    onUpdateOperator,
    onEditLabel,
    onDeleteRelationship,
}: ErEdgeToolbarProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [openPanel, setOpenPanel] = useState<"style" | "cardinality" | null>(null);

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

    // Close the open panel on an outside click.
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

    const dataId = selectedNodeId?.replace("ER_EDGE_", "") ?? null;
    const rel = erRelationshipFromEdgeDataId(code, dataId);

    // If the edge can no longer be resolved (e.g. it was just deleted) render nothing.
    if (!rel) return null;

    const parts = parseErOperator(rel.operator);

    const setLine = (line: string) =>
        onUpdateOperator(buildErOperator(parts.left, line, parts.right));
    const setSourceCard = (left: string) =>
        onUpdateOperator(buildErOperator(left, parts.line, parts.right));
    const setTargetCard = (right: string) =>
        onUpdateOperator(buildErOperator(parts.left, parts.line, right));

    const btnCls =
        "pointer-events-auto flex items-center justify-center h-8 rounded-md px-2.5 gap-1.5 whitespace-nowrap text-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
    const triggerCls = (active: boolean) =>
        `pointer-events-auto flex items-center gap-1.5 h-8 rounded-md px-3 text-sm font-semibold transition-colors ${active ? "bg-indigo-600 text-white shadow-sm" : "text-foreground hover:bg-accent"
        }`;

    const renderCardColumn = (
        end: "source" | "target",
        options: Array<{ value: string; label: string }>,
    ) => {
        const current = end === "source" ? parts.left : parts.right;
        const onPick = end === "source" ? setSourceCard : setTargetCard;
        return (
            <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {end === "source" ? `Source · ${rel.source}` : `Target · ${rel.target}`}
                </span>
                <div className="flex flex-col gap-1">
                    {options.map((opt) => {
                        const active = current === opt.value;
                        return (
                            <button
                                key={opt.value + end}
                                type="button"
                                title={opt.label}
                                onClick={() => onPick(opt.value)}
                                className={`flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-accent ${active ? "border-indigo-500 bg-accent ring-1 ring-indigo-500" : "border-border"
                                    }`}
                            >
                                <span className="w-7 shrink-0 text-center font-mono text-sm text-foreground">
                                    {opt.value}
                                </span>
                                <span className="text-sm text-foreground">{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            data-scale-lock
            data-inline-toolbar
            data-er-edge-toolbar
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
            <div className="flex w-max min-w-[16rem] max-w-[24rem] flex-col gap-1 rounded-xl border border-border bg-background px-2 py-1.5 shadow-lg">
                {/* Row 1 — indicator: source → target. */}
                <div className="flex min-w-0 items-center gap-1 px-1 font-mono text-sm font-semibold">
                    <span className="truncate text-foreground">{rel.source}</span>
                    <span className="shrink-0 text-muted-foreground">→</span>
                    <span className="truncate text-foreground">{rel.target}</span>
                </div>

                <div className="h-px w-full bg-border" />

                {/* Row 2 — controls: Style / Cardinality / Edit label / Delete. */}
                <div className="flex items-center gap-1">
                    {/* Style (line) menu trigger + popover */}
                    <div className="relative">
                        <button
                            type="button"
                            className={triggerCls(openPanel === "style")}
                            title="Edit relationship line style"
                            onMouseDownCapture={(e) => {
                                e.stopPropagation();
                                setOpenPanel((p) => (p === "style" ? null : "style"));
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GitBranch className="h-3.5 w-3.5" />
                            Style
                        </button>

                        {openPanel === "style" && (
                            <div
                                className="absolute left-0 bottom-full z-40 mb-12 w-max rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Line
                                    </span>
                                    <div className="flex flex-col gap-1">
                                        {ER_LINE_STYLES.map((ls) => {
                                            const active = parts.line === ls.value;
                                            return (
                                                <button
                                                    key={ls.value}
                                                    type="button"
                                                    onClick={() => setLine(ls.value)}
                                                    className={`flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-accent ${active
                                                            ? "border-indigo-500 bg-accent ring-1 ring-indigo-500"
                                                            : "border-border"
                                                        }`}
                                                >
                                                    <svg width="30" height="2" viewBox="0 0 30 2" aria-hidden="true">
                                                        <line
                                                            x1="1"
                                                            y1="1"
                                                            x2="29"
                                                            y2="1"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeDasharray={ls.value === ".." ? "4 3" : undefined}
                                                        />
                                                    </svg>
                                                    <span className="text-sm text-foreground">{ls.label}</span>
                                                </button>
                                            );
                                        })}
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
                                className="absolute left-0 bottom-full z-40 mb-12 flex w-max gap-4 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {renderCardColumn("source", ER_SOURCE_CARDINALITIES)}
                                {renderCardColumn("target", ER_TARGET_CARDINALITIES)}
                            </div>
                        )}
                    </div>

                    <div className="mx-0.5 h-5 w-px bg-border" />

                    <button type="button" className={btnCls} title="Edit label" onClick={onEditLabel}>
                        <Pencil className="h-3.5 w-3.5" />
                    </button>

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
