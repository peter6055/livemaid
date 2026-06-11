"use client";

import { useEffect, useRef, useState } from "react";
import {
  Trash2,
  Pencil,
  Palette,
  Check,
  StickyNote,
  Boxes,
  FolderInput,
  FolderOutput,
  Plus,
  FlipHorizontal,
  Square,
  Diamond,
  Split,
  Merge,
} from "lucide-react";
import { PRESET_COLORS } from "@/lib/diagrams/constants";
import type { StateNodeShapeKind } from "@/lib/diagrams/stateDiagram";

interface StateNodeToolbarProps {
  /** Which kind of element is selected — drives the tooltip + available actions. */
  kind: "state" | "composite" | "note";
  scale: number;
  /** Open the inline label editor (states / composites / notes are all renamable). */
  onRename?: (e: React.MouseEvent) => void;
  onDelete: () => void;

  /* Phase 4 — per-node styling (states + composites + choice/fork/join). */
  currentStyle?: Record<string, string>;
  onSetStyle?: (patch: Record<string, string>) => void;
  onResetStyle?: () => void;

  /* Phase 4 — quick annotation: pick a side, then attach a `note <side> of <id>` to the selected
     state/composite. The toolbar asks for placement (left/right) FIRST via a small popover. */
  onAddNote?: (position: "left" | "right") => void;

  /* Phase 4 — note left/right flip (note kind only). */
  notePosition?: "left" | "right";
  onFlipNote?: () => void;

  /* Phase 5 — composite nesting (states + composites). */
  composites?: string[];
  currentComposite?: string | null;
  onMoveIntoComposite?: (target: string) => void;
  onMoveToNewComposite?: () => void;
  onMoveToRoot?: () => void;

  /* Shape morphing (state nodes only; not notes/composites/concurrency dividers). */
  currentShape?: StateNodeShapeKind;
  onChangeShape?: (shape: StateNodeShapeKind) => void;

  /* Phase 5 — concurrency divider (composite kind only). */
  onAddConcurrencyDivider?: () => void;
}

/** Border line styles offered in the style popover (mirrors the ER customizer). */
const BORDER_STYLES: Array<{ id: string; label: string; dash: string }> = [
  { id: "solid", label: "Solid", dash: "" },
  { id: "dashed", label: "Dashed", dash: "5 5" },
  { id: "dotted", label: "Dotted", dash: "2 3" },
  { id: "large", label: "Large Dashed", dash: "12 8" },
];

const STATE_SHAPES: Array<{
  id: StateNodeShapeKind;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "state", label: "State", icon: <Square className="h-3.5 w-3.5" /> },
  { id: "choice", label: "Choice", icon: <Diamond className="h-3.5 w-3.5" /> },
  { id: "fork", label: "Fork", icon: <Split className="h-3.5 w-3.5" /> },
  { id: "join", label: "Join", icon: <Merge className="h-3.5 w-3.5" /> },
];

/**
 * Inline floating toolbar shown when a state node, composite container, or note is single-clicked on a
 * state diagram. Exposes (depending on the selected element):
 *  - Move into composite (state): nest under / between / out of a `state Parent { … }` block.
 *  - Style (state): a popover for border line-style + border / text / fill color, writing a
 *    localized `style <id> …` override (verified valid on simple / composite / choice nodes).
 *  - Add note (state): pick placement (left/right) in a popover, then attach a
 *    `note <side> of <id> : Add Text` annotation.
 *  - Flip (note): toggle a note between left / right (state notes are left/right only).
 *  - Rename (state/composite/note; omitted for shape-only choice/fork/join) + Delete (cascade).
 * Composite containers intentionally expose only Rename + Delete to keep the large container
 * toolbar minimal and avoid structural actions on the container shell.
 *
 * Mirrors the chrome of the other inline toolbars (scale-locked, `data-inline-toolbar`, capture-phase
 * native-event guard) so it never leaks clicks to the canvas underneath.
 */
