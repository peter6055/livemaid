import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronsDown, ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Check, Type, LayoutTemplate } from "lucide-react";

const FlowchartToolbar = ({ code, setCode, selectedNodeId }: EditorContext) => {
  const currentDirection = (() => {
      const m = code.match(/(flowchart|graph)\s+(TD|TB|BT|RL|LR)/);
      return m ? m[2] : 'TD';
  })();

  const handleDirectionChange = (newDir: string) => {
      let newCode = code;
      const regex = /(flowchart|graph)\s+(TD|TB|BT|RL|LR)/;
      if (regex.test(newCode)) {
          newCode = newCode.replace(regex, `$1 ${newDir}`);
      } else {
          newCode = newCode.replace(/(flowchart|graph)/, `$1 ${newDir}`);
      }
      setCode(newCode);
  };

  const handleAddShape = (shape: {b?: [string, string] | null, isText?: boolean, expanded?: string}) => {
      const newNodeId = `node_${Date.now()}`;
      const label = "New Node";
      let newCode = code;

      let nodeDef = "";
      if (shape.isText) {
          nodeDef = `${newNodeId}["Text Block"]`;
      } else if (shape.expanded) {
          nodeDef = `${newNodeId}@{ shape: ${shape.expanded}, label: "${label}" }`;
      } else if (shape.b) {
          const brackets = shape.b as [string, string];
          nodeDef = `${newNodeId}${brackets[0]}${label}${brackets[1]}`;
      }
      
      if (selectedNodeId) {
          if (shape.expanded) {
              newCode += `\n    ${nodeDef}\n    ${selectedNodeId} --> ${newNodeId}`;
          } else {
              newCode += `\n    ${selectedNodeId} --> ${nodeDef}`;
          }
      } else {
          newCode += `\n    ${nodeDef}`;
      }
      setCode(newCode);
  };

  const handleAddTextBlock = () => {
      handleAddShape({b: null, isText: true});
  };

  const handleAddSubgraph = () => {
      const subId = `sub_${Date.now()}`;
      const nodeId = `node_${Date.now()}`;
      const newCode = code + `\n    subgraph ${subId}["Untitled subgraph"]\n        ${nodeId}["Untitled Node"]\n    end`;
      setCode(newCode);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center" />}>
          <ChevronsDown className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-1" sideOffset={10} align="start">
            <div className="flex flex-col">
              {[
                { id: 'TD', label: 'Top to bottom', icon: <ArrowDown className="w-4 h-4" /> },
                { id: 'BT', label: 'Bottom to top', icon: <ArrowUp className="w-4 h-4" /> },
                { id: 'LR', label: 'Left to right', icon: <ArrowRight className="w-4 h-4" /> },
                { id: 'RL', label: 'Right to left', icon: <ArrowLeft className="w-4 h-4" /> },
              ].map((d) => (
                  <DropdownMenuItem 
                    key={d.id}
                    onClick={() => handleDirectionChange(d.id)}
                    className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent"
                  >
                    {d.icon}
                    <span className="flex-1 text-sm font-medium">{d.label}</span>
                    {currentDirection === d.id && <Check className="w-4 h-4 text-indigo-500" />}
                  </DropdownMenuItem>
              ))}
            </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-5 w-px bg-border" />
      <div className="flex items-center gap-2 px-2 opacity-70" title="Auto Layout is locked">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto Layout</span>
          <div className="w-7 h-4 bg-indigo-500 rounded-full flex items-center px-0.5 cursor-not-allowed">
            <div className="w-3 h-3 bg-white rounded-full translate-x-3 shadow-sm" />
          </div>
      </div>
      <div className="h-5 w-px bg-border" />

      <div className="flex items-center gap-2 rounded-xl bg-background p-0 border-none">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" />}>
            <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="currentColor" d="M6.5 11L12 2l5.5 9zm11 11q-1.875 0-3.187-1.312T13 17.5t1.313-3.187T17.5 13t3.188 1.313T22 17.5t-1.312 3.188T17.5 22M3 21.5v-8h8v8zM17.5 20q1.05 0 1.775-.725T20 17.5t-.725-1.775T17.5 15t-1.775.725T15 17.5t.725 1.775T17.5 20M5 19.5h4v-4H5zM10.05 9h3.9L12 5.85zm7.45 8.5"></path></svg>
            <span>Shape</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[340px] max-h-[60vh] overflow-y-auto p-4 bg-background border-border rounded-xl flex flex-col gap-6" sideOffset={10} align="start">
              {/* Basic Shapes */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-slate-500 px-1 uppercase tracking-wider">Basic</p>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { b: null, isText: true, l: 'Text', i: <text x="12" y="16" fontSize="14" fontFamily="sans-serif" textAnchor="middle" fill="currentColor" fontWeight="bold">T</text> },
                    { b: ['[', ']'], l: 'Square', i: <rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['(', ')'], l: 'Rounded', i: <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['([', '])'], l: 'Stadium', i: <rect x="3" y="7" width="18" height="10" rx="5" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['((', '))'], l: 'Circle', i: <circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['{', '}'], l: 'Rhombus', i: <polygon points="12 4, 20 12, 12 20, 4 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['{{', '}}'], l: 'Hexagon', i: <polygon points="12 4, 20 8, 20 16, 12 20, 4 16, 4 8" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['[(', ')]'], l: 'Cylinder', i: <path d="M5 7 C5 5, 19 5, 19 7 V17 C19 19, 5 19, 5 17 Z M5 7 C5 9, 19 9, 19 7" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['[/', '/]'], l: 'Parallelogram', i: <polygon points="7 20, 21 20, 17 4, 3 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['[\\', '\\]'], l: 'Parallelogram Alt', i: <polygon points="3 20, 17 20, 21 4, 7 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['[/', '\\]'], l: 'Trapezoid', i: <polygon points="7 20, 17 20, 21 4, 3 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['[\\', '/]'], l: 'Trapezoid Alt', i: <polygon points="3 20, 21 20, 17 4, 7 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['(((', ')))'], l: 'Double Circle', i: <g><circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" strokeWidth="1.5" /><circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                    { b: ['>', ']'], l: 'Asymmetric', i: <path d="M4 4 h11 l5 8 l-5 8 h-11 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { b: ['[[', ']]'], l: 'Subroutine', i: <path d="M4 4 h16 v16 h-16 z M8 4 v16 M16 4 v16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                  ].map((shape, i) => (
                      <DropdownMenuItem 
                        key={i}
                        onClick={() => handleAddShape(shape as any)}
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
                  {[
                    { expanded: 'bang', l: 'Bang', i: <path d="M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'notch-rect', l: 'Card', i: <path d="M4 4 h12 l4 4 v12 h-16 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'cloud', l: 'Cloud', i: <path d="M7 17 a4 4 0 1 1 0 -8 a5 5 0 1 1 10 -2 a4.5 4.5 0 1 1 1 8.5 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'hourglass', l: 'Collate', i: <polygon points="6 4, 18 4, 12 12, 18 20, 6 20, 12 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'bolt', l: 'Com Link', i: <path d="M13 3 L4 14 h7 l-2 7 11 -13 h-7 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'brace', l: 'Comment', i: <path d="M15 4 Q10 4 10 12 Q10 20 15 20 M10 12 Q5 12 5 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'brace-r', l: 'Comment Right', i: <path d="M9 4 Q14 4 14 12 Q14 20 9 20 M14 12 Q19 12 19 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'braces', l: 'Comment Braces', i: <path d="M9 4 Q4 4 4 12 Q4 20 9 20 M15 4 Q20 4 20 12 Q20 20 15 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'lean-r', l: 'Data IO (R)', i: <polygon points="6 20, 20 20, 18 4, 4 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'lean-l', l: 'Data IO (L)', i: <polygon points="4 20, 18 20, 20 4, 6 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'datastore', l: 'Data Store', i: <path d="M4 6 h16 M4 18 h16 M4 6 v12 M20 6 v12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'cyl', l: 'Database', i: <path d="M4 6 C4 4, 20 4, 20 6 V18 C20 20, 4 20, 4 18 Z M4 6 C4 8, 20 8, 20 6" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'diam', l: 'Decision', i: <polygon points="12 3, 21 12, 12 21, 3 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'delay', l: 'Delay', i: <path d="M4 4 h8 a8 8 0 0 1 0 16 h-8 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'h-cyl', l: 'Direct Access', i: <path d="M6 4 C4 4, 4 20, 6 20 H18 C20 20, 20 4, 18 4 Z M6 4 C8 4, 8 20, 6 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'lin-cyl', l: 'Disk Storage', i: <path d="M4 6 C4 4, 20 4, 20 6 V18 C20 20, 4 20, 4 18 Z M4 6 C4 8, 20 8, 20 6 M4 10 h16 M4 14 h16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'curv-trap', l: 'Display', i: <path d="M4 12 C4 4, 8 4, 8 4 H20 V20 H8 C8 20, 4 20, 4 12 Z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'div-rect', l: 'Divided Process', i: <g><rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /><line x1="4" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1.5" /></g> },
                    { expanded: 'doc', l: 'Document', i: <path d="M4 4 h16 v12 c-4 -4, -8 4, -16 0 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'event', l: 'Event', i: <rect x="4" y="4" width="16" height="16" rx="8" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'tri', l: 'Extract', i: <polygon points="12 4, 20 20, 4 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'fork', l: 'Fork/Join', i: <rect x="4" y="10" width="16" height="4" fill="currentColor" /> },
                    { expanded: 'win-pane', l: 'Internal Storage', i: <g><rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /><line x1="4" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" /><line x1="8" y1="4" x2="8" y2="20" stroke="currentColor" strokeWidth="1.5" /></g> },
                    { expanded: 'f-circ', l: 'Junction', i: <circle cx="12" cy="12" r="8" fill="currentColor" /> },
                    { expanded: 'lin-doc', l: 'Lined Document', i: <path d="M4 4 h16 v12 c-4 -4, -8 4, -16 0 z M4 8 h16 M4 12 h16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'lin-rect', l: 'Lined Process', i: <g><rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /><line x1="7" y1="4" x2="7" y2="20" stroke="currentColor" strokeWidth="1.5" /><line x1="17" y1="4" x2="17" y2="20" stroke="currentColor" strokeWidth="1.5" /></g> },
                    { expanded: 'notch-pent', l: 'Loop Limit', i: <polygon points="4 10, 12 4, 20 10, 20 20, 4 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'flip-tri', l: 'Manual File', i: <polygon points="4 4, 20 4, 12 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'sl-rect', l: 'Manual Input', i: <polygon points="4 8, 20 4, 20 20, 4 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'trap-t', l: 'Manual Op', i: <polygon points="6 4, 18 4, 22 20, 2 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'docs', l: 'Multi-Document', i: <path d="M8 8 h12 v10 c-3 -3, -6 3, -12 0 z M6 6 h12 v10 M4 4 h12 v10" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'st-rect', l: 'Multi-Process', i: <g><rect x="8" y="8" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="1.5" /><rect x="6" y="6" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="1.5" /><rect x="4" y="4" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                    { expanded: 'odd', l: 'Odd', i: <polygon points="12 4, 20 12, 12 20, 4 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'flag', l: 'Paper Tape', i: <path d="M4 4 q 4 -2, 8 0 t 8 0 v12 q -4 2, -8 0 t -8 0 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'hex', l: 'Prepare', i: <polygon points="8 4, 16 4, 20 12, 16 20, 8 20, 4 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'trap-b', l: 'Priority Action', i: <polygon points="2 4, 22 4, 18 20, 6 20" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'rect', l: 'Process', i: <rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'circle', l: 'Start', i: <circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'sm-circ', l: 'Start (Small)', i: <circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'dbl-circ', l: 'Stop', i: <g><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" strokeWidth="1.5" /><circle cx="12" cy="12" r="6" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                    { expanded: 'fr-circ', l: 'Stop (Framed)', i: <g><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" strokeWidth="1.5" /><circle cx="12" cy="12" r="7.5" stroke="currentColor" fill="none" strokeWidth="0.5" /></g> },
                    { expanded: 'bow-rect', l: 'Stored Data', i: <path d="M6 4 h12 a4 12 0 0 0 0 16 h-12 a4 12 0 0 1 0 -16 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                    { expanded: 'fr-rect', l: 'Subprocess', i: <g><rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /><rect x="6" y="6" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                    { expanded: 'cross-circ', l: 'Summary', i: <g><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" strokeWidth="1.5" /><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" /></g> },
                    { expanded: 'tag-doc', l: 'Tagged Doc', i: <g><path d="M4 4 h16 v12 c-4 -4, -8 4, -16 0 z" stroke="currentColor" fill="none" strokeWidth="1.5" /><path d="M4 4 l6 6 v4" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                    { expanded: 'tag-rect', l: 'Tagged Process', i: <g><rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /><polygon points="4 4, 12 4, 12 12" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                    { expanded: 'stadium', l: 'Terminal', i: <rect x="4" y="6" width="16" height="12" rx="6" stroke="currentColor" fill="none" strokeWidth="1.5" /> }
                  ].map((shape, i) => (
                      <DropdownMenuItem 
                        key={i}
                        onClick={() => handleAddShape(shape as any)}
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
        <Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" onClick={handleAddTextBlock}>
            <Type className="w-4 h-4" />
            <span>Text</span>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" onClick={handleAddSubgraph}>
            <LayoutTemplate className="w-4 h-4" />
            <span>Subgraph</span>
        </Button>
      </div>
    </>
  );
};

export const FlowchartPlugin: DiagramPlugin = {
  id: 'flowchart',
  label: 'Flowchart',
  defaultCode: `flowchart TD\n    A[Start] --> B[End]`,
  ToolbarComponent: FlowchartToolbar
};
