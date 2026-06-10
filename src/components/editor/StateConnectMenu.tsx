"use client";

import { useEffect, useRef } from "react";
import { Boxes, Circle, CircleDot, Diamond, Merge, Split, Square, StickyNote } from "lucide-react";
import type { StateShapeKind } from "@/lib/diagrams/stateDiagram";

export interface StateConnectMenuState {
  /** canvasShell-relative position (viewport space) of the drop point. */
  x: number;
  y: number;
  /** The dragged-from state (the transition source). */
  source: string;
}

interface StateConnectMenuProps {
  state: StateConnectMenuState;
  /** Picked a shape → create it and link `source --> <shape>`. */
  onPick: (kind: StateShapeKind) => void;
  onClose: () => void;
  /** A root-level Start (`[*] -->`) already exists — disable the Start tile (BUG-STATE-004). */
  hasStart?: boolean;
  /** A root-level End (`--> [*]`) already exists — disable the End tile (BUG-STATE-004). */
  hasEnd?: boolean;
}

const SHAPES: Array<{ kind: StateShapeKind; label: string; icon: React.ReactNode }> = [
  { kind: "state", label: "State", icon: <Square className="h-4 w-4" /> },
  { kind: "start", label: "Start", icon: <Circle className="h-4 w-4" /> },
  { kind: "end", label: "End", icon: <CircleDot className="h-4 w-4" /> },
  { kind: "choice", label: "Choice", icon: <Diamond className="h-4 w-4" /> },
  { kind: "fork", label: "Fork", icon: <Split className="h-4 w-4" /> },
  { kind: "join", label: "Join", icon: <Merge className="h-4 w-4" /> },
  { kind: "composite", label: "Composite", icon: <Boxes className="h-4 w-4" /> },
  { kind: "note", label: "Note", icon: <StickyNote className="h-4 w-4" /> },
];

/**
 * Contextual popover shown at the drop point of a state-diagram connection drag onto empty canvas.
 * Asks WHICH shape to create; the chosen shape is created and linked from the dragged-from state via
 * a single transition (full parity with the Shape toolbox — see `addShapeWithTransition`). Rendered
 * outside the TransformWrapper at canvasShell level (viewport coords), theme-aware (light/dark) to
 * match the Shape toolbox tiles. Closes on outside click or Escape.
 */
export function StateConnectMenu({
  state,
  onPick,
  onClose,
  hasStart,
  hasEnd,
}: StateConnectMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer so the same mouseup that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-state-connect-menu
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute z-50 flex w-56 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl"
      style={{
        left: Math.max(8, state.x),
        top: Math.max(8, state.y + 8),
        transform: "translateX(-50%)",
      }}
    >
      <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
        Connect <span className="font-mono text-foreground">{state.source}</span> to…
      </p>
      <div className="grid grid-cols-3 gap-2 p-2 pt-0">
        {SHAPES.map((s) => {
          const disabled = (s.kind === "start" && !!hasStart) || (s.kind === "end" && !!hasEnd);
          return (
            <button
              key={s.kind}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.kind)}
              title={
                disabled
                  ? `Only one ${s.label.toLowerCase()} node is allowed`
                  : `Create ${s.label.toLowerCase()}`
              }
              className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background p-1 text-foreground hover:border-indigo-400 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-background"
            >
              {s.icon}
              <span className="text-[10px] font-medium leading-none">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
