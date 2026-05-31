"use client";

import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, StickyNote, RefreshCw, GitBranch, SquareSquare } from "lucide-react";
import { useState } from "react";

// SVG icons for each participant type
const ParticipantIcon = ({ type }: { type: string }) => {
  const iconProps = "w-12 h-12 stroke-current stroke-2 fill-none";
  
  switch (type) {
    case 'participant':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          <rect x="4" y="4" width="24" height="20" rx="2" />
        </svg>
      );
    case 'actor':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Head */}
          <circle cx="16" cy="8" r="3" fill="currentColor" />
          {/* Body */}
          <line x1="16" y1="11" x2="16" y2="20" />
          {/* Arms */}
          <line x1="8" y1="15" x2="24" y2="15" />
          {/* Legs */}
          <line x1="16" y1="20" x2="10" y2="26" />
          <line x1="16" y1="20" x2="22" y2="26" />
        </svg>
      );
    case 'boundary':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Vertical line */}
          <line x1="8" y1="4" x2="8" y2="28" />
          {/* Top arc */}
          <path d="M 8 8 Q 20 4 20 16 Q 20 28 8 28" />
        </svg>
      );
    case 'control':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Circle */}
          <circle cx="16" cy="16" r="10" />
          {/* Diagonal line through center */}
          <line x1="8" y1="8" x2="24" y2="24" />
        </svg>
      );
    case 'entity':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Circle */}
          <circle cx="16" cy="16" r="10" />
        </svg>
      );
    case 'database':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Top ellipse */}
          <ellipse cx="16" cy="8" rx="9" ry="4" />
          {/* Vertical lines */}
          <line x1="7" y1="8" x2="7" y2="20" />
          <line x1="25" y1="8" x2="25" y2="20" />
          {/* Bottom ellipse */}
          <ellipse cx="16" cy="20" rx="9" ry="4" />
        </svg>
      );
    case 'collections':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Top rectangle */}
          <rect x="4" y="4" width="20" height="8" rx="1" />
          {/* Bottom rectangle (offset) */}
          <rect x="6" y="12" width="20" height="8" rx="1" />
        </svg>
      );
    case 'queue':
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Cylinder on side */}
          <ellipse cx="10" cy="16" rx="4" ry="8" />
          <line x1="14" y1="8" x2="24" y2="8" />
          <line x1="14" y1="24" x2="24" y2="24" />
          <path d="M 24 8 Q 26 16 24 24" />
        </svg>
      );
    default:
      return null;
  }
};

const SequenceToolbar = ({ code, setCode }: EditorContext) => {
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);
  
  const participantTypes = [
    { key: 'participant', label: 'Participant' },
    { key: 'actor', label: 'Actor' },
    { key: 'boundary', label: 'Boundary' },
    { key: 'control', label: 'Control' },
    { key: 'entity', label: 'Entity' },
    { key: 'database', label: 'Database' },
    { key: 'collections', label: 'Collections' },
    { key: 'queue', label: 'Queue' },
  ];

  const handleAddParticipant = (type: string) => {
      const timestamp = Date.now().toString().slice(-3);
      const displayNames: Record<string, string> = {
        'participant': 'Participant',
        'actor': 'Actor',
        'boundary': 'Boundary',
        'control': 'Control',
        'entity': 'Entity',
        'database': 'Database',
        'collections': 'Collections',
        'queue': 'Queue',
      };

      let newCode = code;
      const lines = newCode.split('\n');
      const insertIdx = lines.findIndex(l => 
        !l.trim().startsWith('sequenceDiagram') && 
        !l.trim().startsWith('participant') && 
        !l.trim().startsWith('actor') && 
        l.trim() !== ''
      );
      
      let insertLine = '';
      if (type === 'participant') {
        insertLine = `    participant P${timestamp} as New ${displayNames[type]}`;
      } else if (type === 'actor') {
        insertLine = `    actor A${timestamp} as New ${displayNames[type]}`;
      } else {
        insertLine = `    participant P${timestamp}@{ "type": "${type}" } as New ${displayNames[type]}`;
      }

      if (insertIdx === -1 || insertIdx === 0) {
          newCode += `\n${insertLine}`;
      } else {
          lines.splice(insertIdx, 0, insertLine);
          newCode = lines.join('\n');
      }
      setCode(newCode);
      setShowParticipantPicker(false);
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

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl bg-background p-0 border-none">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 relative"
          onClick={() => setShowParticipantPicker(!showParticipantPicker)}
          title="Add Participant"
        >
          <Users className="w-4 h-4" />
          <span>Participants</span>
        </Button>

        {showParticipantPicker && (
          <div className="absolute top-full mt-2 left-0 z-50 bg-background border border-border rounded-lg shadow-lg p-4 w-80">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Participant Type</p>
            <div className="grid grid-cols-3 gap-4">
              {participantTypes.map((type) => (
                <button
                  key={type.key}
                  onClick={() => handleAddParticipant(type.key)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-accent hover:border-accent-foreground transition-all duration-200 cursor-pointer group"
                  title={type.label}
                >
                  <div className="w-16 h-16 flex items-center justify-center text-foreground">
                    <ParticipantIcon type={type.key} />
                  </div>
                  <span className="text-xs font-medium text-foreground text-center group-hover:text-accent-foreground">{type.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