export function StateNodeToolbar({
  kind,
  scale,
  onRename,
  onDelete,
  currentStyle = {},
  onSetStyle,
  onResetStyle,
  onAddNote,
  notePosition,
  onFlipNote,
  composites = [],
  currentComposite = null,
  onMoveIntoComposite,
  onMoveToNewComposite,
  onMoveToRoot,
  currentShape = "state",
  onChangeShape,
}: StateNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);

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

  // Close any open popover on an outside click.
  useEffect(() => {
    if (!styleOpen && !moveOpen && !noteOpen && !shapeOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setStyleOpen(false);
        setMoveOpen(false);
        setNoteOpen(false);
        setShapeOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [styleOpen, moveOpen, noteOpen, shapeOpen]);

  const deleteTitle =
    kind === "note" ? "Delete note" : kind === "composite" ? "Delete composite" : "Delete state";

  const activeDash = (currentStyle["stroke-dasharray"] ?? "").trim();
  const activeBorderStyle =
    BORDER_STYLES.find((b) => b.dash === activeDash)?.id ?? (activeDash ? "dashed" : "solid");
  const applyBorderStyle = (dash: string) =>
    onSetStyle?.({ "stroke-dasharray": dash, "stroke-width": dash ? "2px" : "" });

  // The composites the selected node can move INTO (everything except the one it already lives in;
  // the canvas filters out a composite-node's own name before passing `composites`).
  const moveTargets = composites.filter((n) => n !== currentComposite);
  const showStateActions = kind === "state";

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
              onClick={() => onSetStyle?.({ [prop]: isActive ? "" : c.value })}
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
        {/* Note flip (note kind) */}
        {kind === "note" && onFlipNote && (
          <button
            type="button"
            className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title={`Flip note to the ${notePosition === "left" ? "right" : "left"}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFlipNote();
            }}
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
            {notePosition === "left" ? "Flip right" : "Flip left"}
          </button>
        )}

        {/* Move into composite (state / composite) */}
        {showStateActions && onMoveIntoComposite && (
          <div className="relative">
            <button
              type="button"
              className={`pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
                moveOpen
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title="Move into composite"
              onMouseDownCapture={(e) => {
                e.stopPropagation();
                setMoveOpen((o) => !o);
                setStyleOpen(false);
                setNoteOpen(false);
                setShapeOpen(false);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Boxes className="h-3.5 w-3.5" />
              Composite
            </button>

            {moveOpen && (
              <div
                className="absolute left-0 bottom-full z-40 mb-2 flex w-52 flex-col gap-0.5 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Move into composite
                </div>

                {moveTargets.length === 0 && !onMoveToNewComposite && !currentComposite && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No composites</div>
                )}

                {moveTargets.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    onClick={() => {
                      setMoveOpen(false);
                      onMoveIntoComposite(n);
                    }}
                  >
                    <FolderInput className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{n}</span>
                  </button>
                ))}

                {currentComposite && (
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span className="truncate">{currentComposite}</span>
                  </div>
                )}

                {onMoveToNewComposite && (
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    onClick={() => {
                      setMoveOpen(false);
                      onMoveToNewComposite();
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    Create new
                  </button>
                )}

                {currentComposite && onMoveToRoot && (
                  <>
                    <div className="my-0.5 h-px w-full bg-border" />
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                      onClick={() => {
                        setMoveOpen(false);
                        onMoveToRoot();
                      }}
                    >
                      <FolderOutput className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      Move to root
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Style popover (state / composite / special) */}
        {showStateActions && onSetStyle && (
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
                setMoveOpen(false);
                setNoteOpen(false);
                setShapeOpen(false);
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

                {onResetStyle && (
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
                )}
              </div>
            )}
          </div>
        )}

        {/* Shape morphing (state nodes only). */}
        {showStateActions && onChangeShape && (
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
                setShapeOpen((o) => !o);
                setStyleOpen(false);
                setMoveOpen(false);
                setNoteOpen(false);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Square className="h-3.5 w-3.5" />
              Shape
            </button>

            {shapeOpen && (
              <div
                className="absolute left-0 bottom-full z-40 mb-2 grid w-44 grid-cols-2 gap-1.5 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {STATE_SHAPES.map((shape) => {
                  const active = currentShape === shape.id;
                  return (
                    <button
                      key={shape.id}
                      type="button"
                      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "border-border text-foreground hover:bg-accent"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShapeOpen(false);
                        onChangeShape(shape.id);
                      }}
                    >
                      {shape.icon}
                      <span>{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add note (state / composite) — pick placement (left/right) FIRST, then create. */}
        {showStateActions && onAddNote && (
          <div className="relative">
            <button
              type="button"
              className={`pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
                noteOpen
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title="Add note"
              onMouseDownCapture={(e) => {
                e.stopPropagation();
                setNoteOpen((o) => !o);
                setStyleOpen(false);
                setMoveOpen(false);
                setShapeOpen(false);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </button>

            {noteOpen && (
              <div
                className="absolute left-0 bottom-full z-40 mb-2 flex w-44 flex-col gap-0.5 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Note placement
                </div>
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground capitalize transition-colors hover:bg-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteOpen(false);
                      onAddNote(side);
                    }}
                  >
                    <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {side}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {onRename && (
          <>
            <div className="mx-0.5 h-4 w-px bg-border" />
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
          </>
        )}

        <div className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
