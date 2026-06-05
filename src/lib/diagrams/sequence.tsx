"use client";

import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, RefreshCw, GitBranch, SquareSquare } from "lucide-react";
import { useState } from "react";

// SVG icons for each participant type
export const ParticipantIcon = ({ type, className }: { type: string; className?: string }) => {
  const iconProps = className ?? "w-12 h-12 stroke-current stroke-2 fill-none";

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

// The eight sequence participant archetypes (shared by the top "Participants" picker and the
// inline canvas SequenceManipulationToolbar "Type" dropdown).
export const PARTICIPANT_TYPES: Array<{ key: string; label: string }> = [
  { key: 'participant', label: 'Participant' },
  { key: 'actor', label: 'Actor' },
  { key: 'boundary', label: 'Boundary' },
  { key: 'control', label: 'Control' },
  { key: 'entity', label: 'Entity' },
  { key: 'database', label: 'Database' },
  { key: 'collections', label: 'Collections' },
  { key: 'queue', label: 'Queue' },
];

const SequenceToolbar = ({ code, setCode }: EditorContext) => {
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);

  const participantTypes = PARTICIPANT_TYPES;

  const handleAddParticipant = (type: string) => {
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

    const lines = code.split('\n');

    // AC 1.3 — Auto-ID: scan every existing participant ID (from declarations AND message
    // references) so the new id never collides. Pick the first unused single uppercase letter
    // (A, B, C, … → E when A–D exist); fall back to a timestamped id only if all 26 are taken.
    const usedIds = new Set<string>();
    const declRe = /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+([^\s@]+)/i;
    const msgRe = /^(\S+?)\s*(?:<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)\s*(\S+)\s*:/;
    let lastDeclIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      const dm = trimmed.match(declRe);
      if (dm) { usedIds.add(dm[1]); lastDeclIdx = i; }
      const mm = trimmed.match(msgRe);
      if (mm) { usedIds.add(mm[1]); usedIds.add(mm[2]); }
    }
    let newId = '';
    for (let i = 0; i < 26; i += 1) {
      const c = String.fromCharCode(65 + i);
      if (!usedIds.has(c)) { newId = c; break; }
    }
    if (!newId) newId = `P${Date.now().toString().slice(-3)}`;

    let insertLine = '';
    if (type === 'participant') {
      insertLine = `    participant ${newId} as New ${displayNames[type]}`;
    } else if (type === 'actor') {
      insertLine = `    actor ${newId} as New ${displayNames[type]}`;
    } else {
      insertLine = `    participant ${newId}@{ "type": "${type}" } as New ${displayNames[type]}`;
    }

    // AC 1.1 / 1.2 — Right-side insertion. Mermaid lays out participant columns in first-appearance
    // order, so the new participant must be DECLARED AFTER every existing one to land on the far
    // right. When explicit declarations exist, inject directly beneath the last declaration block
    // (clean code, renders rightmost). When participants are only implicit (declared via messages),
    // there is no declaration block — appending at the very END makes the new column appear after
    // all message-referenced participants, i.e. rightmost (declaring it at the top would wrongly
    // place it on the far LEFT — the bug this fixes).
    let newCode: string;
    if (lastDeclIdx >= 0) {
      lines.splice(lastDeclIdx + 1, 0, insertLine);
      newCode = lines.join('\n');
    } else {
      newCode = code.replace(/\s*$/, '') + `\n${insertLine}`;
    }
    setCode(newCode);
    setShowParticipantPicker(false);
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
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => setShowParticipantPicker(!showParticipantPicker)}
            title="Add Participant"
          >
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">Participants</span>
          </Button>

          {showParticipantPicker && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-background border border-border rounded-lg shadow-lg p-3 w-56">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Participant Type</p>
              <div className="grid grid-cols-3 gap-2">
                {participantTypes.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => handleAddParticipant(type.key)}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:bg-accent hover:border-accent-foreground transition-all duration-200 cursor-pointer group"
                    title={type.label}
                  >
                    <div className="w-8 h-8 flex items-center justify-center text-foreground">
                      <ParticipantIcon type={type.key} />
                    </div>
                    <span className="text-[10px] font-medium text-foreground text-center group-hover:text-accent-foreground leading-tight">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2" />}>
            <GitBranch className="w-4 h-4" />
            <span className="text-sm font-medium">Logic</span>
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
          <span className="text-sm font-medium">Highlight</span>
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
