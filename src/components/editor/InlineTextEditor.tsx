import { RefObject, useEffect, useLayoutEffect } from "react";

interface InlineTextEditorProps {
  isInlineEditing: boolean;
  setIsInlineEditing: (v: boolean) => void;
  textBox: { x: number; y: number; width: number; height: number } | null;
  selectionBox: { x: number; y: number; width: number; height: number } | null;
  scale: number;
  theme: string | undefined;
  editingText: string;
  setEditingText: (text: string) => void;
  handleEditSubmit: () => void;
  inlineInputRef: RefObject<HTMLTextAreaElement | null>;
  selectedSvgId: string | null;
}

function estimateTextWidth(text: string, fontSize: number) {
  const longestLine = text
    .split(/\r?\n/)
    .reduce((longest, line) => (line.length > longest.length ? line : longest), "");
  if (!longestLine) return 0;

  if (typeof document === "undefined") {
    return longestLine.length * fontSize * 0.62;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return longestLine.length * fontSize * 0.62;
  ctx.font = `500 ${fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  return ctx.measureText(longestLine).width;
}

export function InlineTextEditor({
  isInlineEditing,
  setIsInlineEditing,
  textBox,
  selectionBox,
  scale,
  theme,
  editingText,
  setEditingText,
  handleEditSubmit,
  inlineInputRef,
  selectedSvgId,
}: InlineTextEditorProps) {
  useEffect(() => {
    if (!isInlineEditing) return;

    const stopInputPropagation = (e: Event) => {
      e.stopPropagation();
    };

    const input = inlineInputRef.current;
    if (input) {
      input.addEventListener("mousedown", stopInputPropagation);
      input.addEventListener("pointerdown", stopInputPropagation);
      input.addEventListener("touchstart", stopInputPropagation);
    }

    return () => {
      if (input) {
        input.removeEventListener("mousedown", stopInputPropagation);
        input.removeEventListener("pointerdown", stopInputPropagation);
        input.removeEventListener("touchstart", stopInputPropagation);
      }
    };
  }, [isInlineEditing, inlineInputRef]);

  useEffect(() => {
    if (!isInlineEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (inlineInputRef.current && !inlineInputRef.current.contains(event.target as Node)) {
        handleEditSubmit();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isInlineEditing, handleEditSubmit, inlineInputRef]);

  useLayoutEffect(() => {
    if (!isInlineEditing || !textBox || !selectionBox) return;
    const el = inlineInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, Math.max(textBox.height, 24))}px`;
  }, [editingText, inlineInputRef, isInlineEditing, selectionBox, textBox]);

  if (!isInlineEditing || !textBox || !selectionBox) return null;

  const offsetCanvas = 4 / scale;
  let centerX = 0,
    centerY = 0;
  try {
    const relativeNodeX = textBox.x - (selectionBox.x - offsetCanvas);
    const relativeNodeY = textBox.y - (selectionBox.y - offsetCanvas);
    centerX = relativeNodeX + textBox.width / 2;
    centerY = relativeNodeY + textBox.height / 2;
  } catch (e) {
    console.error("[InlineTextEditor] calc error:", e);
    return null;
  }

  const fontSize = 14;
  const measuredTextWidth = estimateTextWidth(editingText, fontSize);
  const targetVisualWidth = Math.min(Math.max(textBox.width, measuredTextWidth + 20, 80), 700);
  const targetVisualHeight = Math.max(textBox.height, 24);

  return (
    <textarea
      data-scale-lock
      data-base-transform="translate(-50%, -50%)"
      ref={inlineInputRef}
      className="absolute bg-white pointer-events-auto resize-none outline-none border border-indigo-500/50 rounded-lg text-center font-sans font-medium break-words z-40 overflow-hidden shadow-xl selection:bg-indigo-600 selection:text-white whitespace-pre-wrap"
      value={editingText}
      onChange={(e) => setEditingText(e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          handleEditSubmit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setIsInlineEditing(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          inlineInputRef.current?.select();
        }
        e.stopPropagation();
      }}
      onBlur={(e) => {
        const related = e.relatedTarget;
        if (related && inlineInputRef.current?.contains(related as Node)) return;
        handleEditSubmit();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        left: centerX,
        top: centerY,
        transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, 1))`,
        width: targetVisualWidth,
        height: targetVisualHeight,
        fontSize: `${fontSize}px`,
        lineHeight: 1.4,
        color: "#1c1c21",
        whiteSpace: "pre-wrap",
        boxSizing: "border-box",
      }}
    />
  );
}
