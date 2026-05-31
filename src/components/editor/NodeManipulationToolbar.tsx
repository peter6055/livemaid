import { useRef, useEffect } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Palette, Square, Type, ChevronsDown, Copy, Trash2, RotateCcw } from "lucide-react";
import { PRESET_COLORS } from "@/lib/diagrams/constants";
import { BASIC_SHAPES, EXTENDED_SHAPES } from "@/lib/diagrams/flowchart";

interface NodeManipulationToolbarProps {
  code: string;
  selectedNodeId: string | null;
  currentType: string;
  selectedSvgId: string | null;
  scale: number;
  onUpdateStyle: (property: string, value: string) => void;
  onFormatNodeLabel: (format: string, value?: string) => void;
  onChangeShape: (shape: any) => void;
  onDuplicateNode: () => void;
  onDeleteNode: () => void;
  onResetStyle?: () => void;
}

export function NodeManipulationToolbar({
  code,
  selectedNodeId,
  currentType,
  selectedSvgId,
  scale,
  onUpdateStyle,
  onFormatNodeLabel,
  onChangeShape,
  onDuplicateNode,
  onDeleteNode,
  onResetStyle
}: NodeManipulationToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const stopNativePropagation = (e: Event) => {
      e.stopPropagation();
    };

    el.addEventListener("mousedown", stopNativePropagation);
    el.addEventListener("pointerdown", stopNativePropagation);
    el.addEventListener("touchstart", stopNativePropagation);

    return () => {
      el.removeEventListener("mousedown", stopNativePropagation);
      el.removeEventListener("pointerdown", stopNativePropagation);
      el.removeEventListener("touchstart", stopNativePropagation);
    };
  }, []);
  const getStyleFromCode = (property: string): string | null => {
    if (!selectedNodeId) return null;
    const match = code.match(new RegExp(`^\\s*style\\s+${selectedNodeId}\\s+(.*?)$`, 'm'));
    if (match) {
      const propMatch = match[1].match(new RegExp(`${property}:\\s*([^,;\\s]+)`));
      return propMatch ? propMatch[1] : null;
    }
    return null;
  };

  const getBoldItalicStateFromCode = (format: 'bold' | 'italic'): boolean => {
    if (!selectedNodeId) return false;
    const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\/|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
    const match = code.match(nodeRegex);
    if (match && match[3]) {
      const label = match[3].trim();
      if (format === 'bold') {
        return label.startsWith('<b>') && label.endsWith('</b>') || label.includes('<b>');
      } else {
        return label.startsWith('<i>') && label.endsWith('</i>') || label.includes('<i>');
      }
    }
    return false;
  };

  const getActiveBgColor = () => {
    const fromCode = getStyleFromCode('fill');
    if (fromCode) return fromCode;
    if (!selectedSvgId) return 'transparent';
    try {
      const parent = document.getElementById(selectedSvgId);
      if (!parent) return 'transparent';
      const el = parent.querySelector('rect, circle, polygon, path.node, path, ellipse');
      if (el) {
        return window.getComputedStyle(el).fill || 'transparent';
      }
    } catch (e) {
      console.error(e);
    }
    return 'transparent';
  };

  const getActiveStrokeColor = () => {
    const fromCode = getStyleFromCode('stroke');
    if (fromCode) return fromCode;
    if (!selectedSvgId) return 'transparent';
    try {
      const parent = document.getElementById(selectedSvgId);
      if (!parent) return 'transparent';
      const el = parent.querySelector('rect, circle, polygon, path.node, path, ellipse');
      if (el) {
        return window.getComputedStyle(el).stroke || 'transparent';
      }
    } catch (e) {
      console.error(e);
    }
    return 'transparent';
  };

  const getActiveTextColor = () => {
    const fromCode = getStyleFromCode('color');
    if (fromCode) return fromCode;
    if (!selectedSvgId) return '#000000';
    try {
      const parent = document.getElementById(selectedSvgId);
      if (!parent) return '#000000';
      const el = parent.querySelector('.label, text, .nodeLabel');
      if (el) {
        return window.getComputedStyle(el).fill || '#000000';
      }
    } catch (e) {
      console.error(e);
    }
    return '#000000';
  };

  if (!(currentType === 'graph' || currentType === 'flowchart' || currentType === 'sequence')) {
    return null;
  }

  return (
    <div 
        ref={containerRef}
        data-scale-lock
        data-base-transform="translateX(-50%) translateY(-100%)"
        className="absolute flex items-center gap-0.5 bg-background border border-border rounded-full px-1.5 py-1 pointer-events-auto shadow-lg z-50 text-foreground"
        style={{
          left: '50%',
          top: `calc(-10px * var(--zoom-inverse-scale, ${1 / scale}))`,
          transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
          transformOrigin: 'bottom'
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
    >
        {/* Background Color */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors relative" title="Background Color" />
          }>
                <Palette className="w-4 h-4" />
                <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border border-background shadow-sm transition-colors" style={{ backgroundColor: getActiveBgColor() }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => {
              const activeFill = getStyleFromCode('fill');
              const isSelected = activeFill === c.value;
              return (
                <button 
                  key={c.name} 
                  onClick={() => onUpdateStyle('fill', c.value)} 
                  className={`w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none relative ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 scale-110 dark:ring-offset-background' : ''}`} 
                  style={{ backgroundColor: c.value }} 
                  title={c.name} 
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Border Color */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors relative" title="Border Color" />
          }>
                <Square className="w-4 h-4" />
                <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border border-background shadow-sm transition-colors" style={{ backgroundColor: getActiveStrokeColor() }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => {
              const activeStroke = getStyleFromCode('stroke');
              const isSelected = activeStroke === c.value;
              return (
                <button 
                  key={c.name} 
                  onClick={() => onUpdateStyle('stroke', c.value)} 
                  className={`w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none relative ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 scale-110 dark:ring-offset-background' : ''}`} 
                  style={{ backgroundColor: c.value }} 
                  title={c.name} 
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Text Color */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors relative" title="Text Color" />
          }>
                <Type className="w-4 h-4" />
                <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border border-background shadow-sm transition-colors" style={{ backgroundColor: getActiveTextColor() }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => {
              const activeColor = getStyleFromCode('color');
              const isSelected = activeColor === c.value;
              return (
                <button 
                  key={c.name} 
                  onClick={() => onFormatNodeLabel('color', c.value)} 
                  className={`w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none relative ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 scale-110 dark:ring-offset-background' : ''}`} 
                  style={{ backgroundColor: c.value }} 
                  title={c.name} 
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Bold */}
        <button 
            onClick={(e) => { e.preventDefault(); onFormatNodeLabel('bold'); }}
            className={`h-8 w-8 flex items-center justify-center rounded-full font-bold font-serif transition-colors text-sm ${
                getBoldItalicStateFromCode('bold') ||
                getStyleFromCode('font-weight') === 'bold' || 
                (() => {
                  if (!selectedSvgId) return false;
                  try {
                    const parent = document.getElementById(selectedSvgId);
                    const el = parent?.querySelector('.label, text, .nodeLabel');
                    if (el) {
                      return ['bold', '700', '800', '900'].includes(window.getComputedStyle(el).fontWeight) ||
                             el.querySelector('b') !== null;
                    }
                  } catch (e) {
                    console.error(e);
                  }
                  return false;
                })()
                ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/30 font-extrabold' 
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
            title="Bold Text"
        >
            B
        </button>
        {/* Italic */}
        <button 
            onClick={(e) => { e.preventDefault(); onFormatNodeLabel('italic'); }}
            className={`h-8 w-8 flex items-center justify-center rounded-full italic font-serif transition-colors text-sm ${
                getBoldItalicStateFromCode('italic') ||
                getStyleFromCode('font-style') === 'italic' ||
                (() => {
                  if (!selectedSvgId) return false;
                  try {
                    const parent = document.getElementById(selectedSvgId);
                    const el = parent?.querySelector('.label, text, .nodeLabel');
                    if (el) {
                      return window.getComputedStyle(el).fontStyle === 'italic' ||
                             el.querySelector('i') !== null;
                    }
                  } catch (e) {
                    console.error(e);
                  }
                  return false;
                })()
                ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/30 font-extrabold' 
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
            title="Italic Text"
        >
            I
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Shape Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button 
              className="h-8 px-2 flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-xs font-semibold gap-0.5"
              title="Change Shape"
            />
          }>
              Shape <ChevronsDown className="w-3 h-3 text-muted-foreground" />
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
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Duplicate Node"
        >
            <Copy className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Reset Style */}
        <button 
            onClick={(e) => { e.preventDefault(); onResetStyle?.(); }}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Reset to Theme Defaults"
        >
            <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border mx-1" />
        
        {/* Delete */}
        <button 
            onClick={(e) => {
                e.preventDefault();
                onDeleteNode();
            }}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-destructive/10 text-red-500 hover:text-destructive transition-colors"
            title="Delete Node (Backspace/Delete)"
        >
            <Trash2 className="w-4 h-4" />
        </button>
    </div>
  );
}
