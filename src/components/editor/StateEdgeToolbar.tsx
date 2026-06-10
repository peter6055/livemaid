"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { stateTransitionFromEdgeDataId } from "@/lib/diagrams/stateDiagram";

interface StateEdgeToolbarProps {
  selectedNodeId: string | null; // `STATE_EDGE_edge<N>`
  code: string;
  scale: number;
  onDeleteTransition: () => void;
}

/**
 * Floating toolbar shown when a state-diagram transition is selected. A transition carries only a
 * label (the arrow is always `-->`), which is editable by double-clicking the edge, so the toolbar
 * offers a single Delete action. Mirrors the other inline toolbars' chrome (scale-locked,
 * `data-inline-toolbar`, capture-phase native-event guard, outside-click safe).
 */
export function StateEdgeToolbar({
  selectedNodeId,
  code,
  scale,
  onDeleteTransition,
}: StateEdgeToolbarProps) {
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

  const rel = stateTransitionFromEdgeDataId(
    code,
    selectedNodeId?.replace("STATE_EDGE_", "") ?? null,
  );
  // If the transition can no longer be resolved (e.g. it was just deleted) render nothing.
  if (!rel) return null;

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-inline-toolbar
      data-state-edge-toolbar
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
        <button
          type="button"
          className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="Delete transition"
          onClick={onDeleteTransition}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
