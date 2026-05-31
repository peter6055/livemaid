import { useRef, useEffect } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Palette, Sliders, MoveRight, Edit3, Trash2, Play } from "lucide-react";
import { PRESET_COLORS } from "@/lib/diagrams/constants";
import { 
  parseConnectorStyle, 
  getLinkIndex, 
  parseLinkColor, 
  isEdgeId,
  parseEdgeId,
  CONNECTOR_PATTERN,
  parseLinkAnimation
} from "@/lib/diagrams/utils";

interface EdgeManipulationToolbarProps {
  code: string;
  selectedNodeId: string | null;
  currentType: string;
  selectedSvgId: string | null;
  scale: number;
  onUpdateStyle: (updates: { stroke?: string; arrowType?: string; label?: string }) => void;
  onUpdateColor: (hexColor: string) => void;
  onUpdateAnimation?: (animate: boolean) => void;
  onEditLabel: (e: React.MouseEvent) => void;
  onDeleteEdge: () => void;
}

export function EdgeManipulationToolbar({
  code,
  selectedNodeId,
  currentType,
  selectedSvgId,
  scale,
  onUpdateStyle,
  onUpdateColor,
  onUpdateAnimation,
  onEditLabel,
  onDeleteEdge
}: EdgeManipulationToolbarProps) {

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

  if (!selectedNodeId || !isEdgeId(selectedNodeId)) {
    return null;
  }


  if (!(currentType === 'graph' || currentType === 'flowchart')) {
    return null;
  }

  const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);

  // Extract the connector style from code
  const getConnectorStyle = () => {
    const lines = code.split('\n');
    let currentOccurrence = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
        continue;
      }
      const linkLineRegex = new RegExp(`(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`, 'i');
      const match = line.match(linkLineRegex);
      if (match) {
        if (currentOccurrence === occurrenceIndex) {
          return parseConnectorStyle(match[2]);
        }
        currentOccurrence++;
      }
    }
    return { stroke: 'solid', arrowType: 'arrow' };
  };

  const { stroke, arrowType } = getConnectorStyle();
  const linkIndex = getLinkIndex(code, src, dst, occurrenceIndex);
  const activeColor = parseLinkColor(code, linkIndex) || '#cbd5e1';
  const isAnimated = parseLinkAnimation(code, src, dst, occurrenceIndex);

  const ARROW_TYPES = [
    { value: 'plain', label: 'Plain (---)', icon: '---' },
    { value: 'arrow', label: 'Arrow (-->)', icon: '-->' },
    { value: 'double_arrow', label: 'Double Arrow (<-->)', icon: '<-->' },
    { value: 'cross', label: 'Cross (--x)', icon: '--x' },
    { value: 'double_cross', label: 'Double Cross (x--x)', icon: 'x--x' },
    { value: 'circle', label: 'Circle (--o)', icon: '--o' },
    { value: 'double_circle', label: 'Double Circle (o--o)', icon: 'o--o' },
  ];

  const STROKE_STYLES = [
    { value: 'solid', label: 'Solid Line' },
    { value: 'dashed', label: 'Dashed Line' },
    { value: 'thick', label: 'Thick Line' },
  ];

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
        {/* Arrow Type Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-8 px-2.5 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors relative gap-1 text-xs font-medium" title="Arrow Style" />
          }>
            <MoveRight className="w-4 h-4 mr-0.5" />
            <span>Arrow</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-1 bg-background border border-border rounded-xl min-w-44 flex flex-col gap-0.5" align="center" side="top" sideOffset={10}>
            {ARROW_TYPES.map(type => (
              <button
                key={type.value}
                onClick={() => onUpdateStyle({ arrowType: type.value })}
                className={`w-full px-3 py-1.5 text-left text-xs rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${arrowType === type.value ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-semibold' : ''}`}
              >
                <span>{type.label}</span>
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Stroke Style Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-8 px-2.5 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors relative gap-1 text-xs font-medium" title="Stroke Style" />
          }>
            <Sliders className="w-4 h-4 mr-0.5" />
            <span>Stroke</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-1 bg-background border border-border rounded-xl min-w-40 flex flex-col gap-0.5" align="center" side="top" sideOffset={10}>
            {STROKE_STYLES.map(styleItem => (
              <button
                key={styleItem.value}
                onClick={() => onUpdateStyle({ stroke: styleItem.value })}
                className={`w-full px-3 py-1.5 text-left text-xs rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${stroke === styleItem.value ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-semibold' : ''}`}
              >
                <span>{styleItem.label}</span>
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Line/Edge Color Picker */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors relative" title="Line Color" />
          }>
            <Palette className="w-4 h-4" />
            <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border border-background shadow-sm transition-colors" style={{ backgroundColor: activeColor }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl grid grid-cols-4 gap-2" align="center" side="top" sideOffset={10}>
            {PRESET_COLORS.map(c => {
              const isSelected = activeColor.toLowerCase() === c.value.toLowerCase();
              return (
                <button 
                  key={c.name} 
                  onClick={() => onUpdateColor(c.value)} 
                  className={`w-8 h-8 rounded-full border border-slate-200 hover:scale-110 transition-transform focus:outline-none relative ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 scale-110 dark:ring-offset-background' : ''}`} 
                  style={{ backgroundColor: c.value }} 
                  title={c.name} 
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="w-px h-4 bg-border mx-1" />

        {/* Toggle Animation */}
        {onUpdateAnimation && (
          <button
            onClick={(e) => { e.preventDefault(); onUpdateAnimation(!isAnimated); }}
            className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${isAnimated ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25' : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground'}`}
            title="Toggle Animation"
          >
            <Play className={`w-4 h-4 ${isAnimated ? 'animate-pulse fill-current' : ''}`} />
          </button>
        )}

        {/* Edit Label */}
        <button
          onClick={(e) => { e.preventDefault(); onEditLabel(e); }}
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Edit Label Text"
        >
          <Edit3 className="w-4 h-4" />
        </button>

        {/* Delete Edge */}
        <button
          onClick={(e) => { e.preventDefault(); onDeleteEdge(); }}
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground"
          title="Delete Edge"
        >
          <Trash2 className="w-4 h-4" />
        </button>
    </div>
  );
}
