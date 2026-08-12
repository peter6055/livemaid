import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";

interface TimelineNodeToolbarProps {
  scale: number;
  nodeKind: "section" | "period" | "event";
  onAddEvent: (placement: "before" | "after") => void;
  onAddPeriod: (placement: "above" | "below") => void;
  onAddSection: () => void;
  onEditLabel: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

export function TimelineNodeToolbar({
  scale,
  nodeKind,
  onAddEvent,
  onAddPeriod,
  onAddSection,
  onEditLabel,
  onDelete,
}: TimelineNodeToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<"event" | "period" | null>(null);

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

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openMenu]);

  const toggleMenu = (menu: "event" | "period") => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const menuItemClass = (active: boolean) =>
    `flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
        : "text-foreground hover:bg-accent"
    }`;

  const renderMenu = (id: "event" | "period") => {
    if (openMenu !== id) return null;
    const eventItems: Array<{ id: "before" | "after"; label: string }> =
      nodeKind === "period"
        ? [{ id: "after", label: "Insert event after" }]
        : [
            { id: "before", label: "Insert event before" },
            { id: "after", label: "Insert event after" },
          ];
    const periodItems: Array<{ id: "above" | "below"; label: string }> = [
      { id: "above", label: "Add period above" },
      { id: "below", label: "Add period below" },
    ];
    const items = id === "event" ? eventItems : periodItems;
    const handler = (id === "event" ? onAddEvent : onAddPeriod) as (
      placement: "before" | "after" | "above" | "below",
    ) => void;
    return (
      <div
        className="absolute left-0 bottom-full z-40 mb-2 grid w-48 grid-cols-1 gap-0.5 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handler(item.id);
              setOpenMenu(null);
            }}
            className={menuItemClass(false)}
          >
            <span className="flex items-center gap-2">{item.label}</span>
          </button>
        ))}
      </div>
    );
  };

  const dropdownButton = (
    id: "event" | "period",
    shortLabel: string,
    icon: React.ReactNode,
    open: boolean,
  ) => (
    <button
      type="button"
      className={`pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
        open
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
      title={`Add ${shortLabel.toLowerCase()}`}
      onMouseDownCapture={(e) => {
        e.stopPropagation();
        toggleMenu(id);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {icon}
      {shortLabel}
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );

  return (
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
        <div className="relative">
          {dropdownButton("event", "Event", <Plus className="h-3.5 w-3.5" />, openMenu === "event")}
          {renderMenu("event")}
        </div>

        {nodeKind !== "event" && (
          <div className="relative">
            {dropdownButton(
              "period",
              "Period",
              <Plus className="h-3.5 w-3.5" />,
              openMenu === "period",
            )}
            {renderMenu("period")}
          </div>
        )}

        {nodeKind === "section" && (
          <>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button
              type="button"
              className="pointer-events-auto flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Add section"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddSection();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Section
            </button>
          </>
        )}

        <div className="mx-0.5 h-4 w-px bg-border" />

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
  );
}
