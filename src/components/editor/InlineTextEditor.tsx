import { RefObject, useEffect, useLayoutEffect, useCallback, useRef } from "react";

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
  inlineInputRef: RefObject<HTMLDivElement | null>;
  selectedSvgId: string | null;
}

function estimateTextWidth(text: string, fontSize: number) {
  // Strip HTML tags for width estimation
  const plainText = text.replace(/<[^>]+>/g, "");
  const longestLine = plainText
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
  const isInitialLoadRef = useRef<boolean>(true);

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
      const target = event.target as Node;
      // Don't submit if clicking inside the editor
      if (inlineInputRef.current?.contains(target)) return;
      handleEditSubmit();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isInlineEditing, handleEditSubmit, inlineInputRef]);

  // Set innerHTML when entering edit mode or when editingText changes externally
  useEffect(() => {
    if (!isInlineEditing) return;
    const el = inlineInputRef.current;
    if (!el) return;
    // Only update if the content differs to avoid cursor jumps
    if (el.innerHTML !== editingText) {
      el.innerHTML = editingText;
      isInitialLoadRef.current = true;
    }
  }, [isInlineEditing, editingText, inlineInputRef]);

  useLayoutEffect(() => {
    if (!isInlineEditing || !textBox || !selectionBox) return;
    const el = inlineInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, Math.max(textBox.height, 24))}px`;
  }, [editingText, inlineInputRef, isInlineEditing, selectionBox, textBox]);

  const handleInput = useCallback(() => {
    const el = inlineInputRef.current;
    if (!el) return;

    // Skip the first input event after loading (browser auto-formats)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      // Still update the height
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
      return;
    }

    setEditingText(el.innerHTML);
  }, [inlineInputRef, setEditingText]);

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
    <div
      data-scale-lock
      data-base-transform="translate(-50%, -50%)"
      ref={inlineInputRef}
      contentEditable
      suppressContentEditableWarning
      className="absolute bg-white pointer-events-auto resize-none outline-none border border-indigo-500/50 rounded-lg text-center font-sans font-medium z-40 overflow-hidden shadow-xl selection:bg-indigo-600 selection:text-white cursor-text"
      onInput={handleInput}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          handleEditSubmit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setIsInlineEditing(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          const el = inlineInputRef.current;
          if (el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
        // Block browser formatting shortcuts (B/I/U) - users should edit styling in code
        else if (
          (e.metaKey || e.ctrlKey) &&
          (e.key.toLowerCase() === "b" ||
            e.key.toLowerCase() === "i" ||
            e.key.toLowerCase() === "u")
        ) {
          e.preventDefault();
        }
        e.stopPropagation();
      }}
      onBlur={(e) => {
        const related = e.relatedTarget;
        // Don't submit if focus moved to something inside the editor
        if (related && inlineInputRef.current?.contains(related as Node)) return;
        // Use setTimeout to check if focus is still within our components
        setTimeout(() => {
          const activeEl = document.activeElement;
          if (activeEl && inlineInputRef.current?.contains(activeEl)) return;
          if (inlineInputRef.current?.querySelector(":focus")) return;
          handleEditSubmit();
        }, 0);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        left: centerX,
        top: centerY,
        transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
        width: targetVisualWidth,
        height: targetVisualHeight,
        fontSize: `${fontSize}px`,
        lineHeight: 1.4,
        color: "#1c1c21",
        whiteSpace: "nowrap",
        boxSizing: "border-box",
      }}
    />
  );
}
