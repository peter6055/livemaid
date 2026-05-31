import { RefObject, useEffect, useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PRESET_COLORS } from "@/lib/diagrams/constants";

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
  handleFormatText: (format: string, value?: string) => void;
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
  handleFormatText,
  inlineInputRef,
  selectedSvgId
}: InlineTextEditorProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isInlineEditing) return;

    const stopNativePropagation = (e: Event) => {
      e.stopPropagation();
    };

    const toolbar = toolbarRef.current;
    if (toolbar) {
      toolbar.addEventListener("mousedown", stopNativePropagation);
      toolbar.addEventListener("pointerdown", stopNativePropagation);
      toolbar.addEventListener("touchstart", stopNativePropagation);
    }

    const input = inlineInputRef.current;
    if (input) {
      input.addEventListener("mousedown", stopNativePropagation);
      input.addEventListener("pointerdown", stopNativePropagation);
      input.addEventListener("touchstart", stopNativePropagation);
    }

    return () => {
      if (toolbar) {
        toolbar.removeEventListener("mousedown", stopNativePropagation);
        toolbar.removeEventListener("pointerdown", stopNativePropagation);
        toolbar.removeEventListener("touchstart", stopNativePropagation);
      }
      if (input) {
        input.removeEventListener("mousedown", stopNativePropagation);
        input.removeEventListener("pointerdown", stopNativePropagation);
        input.removeEventListener("touchstart", stopNativePropagation);
      }
    };
  }, [isInlineEditing, inlineInputRef]);

  useEffect(() => {
    if (!isInlineEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click was outside textarea
      if (
        inlineInputRef.current && 
        !inlineInputRef.current.contains(event.target as Node)
      ) {
        // Check if we clicked on the inline formatting toolbar
        const toolbar = document.querySelector('[data-inline-toolbar]');
        if (toolbar && toolbar.contains(event.target as Node)) {
          return;
        }

        // Check if we clicked on the dropdown content (e.g. preset colors)
        const dropdownContents = document.querySelectorAll('[role="menu"], [data-radix-menu-content]');
        for (const dropdown of Array.from(dropdownContents)) {
          if (dropdown.contains(event.target as Node)) {
            return;
          }
        }
        
        handleEditSubmit();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isInlineEditing, handleEditSubmit, inlineInputRef]);

  if (!isInlineEditing || !textBox || !selectionBox) return null;

  return (
    <>
      {/* Formatting Toolbar */}
      <div 
          ref={toolbarRef}
          data-inline-toolbar
          data-scale-lock
          data-base-transform="translateX(-50%)"
          className="absolute left-1/2 flex items-center gap-1 bg-[#1c1c21] rounded-lg p-1 pointer-events-auto shadow-xl z-50 text-white"
          style={{ 
              top: `calc(-50px * var(--zoom-inverse-scale, ${1 / scale}))`,
              transform: `translateX(-50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
              transformOrigin: 'bottom center',
              left: '50%'
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
      >
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors">
                  <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)' }} />
              </button>
            }>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 p-2 bg-white border-slate-200 rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
              {PRESET_COLORS.map(c => (
                <button 
                    key={c.name} 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleFormatText('color', c.value); }} 
                    className="w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none" 
                    style={{ backgroundColor: c.value }} 
                    title={c.name} 
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <button 
              onClick={(e) => { e.preventDefault(); handleFormatText('bold'); }} 
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/10 font-bold font-serif transition-colors"
          >
              B
          </button>
          <button 
              onClick={(e) => { e.preventDefault(); handleFormatText('italic'); }} 
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/10 italic font-serif transition-colors"
          >
              I
          </button>
      </div>
      
      {/* Textarea Overlay */}
      <textarea
          data-scale-lock
          data-base-transform="translate(-50%, -50%)"
          ref={inlineInputRef}
          className="absolute p-2 bg-white/95 backdrop-blur-sm pointer-events-auto resize-none outline-none border border-indigo-500/50 rounded-lg text-center flex items-center justify-center font-sans font-medium break-words z-40 overflow-hidden shadow-xl"
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
              handleEditSubmit();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{
              left: (textBox.x - (selectionBox.x - 4)) + textBox.width / 2,
              top: (textBox.y - (selectionBox.y - 4)) + textBox.height / 2,
              transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
              width: Math.max(textBox.width * scale + 40, 150),
              height: Math.max(textBox.height * scale + 20, 40),
              fontSize: '14px',
              lineHeight: 1.4,
              color: (() => {
                if (!selectedSvgId) return '#1e1e24';
                const el = document.querySelector(`#${selectedSvgId}`);
                if (!el) return '#1e1e24';
                const textEl = el.querySelector('.label, text, span, .messageText, .noteText') || el;
                const computed = window.getComputedStyle(textEl);
                const val = computed.fill || computed.color;
                return val && val !== 'none' ? val : '#1e1e24';
              })(),
          }}
      />
    </>
  );
}
