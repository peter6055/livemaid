import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Palette, Square, Type, ChevronsDown, Copy, Trash2 } from "lucide-react";
import { PRESET_COLORS } from "@/lib/diagrams/constants";
import { BASIC_SHAPES, EXTENDED_SHAPES } from "@/lib/diagrams/flowchart";
import { CSSProperties } from "react";

interface NodeManipulationToolbarProps {
  currentType: string;
  selectedSvgId: string | null;
  toolbarStyle: CSSProperties;
  onUpdateStyle: (property: string, value: string) => void;
  onFormatNodeLabel: (format: string, value?: string) => void;
  onChangeShape: (shape: any) => void;
  onDuplicateNode: () => void;
  onDeleteNode: () => void;
}

export function NodeManipulationToolbar({
  currentType,
  selectedSvgId,
  toolbarStyle,
  onUpdateStyle,
  onFormatNodeLabel,
  onChangeShape,
  onDuplicateNode,
  onDeleteNode
}: NodeManipulationToolbarProps) {

  if (!(currentType === 'graph' || currentType === 'flowchart' || currentType === 'sequence')) {
    return null;
  }

  return (
    <div 
        className="absolute flex items-center gap-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-full px-2 py-1.5 pointer-events-auto shadow-lg z-50 text-slate-700 dark:text-zinc-300"
        style={toolbarStyle}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
    >
        {/* Background Color */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors relative" title="Background Color" />
          }>
                <Palette className="w-5 h-5" />
                <div className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-300" style={{ backgroundColor: selectedSvgId && document.querySelector(`#${selectedSvgId} rect, #${selectedSvgId} circle, #${selectedSvgId} polygon, #${selectedSvgId} path.node`) ? window.getComputedStyle(document.querySelector(`#${selectedSvgId} rect, #${selectedSvgId} circle, #${selectedSvgId} polygon, #${selectedSvgId} path.node`)!).fill : 'transparent' }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => (
              <button key={c.name} onClick={() => onUpdateStyle('fill', c.value)} className="w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none" style={{ backgroundColor: c.value }} title={c.name} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Border Color */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors relative" title="Border Color" />
          }>
                <Square className="w-5 h-5" />
                <div className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-300" style={{ backgroundColor: selectedSvgId && document.querySelector(`#${selectedSvgId} rect, #${selectedSvgId} circle, #${selectedSvgId} polygon, #${selectedSvgId} path.node`) ? window.getComputedStyle(document.querySelector(`#${selectedSvgId} rect, #${selectedSvgId} circle, #${selectedSvgId} polygon, #${selectedSvgId} path.node`)!).stroke : 'transparent' }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => (
              <button key={c.name} onClick={() => onUpdateStyle('stroke', c.value)} className="w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none" style={{ backgroundColor: c.value }} title={c.name} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800 mx-1.5" />

        {/* Text Color */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors relative" title="Text Color" />
          }>
                <Type className="w-5 h-5" />
                <div className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-300" style={{ backgroundColor: selectedSvgId && document.querySelector(`#${selectedSvgId} .label, #${selectedSvgId} text`) ? window.getComputedStyle(document.querySelector(`#${selectedSvgId} .label, #${selectedSvgId} text`)!).fill : '#000000' }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => (
              <button key={c.name} onClick={() => onFormatNodeLabel('color', c.value)} className="w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none" style={{ backgroundColor: c.value }} title={c.name} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Bold */}
        <button 
            onClick={(e) => { e.preventDefault(); onFormatNodeLabel('bold'); }}
            className={`h-10 w-10 flex items-center justify-center rounded-full font-bold font-serif transition-colors text-lg ${selectedSvgId && document.querySelector('#' + selectedSvgId + ' .label, #' + selectedSvgId + ' text') && ['bold', '700', '800', '900'].includes(window.getComputedStyle(document.querySelector('#' + selectedSvgId + ' .label, #' + selectedSvgId + ' text')!).fontWeight) ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-zinc-800'}`}
            title="Bold Text"
        >
            B
        </button>
        {/* Italic */}
        <button 
            onClick={(e) => { e.preventDefault(); onFormatNodeLabel('italic'); }}
            className={`h-10 w-10 flex items-center justify-center rounded-full italic font-serif transition-colors text-lg ${selectedSvgId && document.querySelector('#' + selectedSvgId + ' .label, #' + selectedSvgId + ' text') && window.getComputedStyle(document.querySelector('#' + selectedSvgId + ' .label, #' + selectedSvgId + ' text')!).fontStyle === 'italic' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-zinc-800'}`}
            title="Italic Text"
        >
            I
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800 mx-1.5" />

        {/* Shape Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button 
              className="h-10 px-3 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium gap-1"
              title="Change Shape"
            />
          }>
              Shape <ChevronsDown className="w-3 h-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[340px] max-h-[60vh] overflow-y-auto p-4 bg-background border-border rounded-xl flex flex-col gap-6" sideOffset={10} align="center" side="top">
              {/* Basic Shapes */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-slate-500 px-1 uppercase tracking-wider">Basic</p>
                <div className="grid grid-cols-6 gap-2">
                  {BASIC_SHAPES.map((shape, i) => (
                      <DropdownMenuItem 
                        key={i}
                        onClick={() => onChangeShape(shape as any)}
                        className="flex items-center justify-center w-10 h-10 bg-background border border-border rounded hover:border-indigo-400 hover:bg-accent cursor-pointer text-foreground p-0"
                        title={shape.l}
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                            {shape.i}
                        </svg>
                      </DropdownMenuItem>
                  ))}
                </div>
              </div>

              {/* Extended Shapes */}
              <div className="flex flex-col gap-3 mt-4">
                <p className="text-xs font-semibold text-slate-500 px-1 uppercase tracking-wider">Extended (Mermaid v11+)</p>
                <div className="grid grid-cols-6 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {EXTENDED_SHAPES.map((shape, i) => (
                      <DropdownMenuItem 
                        key={i}
                        onClick={() => onChangeShape(shape as any)}
                        className="flex items-center justify-center w-10 h-10 bg-background border border-border rounded hover:border-indigo-400 hover:bg-accent cursor-pointer text-foreground p-0"
                        title={shape.l}
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                            {shape.i}
                        </svg>
                      </DropdownMenuItem>
                  ))}
                </div>
              </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Duplicate */}
        <button 
            onClick={(e) => { e.preventDefault(); onDuplicateNode(); }}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            title="Duplicate Node"
        >
            <Copy className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800 mx-1.5" />
        
        {/* Delete */}
        <button 
            onClick={(e) => {
                e.preventDefault();
                onDeleteNode();
            }}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            title="Delete Node (Backspace/Delete)"
        >
            <Trash2 className="w-5 h-5" />
        </button>
    </div>
  );
}
