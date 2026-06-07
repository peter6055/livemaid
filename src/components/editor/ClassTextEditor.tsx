"use client";

import { useEffect, useRef, useState } from "react";

interface ClassTextEditorProps {
    /** Whether the target is the diagram title or a note (affects alignment + placeholder). */
    kind: "title" | "note";
    /** Initial text to seed the editor with. */
    initialValue: string;
    /** Viewport-space rect (from the SVG element's bounding box) used to position the overlay. */
    rect: { left: number; top: number; width: number; height: number };
    /** Commit the new value (called on blur / Enter). */
    onCommit: (value: string) => void;
    /** Abandon the edit without committing (called on Escape). */
    onCancel: () => void;
}

/**
 * Lightweight inline text editor for a class-diagram TITLE or NOTE. Rendered as a viewport-fixed
 * overlay positioned over the double-clicked SVG element. Commits on blur (click outside) or Enter;
 * cancels on Escape. Kept intentionally small and self-contained — it does not touch the
 * flowchart/sequence inline-editing machinery.
 */
export function ClassTextEditor({
    kind,
    initialValue,
    rect,
    onCommit,
    onCancel,
}: ClassTextEditorProps) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const committedRef = useRef(false);
    const [value, setValue] = useState(initialValue);
    // Keep the latest value reachable from the document listener closure (registered once on mount).
    const valueRef = useRef(initialValue);
    valueRef.current = value;

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
    // "click outside to exit" regardless of what the click target does.
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) commit();
        };
        document.addEventListener("mousedown", onDown, true);
        return () => document.removeEventListener("mousedown", onDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const width = Math.max(rect.width + 24, 140);
    const height = Math.max(rect.height + 8, 32);

    return (
        <textarea
            ref={ref}
            data-class-text-editor
            value={value}
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
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
            placeholder={kind === "title" ? "Diagram title" : "Note text"}
            style={{
                position: "fixed",
                left: rect.left + rect.width / 2 - width / 2,
                top: rect.top - 4,
                width,
                height,
            }}
            className={`z-[60] resize-none overflow-hidden rounded-md border-2 border-indigo-500 bg-white px-2 py-1 font-sans text-sm leading-snug text-slate-900 shadow-lg outline-none ${kind === "title" ? "text-center font-semibold" : "text-left"
                }`}
        />
    );
}
