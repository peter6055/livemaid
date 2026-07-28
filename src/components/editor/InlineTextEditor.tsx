import { RefObject, useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

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
  handleFormatText?: (format: string, colorValue?: string) => void;
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

function getActiveFormats(el: HTMLElement | null): {
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right" | "";
} {
  if (!el) return { bold: false, italic: false, align: "" };

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { bold: false, italic: false, align: "" };

  const range = sel.getRangeAt(0);
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  let bold = false;
  let italic = false;
  let align: "left" | "center" | "right" | "" = "";

  // Walk up the DOM tree to find formatting tags
  while (node && node !== el) {
    if (node instanceof HTMLElement) {
      const tag = node.tagName.toLowerCase();
      if (tag === "b" || tag === "strong") bold = true;
      if (tag === "i" || tag === "em") italic = true;

      const textAlign = node.style?.textAlign;
      if (textAlign === "left" || textAlign === "center" || textAlign === "right") {
        if (!align) align = textAlign;
      }
    }
    node = node.parentNode;
  }

  // Also check computed styles for the selection
  if (range.startContainer instanceof HTMLElement) {
    const computed = window.getComputedStyle(range.startContainer);
    if (computed.fontWeight === "bold" || parseInt(computed.fontWeight) >= 700) bold = true;
    if (computed.fontStyle === "italic") italic = true;
  }

  return { bold, italic, align };
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
  handleFormatText,
}: InlineTextEditorProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    align: "" as "left" | "center" | "right" | "",
  });
  const originalContentRef = useRef<string>("");
  const isInitialLoadRef = useRef<boolean>(true);

  // Update active formats when selection changes
  const updateActiveFormats = useCallback(() => {
    if (!inlineInputRef.current) return;
    const formats = getActiveFormats(inlineInputRef.current);
    setActiveFormats(formats);
  }, [inlineInputRef]);

  // Listen for selection changes
  useEffect(() => {
    if (!isInlineEditing) return;

    document.addEventListener("selectionchange", updateActiveFormats);
    return () => {
      document.removeEventListener("selectionchange", updateActiveFormats);
    };
  }, [isInlineEditing, updateActiveFormats]);

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
      // Don't submit if clicking inside the editor or the toolbar
      if (inlineInputRef.current?.contains(target)) return;
      if (toolbarRef.current?.contains(target)) return;
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
      // Store original content for comparison
      originalContentRef.current = editingText;
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

  const activeButtonClass =
    "h-7 w-7 flex items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 transition-colors";
  const inactiveButtonClass =
    "h-7 w-7 flex items-center justify-center rounded hover:bg-accent hover:text-accent-foreground transition-colors";

  return (
    <>
      {/* Formatting Toolbar - positioned above the editor */}
      {handleFormatText && (
        <div
          ref={toolbarRef}
          data-scale-lock
          data-inline-toolbar
          data-base-transform="translateX(-50%) translateY(-100%)"
          className="absolute pointer-events-auto z-50"
          style={{
            left: centerX,
            top: `calc(${centerY - targetVisualHeight / 2}px - 8px * var(--zoom-inverse-scale, ${1 / scale}))`,
            transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
            transformOrigin: "bottom",
            padding: "8px",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-0.5 bg-background border border-border rounded-lg px-1.5 py-1 shadow-lg">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatText("bold");
              }}
              className={activeFormats.bold ? activeButtonClass : inactiveButtonClass}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatText("italic");
              }}
              className={activeFormats.italic ? activeButtonClass : inactiveButtonClass}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-border mx-0.5" />

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatText("align-left");
              }}
              className={activeFormats.align === "left" ? activeButtonClass : inactiveButtonClass}
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatText("align-center");
              }}
              className={activeFormats.align === "center" ? activeButtonClass : inactiveButtonClass}
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatText("align-right");
              }}
              className={activeFormats.align === "right" ? activeButtonClass : inactiveButtonClass}
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Content Editable Div */}
      <div
        data-scale-lock
        data-base-transform="translate(-50%, -50%)"
        ref={inlineInputRef}
        contentEditable
        suppressContentEditableWarning
        className="absolute bg-white pointer-events-auto resize-none outline-none border border-indigo-500/50 rounded-lg text-center font-sans font-medium break-words z-40 overflow-hidden shadow-xl selection:bg-indigo-600 selection:text-white whitespace-pre-wrap cursor-text"
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
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            handleFormatText?.("bold");
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            handleFormatText?.("italic");
          }
          e.stopPropagation();
        }}
        onBlur={(e) => {
          const related = e.relatedTarget;
          // Don't submit if focus moved to something inside the editor or toolbar
          if (related && inlineInputRef.current?.contains(related as Node)) return;
          if (related && toolbarRef.current?.contains(related as Node)) return;
          // Use setTimeout to check if focus is still within our components
          // This handles cases where relatedTarget is null (e.g., clicking a button)
          setTimeout(() => {
            const activeEl = document.activeElement;
            if (activeEl && inlineInputRef.current?.contains(activeEl)) return;
            if (activeEl && toolbarRef.current?.contains(activeEl)) return;
            // Check if any element in our components has focus
            if (inlineInputRef.current?.querySelector(":focus")) return;
            if (toolbarRef.current?.querySelector(":focus")) return;
            handleEditSubmit();
          }, 0);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          // Update active formats on click
          setTimeout(updateActiveFormats, 0);
        }}
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
          whiteSpace: "pre-wrap",
          boxSizing: "border-box",
        }}
      />
    </>
  );
}
