"use client";

import { useEffect, useRef, useState } from "react";

interface ClassTextEditorProps {
  /** Whether the target is the diagram title, a note, a relationship label, a namespace, or a state. */
  kind: "title" | "note" | "relationship" | "namespace" | "state";
  /** Initial text to seed the editor with. */
  initialValue: string;
  /** Viewport-space rect (from the SVG element's bounding box) used to position the overlay. */
  rect: { left: number; top: number; width: number; height: number };
  /** Commit the new value (called on blur / Enter). */
  onCommit: (value: string) => void;
  /** Abandon the edit without committing (called on Escape). */
  onCancel: () => void;
  /**
   * Optional live-change callback fired on every keystroke (used by the ER relationship-label
   * editor for real-time per-keystroke code sync). The class diagram does not pass this, so its
   * behaviour is unchanged (commit on blur/Enter only).
   */
  onLiveChange?: (value: string) => void;
  /**
   * State-diagram NOTES only: the note's current side. When provided together with
   * `onNotePositionChange` (and `kind === "note"`), a small Left/Right segmented toggle floats above
   * the editor so the user can pick the annotation side without leaving the inline editor. Other
   * diagrams (class/ER) never pass these, so their behaviour is unchanged.
   */
  notePosition?: "left" | "right";
  /** Switch the note's side (left/right) live while the editor stays open. */
  onNotePositionChange?: (position: "left" | "right") => void;
}

/**
 * Lightweight inline text editor for a class-diagram TITLE, NOTE, or relationship LABEL. Rendered
 * as a viewport-fixed overlay positioned over the double-clicked SVG element. Commits on blur (click
 * outside) or Enter; cancels on Escape. Kept intentionally small and self-contained — it does not
 * touch the flowchart/sequence inline-editing machinery.
 */
export function ClassTextEditor({
  kind,
  initialValue,
  rect,
  onCommit,
  onCancel,
  onLiveChange,
  notePosition,
  onNotePositionChange,
}: ClassTextEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);
  const [value, setValue] = useState(initialValue);
  // Keep the latest value reachable from the document listener closure (registered once on mount).
  const valueRef = useRef(initialValue);
  valueRef.current = value;

  // Only the state-diagram note editor opts into the side toggle.
  const showSideToggle = kind === "note" && notePosition != null && !!onNotePositionChange;

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(valueRef.current);
  };

  const cancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  };

  // Commit on any mousedown outside the editor (capture phase). A plain `blur` is unreliable here:
  // the canvas's pan handler calls preventDefault on mousedown, which suppresses the default
  // focus-change, so the textarea never blurs when clicking empty canvas. This listener guarantees
  // "click outside to exit" regardless of what the click target does. The containment check uses the
  // wrapper so clicks on the side toggle (a sibling of the textarea) don't count as "outside".
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) commit();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = Math.max(rect.width + 24, 140);
  const height = Math.max(rect.height + 8, 32);

  return (
    <div
      ref={wrapperRef}
      data-class-text-editor
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2 - width / 2,
        top: rect.top - 4,
        width,
      }}
      className="z-[60]"
    >
      {showSideToggle && (
        <div
          className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 rounded-md border-2 border-indigo-500 bg-white p-0.5 shadow-lg"
          onMouseDown={(e) => {
            // Keep textarea focus and don't let the canvas start a pan / the outside-click fire.
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onNotePositionChange?.(side);
                ref.current?.focus();
              }}
              className={`rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                notePosition === side
                  ? "bg-indigo-500 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {side}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        spellCheck={false}
        onChange={(e) => {
          setValue(e.target.value);
          onLiveChange?.(e.target.value);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        placeholder={
          kind === "title"
            ? "Diagram title"
            : kind === "relationship"
              ? "Label"
              : kind === "namespace"
                ? "Namespace name"
                : kind === "state"
                  ? "State label"
                  : "Note text"
        }
        style={{ width: "100%", height }}
        className={`block resize-none overflow-hidden rounded-md border-2 border-indigo-500 bg-white px-2 py-1 font-sans text-sm leading-snug text-slate-900 shadow-lg outline-none ${
          kind === "title"
            ? "text-center font-semibold"
            : kind === "relationship" || kind === "namespace" || kind === "state"
              ? "text-center"
              : "text-left"
        }`}
      />
    </div>
  );
}
