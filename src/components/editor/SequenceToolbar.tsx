"use client";

import { EditorContext } from "@/lib/diagrams/types";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { useState } from "react";

// SVG icons for each participant type
export const ParticipantIcon = ({ type, className }: { type: string; className?: string }) => {
  const iconProps = className ?? "w-12 h-12 stroke-current stroke-2 fill-none";

  switch (type) {
    case "participant":
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          <rect x="4" y="4" width="24" height="20" rx="2" />
        </svg>
      );
    case "actor":
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
    case "boundary":
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Vertical line */}
          <line x1="8" y1="4" x2="8" y2="28" />
          {/* Top arc */}
          <path d="M 8 8 Q 20 4 20 16 Q 20 28 8 28" />
        </svg>
      );
    case "control":
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Circle */}
          <circle cx="16" cy="16" r="10" />
          {/* Diagonal line through center */}
          <line x1="8" y1="8" x2="24" y2="24" />
        </svg>
      );
    case "entity":
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Circle */}
          <circle cx="16" cy="16" r="10" />
        </svg>
      );
    case "database":
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
    case "collections":
      return (
        <svg viewBox="0 0 32 32" className={iconProps}>
          {/* Top rectangle */}
          <rect x="4" y="4" width="20" height="8" rx="1" />
          {/* Bottom rectangle (offset) */}
          <rect x="6" y="12" width="20" height="8" rx="1" />
        </svg>
      );
    case "queue":
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
  { key: "participant", label: "Participant" },
  { key: "actor", label: "Actor" },
  { key: "boundary", label: "Boundary" },
  { key: "control", label: "Control" },
  { key: "entity", label: "Entity" },
  { key: "database", label: "Database" },
  { key: "collections", label: "Collections" },
  { key: "queue", label: "Queue" },
];

const PARTICIPANT_DISPLAY_NAMES: Record<string, string> = {
  participant: "Participant",
  actor: "Actor",
  boundary: "Boundary",
  control: "Control",
  entity: "Entity",
  database: "Database",
  collections: "Collections",
  queue: "Queue",
};

const PARTICIPANT_DECL_RE =
  /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+([^\s@]+)/i;

const PARTICIPANT_DECL_WITH_LABEL_RE =
  /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+[^\s@]+(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+?))?\s*$/i;

const SEQUENCE_MESSAGE_RE =
  /^(\S+?)\s*(?:<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)\s*(\S+)\s*:/;

// AC 1.3 — Auto-ID: every existing participant ID (from declarations AND message references)
// is collected so a new id never collides. The first unused single uppercase letter
// (A, B, C, … → E when A–D exist) is picked; a timestamped id is the fallback only if all 26
// letters are taken.
export function getSequenceParticipantIds(code: string): Set<string> {
  const usedIds = new Set<string>();
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    const dm = trimmed.match(PARTICIPANT_DECL_RE);
    if (dm) usedIds.add(dm[1]);
    const mm = trimmed.match(SEQUENCE_MESSAGE_RE);
    if (mm) {
      usedIds.add(mm[1]);
      usedIds.add(mm[2]);
    }
  }
  return usedIds;
}

export function generateSequenceParticipantId(code: string): string {
  const usedIds = getSequenceParticipantIds(code);
  for (let i = 0; i < 26; i += 1) {
    const c = String.fromCharCode(65 + i);
    if (!usedIds.has(c)) return c;
  }
  return `P${Date.now().toString().slice(-3)}`;
}

// Keep the generated human-readable label unique as well. Sequence Mermaid allows repeated
// participant ids with the same visible name, but that makes the duplicate lifelines look like
// a rendering bug in the editor. "New Database", "New Database 2", "New Database 3", …
// stays readable while preserving multiple participants of the same type.
export function getSequenceParticipantLabels(code: string): Set<string> {
  const usedLabels = new Set<string>();
  for (const line of code.split("\n")) {
    const match = line.trim().match(PARTICIPANT_DECL_WITH_LABEL_RE);
    if (!match) continue;
    const label = match[1]?.trim();
    if (label) usedLabels.add(label);
  }
  return usedLabels;
}

export function generateSequenceParticipantLabel(type: string, code: string): string {
  const baseLabel = `New ${PARTICIPANT_DISPLAY_NAMES[type]}`;
  const usedLabels = getSequenceParticipantLabels(code);
  if (!usedLabels.has(baseLabel)) return baseLabel;
  let suffix = 2;
  while (usedLabels.has(`${baseLabel} ${suffix}`)) suffix += 1;
  return `${baseLabel} ${suffix}`;
}

export function buildSequenceParticipantInsertLine(
  type: string,
  id: string,
  label: string,
): string {
  if (type === "participant") {
    return `    participant ${id} as ${label}`;
  }
  if (type === "actor") {
    return `    actor ${id} as ${label}`;
  }
  return `    participant ${id}@{ "type": "${type}" } as ${label}`;
}

export function getLastSequenceParticipantDeclarationIndex(code: string): number {
  let last = -1;
  code.split("\n").forEach((line, i) => {
    if (line.trim().match(PARTICIPANT_DECL_RE)) last = i;
  });
  return last;
}

// AC 1.1 / 1.2 — Right-side insertion. Mermaid lays out participant columns in first-appearance
// order, so the new participant must be DECLARED AFTER every existing one to land on the far
// right. When explicit declarations exist, inject directly beneath the last declaration block
// (clean code, renders rightmost). When participants are only implicit (declared via messages),
// there is no declaration block — appending at the very END makes the new column appear after
// all message-referenced participants, i.e. rightmost (declaring it at the top would wrongly
// place it on the far LEFT — the bug this fixes).
export function insertSequenceParticipant(code: string, type: string): string {
  const id = generateSequenceParticipantId(code);
  const label = generateSequenceParticipantLabel(type, code);
  const insertLine = buildSequenceParticipantInsertLine(type, id, label);

  const lastDeclIdx = getLastSequenceParticipantDeclarationIndex(code);
  if (lastDeclIdx >= 0) {
    const lines = code.split("\n");
    lines.splice(lastDeclIdx + 1, 0, insertLine);
    return lines.join("\n");
  }
  return code.replace(/\s*$/, "") + `\n${insertLine}`;
}

export const SequenceToolbar = ({ code, setCode }: EditorContext) => {
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);

  const participantTypes = PARTICIPANT_TYPES;

  const handleAddParticipant = (type: string) => {
    setCode(insertSequenceParticipant(code, type));
    setShowParticipantPicker(false);
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
                    <span className="text-[10px] font-medium text-foreground text-center group-hover:text-accent-foreground leading-tight">
                      {type.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
