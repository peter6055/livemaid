"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Boxes, FolderInput, FolderOutput, Plus, Check } from "lucide-react";

interface ClassNodeToolbarProps {
  /** Which kind of element is selected — drives the available actions + tooltips. */
  kind: "class" | "note" | "namespace";
  scale: number;
  onDelete: () => void;
  /** Class-only "Move to namespace" controls. */
  namespaces?: string[];
  /** The namespace the selected class currently lives in (null = root scope). */
  currentNamespace?: string | null;
  onMoveToNamespace?: (target: string) => void;
  onMoveToNewNamespace?: () => void;
  onRemoveFromNamespace?: () => void;
  /** Open the property panel for the selected class. */
  onRename?: () => void;
}

/**
 * Minimal inline toolbar shown when a class node, note, or namespace container is single-clicked on
 * a class diagram. Exposes:
 *  - class:     Delete + "Move to namespace" (move in / out / between + create new).
 *  - note:      Delete.
 *  - namespace: Delete (unwraps the container, preserving its inner classes).
 *
 * Mirrors the floating-bar chrome of the other inline toolbars (scale-locked, `data-inline-toolbar`,
 * capture-phase native-event guard) so it never leaks clicks to the canvas.
 */
export function ClassNodeToolbar({
  kind,
  scale,
  onDelete,
  namespaces = [],
  currentNamespace = null,
  onMoveToNamespace,
  onMoveToNewNamespace,
  onRemoveFromNamespace,
  onRename,
}: ClassNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);

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

  // Close the move popover on an outside click.
  useEffect(() => {
    if (!moveOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setMoveOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [moveOpen]);

  const deleteTitle =
    kind === "note" ? "Delete note" : kind === "namespace" ? "Delete namespace" : "Delete class";
  // The namespaces the class can move INTO (everything except its current one).
  const targets = namespaces.filter((n) => n !== currentNamespace);

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
        {kind === "class" && onRename && (
          <>
            <button
              type="button"
              className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Edit class properties"
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
        {kind === "class" && (
          <div className="relative">
            <button
              type="button"
              className={`pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
                moveOpen
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title="Move to namespace"
              onMouseDownCapture={(e) => {
                e.stopPropagation();
                setMoveOpen((o) => !o);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Boxes className="h-3.5 w-3.5" />
              Namespace
            </button>

            {moveOpen && (
              <div
                className="absolute left-0 bottom-full z-40 mb-2 flex w-52 flex-col gap-0.5 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Move to namespace
                </div>

                {targets.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    onClick={() => {
                      setMoveOpen(false);
                      onMoveToNamespace?.(n);
                    }}
                  >
                    <FolderInput className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{n}</span>
                  </button>
                ))}

                {currentNamespace && (
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span className="truncate">{currentNamespace}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  onClick={() => {
                    setMoveOpen(false);
                    onMoveToNewNamespace?.();
                  }}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  Create new
                </button>

                {currentNamespace && (
                  <>
                    <div className="my-0.5 h-px w-full bg-border" />
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                      onClick={() => {
                        setMoveOpen(false);
                        onRemoveFromNamespace?.();
                      }}
                    >
                      <FolderOutput className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      Remove from namespace
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
