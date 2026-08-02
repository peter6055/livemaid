import { RefObject, useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

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

function isFormatTag(node: Node, format: "bold" | "italic"): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName.toLowerCase();
  return format === "bold" ? tag === "b" || tag === "strong" : tag === "i" || tag === "em";
}

function getTextNodesInRange(range: Range, el: HTMLElement): Text[] {
  if (range.collapsed) {
    const textNodes: Text[] = [];
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    } else if (node instanceof HTMLElement && node === el) {
      const child = node.childNodes[range.startOffset];
      if (child && child.nodeType === Node.TEXT_NODE) {
        textNodes.push(child as Text);
      } else {
        const prev = node.childNodes[range.startOffset - 1];
        if (prev && prev.nodeType === Node.TEXT_NODE) textNodes.push(prev as Text);
      }
    }
    return textNodes.filter((n) => n.textContent?.trim());
  }

  const textNodes: Text[] = [];
  const iterator = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = iterator.nextNode())) {
    if (range.intersectsNode(node) && node.textContent?.trim()) {
      textNodes.push(node as Text);
    }
  }
  return textNodes;
}

function isAllContentFormatted(el: HTMLElement, format: "bold" | "italic"): boolean {
  const textNodes: Text[] = [];
  const collect = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        textNodes.push(child as Text);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        collect(child);
      }
    });
  };
  collect(el);
  if (textNodes.length === 0) return false;
  return textNodes.every((textNode) => {
    let node: Node | null = textNode.parentNode;
    while (node && node !== el) {
      if (isFormatTag(node, format)) return true;
      node = node.parentNode;
    }
    return false;
  });
}

export function getActiveFormats(el: HTMLElement | null): {
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right" | "";
} {
  if (!el) return { bold: false, italic: false, align: "" };

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

  const coversAllContent = (r: Range) =>
    r.startContainer === el &&
    r.startOffset === 0 &&
    r.endContainer === el &&
    r.endOffset === el.childNodes.length;

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
  } else if (range.collapsed || coversAllContent(range)) {
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
      return;
    }

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
    // Only update if the content differs to avoid cursor jumps
    if (el.innerHTML !== editingText) {
      el.innerHTML = editingText;
    }
  }, [isInlineEditing, editingText, inlineInputRef]);

  useLayoutEffect(() => {
    if (!isInlineEditing || !textBox || !selectionBox) return;
    const el = inlineInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minHeight = Math.max(textBox.height * scale, 24);
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
    setMeasuredHeight(el.getBoundingClientRect().height);
  }, [editingText, inlineInputRef, isInlineEditing, selectionBox, textBox, scale]);

  const handleInput = useCallback(() => {
    const el = inlineInputRef.current;
    if (!el) return;
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
  // Keep the editor at the rendered node's visual size so wrapping matches the graph output.
  // textBox is stored in unscaled canvas units; multiply by the current zoom so the overlay
  // covers the same CSS pixels as the underlying SVG node.
  // We no longer expand the width to fit the longest line; that prevents the editor from
  // showing the same line breaks Mermaid will render.
  const targetVisualWidth = Math.min(Math.max(textBox.width * scale, 24), 700);
  const targetVisualHeight = measuredHeight ?? Math.max(textBox.height * scale, 24);

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

            <div className="w-px h-4 bg-border mx-0.5" />

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
          top: centerY,
          transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
          width: targetVisualWidth,
          height: targetVisualHeight,
          fontSize: `${fontSize}px`,
          lineHeight: 1.5,
          fontFamily: '"trebuchet ms", verdana, arial, sans-serif',
          color: "#1c1c21",
          whiteSpace: "break-spaces",
          display: "table",
          boxSizing: "border-box",
        }}
      />
    </>
  );
}
