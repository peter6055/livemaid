import { useEffect, useRef } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TimelineDirection, TimelineNode } from "@/lib/diagrams/timeline";

interface TimelineNodeToolbarProps {
  scale: number;
  node: TimelineNode;
  direction: TimelineDirection;
  onAddEvent: (placement: "before" | "after") => void;
  onAddPeriod: (placement: "before" | "after") => void;
  onAddSection: (placement: "before" | "after") => void;
  onEditLabel: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

interface TimelineAddButtonsProps {
  scale: number;
  node: TimelineNode;
  direction: TimelineDirection;
  onAddEvent: (placement: "before" | "after") => void;
  onAddPeriod: (placement: "before" | "after") => void;
  onAddSection: (placement: "before" | "after") => void;
}

type TimelineAddAxis = "left" | "right" | "top" | "bottom";

type TimelineAddAction =
  | { kind: "event"; placement: "before" | "after" }
  | { kind: "period"; placement: "before" | "after" }
  | { kind: "section"; placement: "before" | "after" }
  | { kind: "period-to-section" }
  | { kind: "event-to-period" };

/**
 * Map a selected node + diagram direction to the edge `+` buttons.
 *
 * - Sections and Periods get "before"/"after" buttons on the timeline's main
 *   axis (LR: left/right, TD: top/bottom) and a child-add button on the
 *   perpendicular axis (LR: bottom, TD: right): section→add first period,
 *   period→add first event. The child button only appears when the child
 *   collection is empty.
 * - Events stack inside their period column, so their "before"/"after" buttons
 *   are always on the perpendicular axis (LR: top/bottom, TD: top/bottom).
 *   The first event of a period has no earlier sibling, so only the bottom
 *   (add-after) button is shown for it.
 */
export function timelineAddAxes(
  node: TimelineNode,
  direction: TimelineDirection,
): Array<{ side: TimelineAddAxis; action: TimelineAddAction }> {
  const horizontal = direction === "LR";
  const main: [TimelineAddAxis, TimelineAddAxis] = horizontal
    ? ["left", "right"]
    : ["top", "bottom"];
  const childSide: TimelineAddAxis = horizontal ? "bottom" : "right";

  if (node.kind === "event") {
    return node.eventIndex === 0
      ? [{ side: "bottom", action: { kind: "event", placement: "after" } }]
      : [
          { side: "top", action: { kind: "event", placement: "before" } },
          { side: "bottom", action: { kind: "event", placement: "after" } },
        ];
  }

  const placementBase =
    node.kind === "period" ? { kind: "period" as const } : { kind: "section" as const };
  const buttons: Array<{ side: TimelineAddAxis; action: TimelineAddAction }> = [
    { side: main[0], action: { ...placementBase, placement: "before" as const } },
    { side: main[1], action: { ...placementBase, placement: "after" as const } },
  ];

  const hasNoChildren = node.kind === "period" ? node.events.length === 0 : node.periods.length === 0;
  if (hasNoChildren) {
    buttons.push({
      side: childSide,
      action: node.kind === "period" ? { kind: "event-to-period" } : { kind: "period-to-section" },
    });
  }
  return buttons;
}

const EDGE_POSITION: Record<TimelineAddAxis, React.CSSProperties> = {
  left: { left: 0, top: "50%" },
  right: { right: 0, top: "50%" },
  top: { left: "50%", top: 0 },
  bottom: { left: "50%", bottom: 0 },
};

const EDGE_TRANSFORM: Record<TimelineAddAxis, string> = {
  left: "translate(-50%, -50%)",
  right: "translate(50%, -50%)",
  top: "translate(-50%, -50%)",
  bottom: "translate(-50%, 50%)",
};

function addActionLabel(action: TimelineAddAction): string {
  switch (action.kind) {
    case "event":
      return `Add event ${action.placement}`;
    case "period":
      return `Add period ${action.placement}`;
    case "section":
      return `Add section ${action.placement}`;
    case "period-to-section":
      return "Add period";
    case "event-to-period":
      return "Add event";
  }
}

/** The tooltip opens on the same side of the `+` that the button sits on, so it never
 *  covers the selected component. */
const TOOLTIP_SIDE: Record<TimelineAddAxis, "top" | "bottom" | "left" | "right"> = {
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
};

function addActionDataAttribute(action: TimelineAddAction): Record<string, string> {
  switch (action.kind) {
    case "event":
      return { "data-timeline-add-event": action.placement };
    case "period":
      return { "data-timeline-add-period": action.placement };
    case "section":
      return { "data-timeline-add-section": action.placement };
    case "period-to-section":
      return { "data-timeline-add-period-to-section": "true" };
    case "event-to-period":
      return { "data-timeline-add-event-to-period": "true" };
  }
}

function runAddAction(
  action: TimelineAddAction,
  handlers: Pick<TimelineAddButtonsProps, "onAddEvent" | "onAddPeriod" | "onAddSection">,
) {
  switch (action.kind) {
    case "event":
      handlers.onAddEvent(action.placement);
      break;
    case "period":
      handlers.onAddPeriod(action.placement);
      break;
    case "section":
      handlers.onAddSection(action.placement);
      break;
    case "period-to-section":
      handlers.onAddPeriod("after");
      break;
    case "event-to-period":
      handlers.onAddEvent("after");
      break;
  }
}

/**
 * Directional indigo `+` edge buttons for a Timeline node (before/after + child-add).
 * Shared between the selected-state toolbar and the hover preview.
 */
export function TimelineAddButtons({
  scale,
  node,
  direction,
  onAddEvent,
  onAddPeriod,
  onAddSection,
}: TimelineAddButtonsProps) {
  const addButtons = timelineAddAxes(node, direction);
  const handlers = { onAddEvent, onAddPeriod, onAddSection };

  return (
    <TooltipProvider delay={0}>
      {addButtons.map(({ side, action }) => {
        const transform = EDGE_TRANSFORM[side];
        return (
          <div
            key={`timeline-add-${action.kind}-${"placement" in action ? action.placement : ""}`}
            data-scale-lock
            data-inline-toolbar
            data-timeline-add-button
            data-base-transform={transform}
            {...addActionDataAttribute(action)}
            className="absolute z-[40] pointer-events-auto"
            style={{
              ...EDGE_POSITION[side],
              transform: `${transform} scale(var(--zoom-inverse-scale, ${1 / scale}))`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="pointer-events-auto w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform outline-2 outline-white outline-offset-0"
                  />
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  runAddAction(action, handlers);
                }}
              >
                <Plus className="w-3 h-3 pointer-events-none" />
              </TooltipTrigger>
              <TooltipContent side={TOOLTIP_SIDE[side]}>
                {addActionLabel(action)}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </TooltipProvider>
  );
}

export function TimelineNodeToolbar({
  scale,
  node,
  direction,
  onAddEvent,
  onAddPeriod,
  onAddSection,
  onEditLabel,
  onDelete,
}: TimelineNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      <div
        ref={containerRef}
        data-scale-lock
        data-inline-toolbar
        data-timeline-node-toolbar
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
            title="Rename element"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditLabel(e);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>

          <button
            type="button"
            className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            title="Delete element"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <TimelineAddButtons
        scale={scale}
        node={node}
        direction={direction}
        onAddEvent={onAddEvent}
        onAddPeriod={onAddPeriod}
        onAddSection={onAddSection}
      />
    </>
  );
}
