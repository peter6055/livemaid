import { RefObject, useEffect } from "react";

interface InlineTextEditorProps {
  isInlineEditing: boolean;
  setIsInlineEditing: (v: boolean) => void;
  textBox: { x: number, y: number, width: number, height: number } | null;
  selectionBox: { x: number, y: number, width: number, height: number } | null;
  scale: number;
  theme: string | undefined;
  editingText: string;
  setEditingText: (text: string) => void;
  handleEditSubmit: () => void;
  inlineInputRef: RefObject<HTMLTextAreaElement | null>;
  selectedSvgId: string | null;
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
  selectedSvgId
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
      if (
        inlineInputRef.current && 
        !inlineInputRef.current.contains(event.target as Node)
      ) {
        handleEditSubmit();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isInlineEditing, handleEditSubmit, inlineInputRef]);

  if (!isInlineEditing || !textBox || !selectionBox) return null;

  const offsetCanvas = 4 / scale;
  const relativeNodeX = textBox.x - (selectionBox.x - offsetCanvas);
  const relativeNodeY = textBox.y - (selectionBox.y - offsetCanvas);
  const centerX = relativeNodeX + textBox.width / 2;
  const centerY = relativeNodeY + textBox.height / 2;

  const targetVisualWidth = Math.min(Math.max(textBox.width + 200, 350), 700);
  const targetVisualHeight = Math.max(textBox.height + 20, 40);

  return (
    <textarea
        data-scale-lock
        data-base-transform="translate(-50%, -50%)"
        ref={inlineInputRef}
        className="absolute p-2 bg-white/95 backdrop-blur-sm pointer-events-auto resize-none outline-none border border-indigo-500/50 rounded-lg text-center flex items-center justify-center font-sans font-medium break-words z-40 overflow-hidden shadow-xl selection:bg-indigo-600 selection:text-white"
        value={editingText}
        onChange={(e) => setEditingText(e.target.value)}
        onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEditSubmit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsInlineEditing(false);
            }
            e.stopPropagation();
        }}
        onBlur={(e) => {
            // Don't submit on blur if focus is moving to another part of the same textarea
            // Use a small timeout to allow relatedTarget to be set
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
            fontSize: '14px',
            lineHeight: 1.4,
            color: '#1c1c21',
        }}
    />
  );
}
