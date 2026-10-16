import { RefObject, useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { sanitizeHtml } from "@/lib/utils";
import {
  isFormatTag,
  getTextNodesInRange,
  isAllContentFormatted,
  coversAllContent,
} from "@/lib/formatting-helpers";

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

export function getActiveFormats(el: HTMLElement | null): {
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right" | "";
} {
  if (!el) return { bold: false, italic: false, align: "" };

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

  const getAlignment = (r: Range | null) => {
    let node: Node | null = r ? r.commonAncestorContainer : el;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    // If the selection starts at the editor level, the alignment may live on a
    // child wrapper (e.g. <div style="text-align: center">). Check the first
    // block-level child in that case.
    if (node === el && el.firstChild instanceof HTMLElement) {
      const childAlign = el.firstChild.style.textAlign;
      if (childAlign === "left" || childAlign === "center" || childAlign === "right") {
        return childAlign as "left" | "center" | "right";
      }
    }

    while (node && node !== el.parentNode) {
      if (node instanceof HTMLElement) {
        const textAlign = node.style.textAlign;
        if (textAlign === "left" || textAlign === "center" || textAlign === "right") {
          return textAlign as "left" | "center" | "right";
        }
      }
      node = node.parentNode;
    }
    return "";
  };

  let bold = false;
  let italic = false;

  if (!range || !el.contains(range.commonAncestorContainer)) {
    // No valid selection inside the editor: check the whole editor content.
    bold = isAllContentFormatted(el, "bold");
    italic = isAllContentFormatted(el, "italic");
  } else if (range.collapsed || coversAllContent(el, range)) {
    const textNodes = getTextNodesInRange(range, el);
    if (textNodes.length === 0) {
      bold = isAllContentFormatted(el, "bold");
      italic = isAllContentFormatted(el, "italic");
    } else {
      bold = textNodes.every((textNode) => {
        let node: Node | null = textNode.parentNode;
        while (node && node !== el) {
          if (isFormatTag(node, "bold")) return true;
          node = node.parentNode;
        }
        return false;
      });
      italic = textNodes.every((textNode) => {
        let node: Node | null = textNode.parentNode;
        while (node && node !== el) {
          if (isFormatTag(node, "italic")) return true;
          node = node.parentNode;
        }
        return false;
      });
    }
  } else {
    const textNodes = getTextNodesInRange(range, el).filter((n) => n.textContent?.trim());
    if (textNodes.length === 0) {
      bold = false;
      italic = false;
    } else {
      bold = textNodes.every((textNode) => {
        let node: Node | null = textNode.parentNode;
        while (node && node !== el) {
          if (isFormatTag(node, "bold")) return true;
          node = node.parentNode;
        }
        return false;
      });
      italic = textNodes.every((textNode) => {
        let node: Node | null = textNode.parentNode;
        while (node && node !== el) {
          if (isFormatTag(node, "italic")) return true;
          node = node.parentNode;
        }
        return false;
      });
    }
  }

  return { bold, italic, align: getAlignment(range) };
}

interface SavedSelection {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
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
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [headerOffset, setHeaderOffset] = useState(0);
  const savedSelectionRef = useRef<SavedSelection | null>(null);

  const updateActiveFormats = useCallback(() => {
    if (!inlineInputRef.current) return;
    setActiveFormats(getActiveFormats(inlineInputRef.current));
  }, [inlineInputRef]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      savedSelectionRef.current = null;
      return;
    }
    const range = sel.getRangeAt(0);
    savedSelectionRef.current = {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    };
  }, []);

  const restoreSelection = useCallback(() => {
    const saved = savedSelectionRef.current;
    const el = inlineInputRef.current;
    if (!saved || !el) return;
    if (!el.contains(saved.startContainer) || !el.contains(saved.endContainer)) {
      savedSelectionRef.current = null;
      return;
    }
    const range = document.createRange();
    try {
      range.setStart(saved.startContainer, saved.startOffset);
      range.setEnd(saved.endContainer, saved.endOffset);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      savedSelectionRef.current = null;
    }
  }, [inlineInputRef]);

  useEffect(() => {
    if (!isInlineEditing) {
      setMeasuredHeight(null);
    }
    setHeaderOffset(0);

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
      // Don't submit if clicking inside the editor or toolbar
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
    // Sanitize before injecting into the DOM: the label text originates from
    // the diagram source, which may contain active/disallowed HTML that Mermaid
    // would otherwise render verbatim (securityLevel: "loose", htmlLabels: true).
    const safeText = sanitizeHtml(editingText);
    // Only update if the content differs to avoid cursor jumps
    if (el.innerHTML !== safeText) {
      el.innerHTML = safeText;
    }
  }, [isInlineEditing, editingText, inlineInputRef]);

  useLayoutEffect(() => {
    if (!isInlineEditing || !textBox || !selectionBox) return;
    const el = inlineInputRef.current;
    if (!el) return;
    // Let the editor expand with its content rather than computing a fixed
    // height from scrollHeight, which can lag or be wrong when the DOM is
    // updated outside React's render cycle. The intrinsic height plus a
    // min-height based on the rendered node keeps short text centered and
    // multiline text accessible.
    const minHeight = Math.max(textBox.height * scale, 64);
    el.style.height = "auto";
    el.style.minHeight = `${minHeight}px`;
    // getBoundingClientRect includes the CSS scale() transform, so this is the
    // visual height used to position the toolbar above the editor.
    setMeasuredHeight(el.getBoundingClientRect().height);
  }, [editingText, inlineInputRef, isInlineEditing, selectionBox, textBox, scale]);

  // Observe the editor's rendered size so the toolbar tracks height changes
  // that do not flow through React state (soft wraps, formatting, pasted HTML,
  // line-height adjustments, etc.). The callback reads getBoundingClientRect so
  // measuredHeight stays in the same visual/CSS-pixel space as the render path.
  useEffect(() => {
    if (!isInlineEditing) return;
    const el = inlineInputRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setMeasuredHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [isInlineEditing, inlineInputRef, scale]);

  // Keep the floating editor and its toolbar below the sticky app header (h-14).
  // They live inside the zoomed canvas stacking context, so the header always paints
  // above them — a node near the top of the viewport would otherwise render the
  // toolbar under the header where clicks are swallowed. The offset is owned by
  // React state so the final top values are rendered, not post-mutated on the DOM.
  useLayoutEffect(() => {
    if (!isInlineEditing) return;
    const input = inlineInputRef.current;
    if (!input) return;
    const toolbar = toolbarRef.current;

    // Skip in test environments (e.g. jsdom) where layout returns all-zero rects.
    // Without real geometry the deficit never resolves and would loop forever.
    const inputRect = input.getBoundingClientRect();
    if (inputRect.width === 0 && inputRect.height === 0) return;

    const headerBottom = 64;
    let maxDeficit = 0;
    for (const el of [input, toolbar].filter(Boolean) as HTMLElement[]) {
      const rect = el.getBoundingClientRect();
      const deficit = headerBottom - rect.top;
      if (deficit > maxDeficit) maxDeficit = deficit;
    }

    if (maxDeficit > 1) {
      setHeaderOffset((prev) => {
        const next = prev + maxDeficit;
        return Math.abs(next - prev) > 0.5 ? next : prev;
      });
    }
  }, [isInlineEditing, scale, measuredHeight, headerOffset, inlineInputRef]);

  const scrollToCaret = useCallback(() => {
    const el = inlineInputRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const caretRect = range.getBoundingClientRect();
    const editorRect = el.getBoundingClientRect();
    const relativeTop = caretRect.top - editorRect.top;
    const relativeBottom = caretRect.bottom - editorRect.bottom;
    if (relativeTop < 0) {
      el.scrollTop += relativeTop;
    } else if (relativeBottom > 0) {
      el.scrollTop += relativeBottom;
    }
  }, [inlineInputRef]);

  const handleInput = useCallback(() => {
    const el = inlineInputRef.current;
    if (!el) return;
    setEditingText(el.innerHTML);
    scrollToCaret();
  }, [inlineInputRef, setEditingText, scrollToCaret]);

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

  const fontSize = 16;
  // Keep the editor at the rendered node's visual size so wrapping matches the graph output.
  // textBox is stored in unscaled canvas units; multiply by the current zoom so the overlay
  // covers the same CSS pixels as the underlying SVG node.
  // We no longer expand the width to fit the longest line; that prevents the editor from
  // showing the same line breaks Mermaid will render.
  const targetVisualWidth = Math.max(textBox.width * scale, 120);
  const targetVisualHeight = measuredHeight ?? Math.max(textBox.height * scale, 64);

  // Push the whole inline-editing stack down when the toolbar would overlap the
  // sticky app header. The offset is in CSS pixels and converted to unscaled
  // canvas units for the style values.
  const baseTop = centerY + headerOffset / scale;

  const isDark = theme === "dark";

  const activeButtonClass =
    "h-7 w-7 flex items-center justify-center rounded bg-indigo-900/50 text-indigo-400 transition-colors";
  const inactiveButtonClass =
    "h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors";

  return (
    <>
      {/* Formatting Toolbar - positioned above the editor */}
      {handleFormatText && (
        <div
          ref={toolbarRef}
          data-inline-editor
          data-scale-lock
          data-inline-toolbar
          data-base-transform="translateX(-50%) translateY(-100%)"
          className="absolute pointer-events-auto z-50"
          style={{
            left: centerX,
            top: `${baseTop - targetVisualHeight / 2 / scale - 4 / scale}px`,
            transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
            transformOrigin: "bottom",
            padding: "0px",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-0.5 bg-[#1c1c21] border border-zinc-600/50 rounded-lg px-1.5 py-0.5 shadow-lg">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineInputRef.current?.focus();
                restoreSelection();
                handleFormatText("bold");
                setTimeout(updateActiveFormats, 0);
              }}
              className={activeFormats.bold ? activeButtonClass : inactiveButtonClass}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineInputRef.current?.focus();
                restoreSelection();
                handleFormatText("italic");
                setTimeout(updateActiveFormats, 0);
              }}
              className={activeFormats.italic ? activeButtonClass : inactiveButtonClass}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-zinc-600 mx-0.5" />

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineInputRef.current?.focus();
                restoreSelection();
                handleFormatText("align-left");
                setTimeout(updateActiveFormats, 0);
              }}
              className={activeFormats.align === "left" ? activeButtonClass : inactiveButtonClass}
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineInputRef.current?.focus();
                restoreSelection();
                handleFormatText("align-center");
                setTimeout(updateActiveFormats, 0);
              }}
              className={activeFormats.align === "center" ? activeButtonClass : inactiveButtonClass}
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineInputRef.current?.focus();
                restoreSelection();
                handleFormatText("align-right");
                setTimeout(updateActiveFormats, 0);
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
        data-inline-editor
        data-scale-lock
        data-base-transform="translate(-50%, -50%)"
        ref={inlineInputRef}
        contentEditable
        suppressContentEditableWarning
        className={`absolute pointer-events-auto resize-none outline-none ${selectedSvgId ? "border border-indigo-500/50" : ""} rounded-lg text-center font-sans font-medium z-40 overflow-y-auto shadow-xl selection:bg-indigo-600 selection:text-white cursor-text ${isDark ? "bg-[#1c1c21]" : "bg-white"}`}
        onInput={handleInput}
        onKeyUp={(e) => {
          if (["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            scrollToCaret();
          }
        }}
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
            setTimeout(updateActiveFormats, 0);
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            handleFormatText?.("italic");
            setTimeout(updateActiveFormats, 0);
          }
          e.stopPropagation();
        }}
        onBlur={(e) => {
          const related = e.relatedTarget;
          // Don't submit if focus moved to something inside the editor or toolbar
          if (related && inlineInputRef.current?.contains(related as Node)) return;
          if (related && toolbarRef.current?.contains(related as Node)) return;
          // Use setTimeout to check if focus is still within our components
          setTimeout(() => {
            const activeEl = document.activeElement;
            if (activeEl && inlineInputRef.current?.contains(activeEl)) return;
            if (activeEl && toolbarRef.current?.contains(activeEl)) return;
            if (inlineInputRef.current?.querySelector(":focus")) return;
            if (toolbarRef.current?.querySelector(":focus")) return;
            handleEditSubmit();
          }, 0);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setTimeout(updateActiveFormats, 0);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          left: centerX,
          top: baseTop,
          transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
          width: targetVisualWidth,
          height: "auto",
          minHeight: Math.max(textBox.height * scale, 64),
          fontSize: `${fontSize}px`,
          lineHeight: 1.5,
          fontFamily: '"trebuchet ms", verdana, arial, sans-serif',
          color: isDark ? "#e2e8f0" : "#1c1c21",
          whiteSpace: "break-spaces",
          // Column flex keeps text vertically centered (justify-content on the main
          // axis) while the default align-items: stretch lets the alignment wrapper
          // div fill the width — so text-align: left/right/center keeps working.
          // A row flex with justify-content: center would shrink-wrap the wrapper and
          // re-center it as a block, making horizontal alignment a no-op.
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          boxSizing: "border-box",
          textAlign: "center",
          maxHeight: "clamp(240px, 50vh, 400px)",
        }}
      />
    </>
  );
}
