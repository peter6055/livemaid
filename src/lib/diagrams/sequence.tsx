import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { User, MessageSquare, StickyNote, RefreshCw, GitBranch, ArrowRight, ArrowRightToLine, Undo2, Hash, Power, SquareSquare } from "lucide-react";

const SequenceToolbar = ({ code, setCode }: EditorContext) => {
  
  const handleAddParticipant = () => {
      const p = `Participant_${Date.now().toString().slice(-4)}`;
      // Find the best place to insert: usually right after the sequenceDiagram declaration or other participants
      let newCode = code;
      const lines = newCode.split('\n');
      const insertIdx = lines.findIndex(l => !l.startsWith('sequenceDiagram') && !l.trim().startsWith('participant') && !l.trim().startsWith('actor') && l.trim() !== '');
      
      const insertLine = `    participant ${p} as New Participant`;
      if (insertIdx === -1 || insertIdx === 0) {
          newCode += `\n${insertLine}`;
      } else {
          lines.splice(insertIdx, 0, insertLine);
          newCode = lines.join('\n');
      }
      setCode(newCode);
  };

  const handleAddMessage = (type: 'sync' | 'async' | 'reply') => {
      const arrow = type === 'sync' ? '->>' : type === 'async' ? '-)' : '-->>';
      const newCode = code + `\n    A${arrow}B: New Message`;
      setCode(newCode);
  };

  const handleAddNote = () => {
      const newCode = code + `\n    note over A,B: New Note`;
      setCode(newCode);
  };

  const handleAddBlock = (type: 'alt' | 'loop' | 'rect' | 'opt' | 'par') => {
      let block = '';
      if (type === 'alt') {
          block = `\n    alt Condition\n        A->>B: Message\n    else Alternative\n        A->>B: Message\n    end`;
      } else if (type === 'loop') {
          block = `\n    loop Loop Name\n        A->>B: Message\n    end`;
      } else if (type === 'rect') {
          block = `\n    rect rgb(200, 200, 255)\n        note right of A: Highlighted section\n    end`;
      } else if (type === 'opt') {
          block = `\n    opt Optional\n        A->>B: Message\n    end`;
      } else if (type === 'par') {
          block = `\n    par Action 1\n        A->>B: Message 1\n    and Action 2\n        A->>C: Message 2\n    end`;
      }
      const newCode = code + block;
      setCode(newCode);
  };

  const handleToggleAutonumber = () => {
      if (code.includes('autonumber')) {
          setCode(code.replace(/\n\s*autonumber/, ''));
      } else {
          // Add it right after sequenceDiagram
          setCode(code.replace('sequenceDiagram', 'sequenceDiagram\n    autonumber'));
      }
  };

  const handleActivation = (type: 'activate' | 'deactivate') => {
      const newCode = code + `\n    ${type} A`;
      setCode(newCode);
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl bg-background p-0 border-none">
        <Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" onClick={handleAddParticipant} title="Add Participant">
            <User className="w-4 h-4" />
            <span>Actor</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" />}>
            <MessageSquare className="w-4 h-4" />
            <span>Message</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-1" sideOffset={10} align="start">
              <DropdownMenuItem onClick={() => handleAddMessage('sync')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <ArrowRightToLine className="w-4 h-4" />
                <span className="flex-1 text-sm font-medium">Sync Request</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddMessage('async')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <ArrowRight className="w-4 h-4" />
                <span className="flex-1 text-sm font-medium">Async Request</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddMessage('reply')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <Undo2 className="w-4 h-4" />
                <span className="flex-1 text-sm font-medium">Reply</span>
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" onClick={handleAddNote} title="Add Note">
            <StickyNote className="w-4 h-4" />
            <span>Note</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" />}>
            <GitBranch className="w-4 h-4" />
            <span>Logic</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-1" sideOffset={10} align="start">
              <DropdownMenuItem onClick={() => handleAddBlock('alt')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <GitBranch className="w-4 h-4" />
                <span className="flex-1 text-sm font-medium">Alt (If/Else)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddBlock('opt')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <GitBranch className="w-4 h-4 opacity-50" />
                <span className="flex-1 text-sm font-medium">Opt (Optional)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddBlock('loop')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <RefreshCw className="w-4 h-4" />
                <span className="flex-1 text-sm font-medium">Loop</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddBlock('par')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <RefreshCw className="w-4 h-4 opacity-50" />
                <span className="flex-1 text-sm font-medium">Par (Parallel)</span>
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-6 bg-border mx-1" />

        <Button variant="ghost" size="sm" className={`h-8 flex items-center gap-2 ${code.includes('autonumber') ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'text-foreground hover:bg-accent'}`} onClick={handleToggleAutonumber} title="Toggle Autonumber">
            <Hash className="w-4 h-4" />
            <span>Autonumber</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" />}>
            <Power className="w-4 h-4" />
            <span>Activate</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-1" sideOffset={10} align="start">
              <DropdownMenuItem onClick={() => handleActivation('activate')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <Power className="w-4 h-4 text-green-500" />
                <span className="flex-1 text-sm font-medium">Activate</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleActivation('deactivate')} className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent">
                <Power className="w-4 h-4 text-red-500 opacity-50" />
                <span className="flex-1 text-sm font-medium">Deactivate</span>
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent flex items-center gap-2" onClick={() => handleAddBlock('rect')} title="Add Highlight Box">
            <SquareSquare className="w-4 h-4" />
            <span>Highlight</span>
        </Button>
      </div>
    </>
  );
};

export const SequencePlugin: DiagramPlugin = {
  id: 'sequence',
  label: 'Sequence Diagram',
  defaultCode: `sequenceDiagram\n    participant A as Alice\n    participant B as Bob\n    A->>B: Hello Bob, how are you?\n    B-->>A: Great!`,
  ToolbarComponent: SequenceToolbar
};
