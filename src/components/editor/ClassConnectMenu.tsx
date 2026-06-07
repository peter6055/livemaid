"use client";

import { useEffect, useRef } from "react";
import { Box, StickyNote } from "lucide-react";
import { CLASS_RELATIONSHIP_TYPES } from "@/lib/diagrams/classDiagram";

export interface ClassConnectMenuState {
  /** canvasShell-relative position (viewport space). */
  x: number;
  y: number;
  /** The dragged-from class (relationship/note source). */
  source: string;
  /** Existing target class name, or null when dropping on empty canvas (create flow). */
  target: string | null;
  /** `choose` = empty-drop chip (New Class / New Note); `relationship` = pick a UML type. */
  step: "choose" | "relationship";
}

interface ClassConnectMenuProps {
  state: ClassConnectMenuState;
  /** Picked a relationship operator (relate to existing target, or create a new class). */
  onPickRelationship: (operator: string) => void;
  /** Empty-drop: chose "New Class" → create a new class linked with a default association. */
  onChooseNewClass: () => void;
  /** Empty-drop: chose "New Note" → create a class-scoped note immediately. */
  onChooseNewNote: () => void;
  onClose: () => void;
}

/**
 * Contextual popover shown at the drop point of a class-diagram connection drag. Two steps:
 *  - `choose`  (dropped on empty canvas / plain +-click): "New Class" or "New Note".
 *  - `relationship` (dropped on a class, or after picking New Class): a list of the 8 UML
 *    relationship types. The dragged-from class is the source, so each row reads
 *    `<source> <operator> <target>` left-to-right.
 * Rendered outside the TransformWrapper at canvasShell level (viewport coords), dark-themed to
 * match the class property panel. Closes on outside click or Escape.
 */
export function ClassConnectMenu({
  state,
  onPickRelationship,
  onChooseNewClass,
  onChooseNewNote,
  onClose,
}: ClassConnectMenuProps) {
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

  const targetLabel = state.target ?? "New class";

  return (
    <div
      ref={ref}
      data-class-connect-menu
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute z-50 flex w-60 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#100f1b] text-slate-100 shadow-xl"
      style={{
        left: Math.max(8, state.x),
        top: Math.max(8, state.y + 8),
        transform: "translateX(-50%)",
      }}
    >
      {state.step === "choose" ? (
        <div className="flex flex-col p-1.5">
          <p className="px-2.5 py-1.5 text-xs font-medium text-slate-400">
            Connect <span className="font-mono text-slate-200">{state.source}</span> to…
          </p>
          <button
            type="button"
            onClick={onChooseNewClass}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white/[0.06]"
          >
            <Box className="h-4 w-4 text-indigo-400" />
            <span>New class</span>
          </button>
          <button
            type="button"
            onClick={onChooseNewNote}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white/[0.06]"
          >
            <StickyNote className="h-4 w-4 text-amber-400" />
            <span>New note</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col p-1.5">
          <p className="px-2.5 py-1.5 text-xs font-medium text-slate-400">
            <span className="font-mono text-slate-200">{state.source}</span> →{" "}
            <span className="font-mono text-slate-200">{targetLabel}</span>
          </p>
          <div className="flex max-h-72 flex-col overflow-y-auto">
            {CLASS_RELATIONSHIP_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onPickRelationship(t.operator)}
                className="flex items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.06]"
              >
                <span className="w-12 shrink-0 font-mono text-sm text-indigo-300">
                  {t.operator}
                </span>
                <span className="text-sm text-slate-200">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
