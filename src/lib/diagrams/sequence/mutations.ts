import {
  getSequenceMessageEntries,
  getSequenceBlockEntries,
  isSequenceMessageLine,
} from "@/lib/diagrams/sequence/geometry";

const BLOCK_OPENER_RE = /^(loop|alt|opt|par|critical|break|rect)\b/i;
const NOTE_LINE_RE = /^note\s+/i;

export type ParticipantEntry = {
  id: string;
  alias: string | null;
};

export type NoteEntry = {
  index: number;
  line: string;
  position: "left" | "right" | "over";
  participant: string;
  text: string;
};

export function getSequenceParticipantEntries(code: string): ParticipantEntry[] {
  const participantDecl =
    /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+/i;
  return code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => participantDecl.test(l))
    .map((l) => {
      const m = l.match(
        /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+([^\s@]+)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i,
      );
      if (!m) return null;
      return {
        id: m[1].trim(),
        alias: m[2]?.trim() || null,
      };
    })
    .filter((v): v is ParticipantEntry => Boolean(v));
}

export function normalizeSequenceLabel(value: string | null | undefined): string {
  return (value || "")
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getSequenceNoteEntries(sourceCode: string): NoteEntry[] {
  const lines = sourceCode.split("\n");
  const entries: NoteEntry[] = [];
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    // Match: "Note left|right of Participant: Text" OR "Note over Participant: Text"
    // The "of" keyword is optional for the "over" position (Mermaid uses "Note over X" not "Note over of X").
    const noteMatch = trimmed.match(
      /^Note\s+(left|right|over)\s+(?:of\s+)?(.+?)(?:\s*:\s*(.*))?$/i,
    );
    if (noteMatch) {
      const [, position, participant, text] = noteMatch;
      entries.push({
        index: i,
        line: lines[i],
        position: position.toLowerCase() as "left" | "right" | "over",
        participant: participant.trim(),
        text: text?.trim() || "new note",
      });
    }
  }

  return entries;
}

export function insertSequenceMessageAtIndex(
  sourceCode: string,
  messageLine: string,
  messageIndex: number,
): string {
  const lines = sourceCode.split("\n");
  const messageEntries = getSequenceMessageEntries(sourceCode);
  const insertAt = messageEntries[messageIndex]?.index ?? lines.length;

  lines.splice(insertAt, 0, `    ${messageLine}`);
  return lines.join("\n");
}

export function insertSequenceNoteAtIndex(
  sourceCode: string,
  position: "left" | "right" | "over",
  participant: string,
  messageIndex: number,
): string {
  const lines = sourceCode.split("\n");
  const messageEntries = getSequenceMessageEntries(sourceCode);
  const insertAt = messageEntries[messageIndex]?.index ?? lines.length;

  const noteLine =
    position === "over"
      ? `    Note over ${participant}: new note`
      : `    Note ${position} of ${participant}: new note`;
  lines.splice(insertAt, 0, noteLine);
  return lines.join("\n");
}

export function updateNotePosition(
  sourceCode: string,
  noteIndex: number,
  newPosition: "left" | "right" | "over",
): string {
  const noteEntries = getSequenceNoteEntries(sourceCode);
  if (noteIndex >= noteEntries.length) return sourceCode;

  const lines = sourceCode.split("\n");
  const noteEntry = noteEntries[noteIndex];
  // Use correct Mermaid syntax: "Note over X" (no "of") vs "Note left|right of X"
  const newLine =
    newPosition === "over"
      ? `    Note over ${noteEntry.participant}: ${noteEntry.text}`
      : `    Note ${newPosition} of ${noteEntry.participant}: ${noteEntry.text}`;
  lines[noteEntry.index] = newLine;

  return lines.join("\n");
}

export function deleteSequenceNote(sourceCode: string, noteIndex: number): string {
  const noteEntries = getSequenceNoteEntries(sourceCode);
  if (noteIndex >= noteEntries.length) return sourceCode;

  const lines = sourceCode.split("\n");
  lines.splice(noteEntries[noteIndex].index, 1);

  return lines.join("\n");
}

function isSequenceContentLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("%%")) return false;
  if (NOTE_LINE_RE.test(trimmed)) return true;
  if (BLOCK_OPENER_RE.test(trimmed)) return true;
  return isSequenceMessageLine(line);
}

// After removing a child item, a logic (`alt`/`opt`/`loop`/`par`/`critical`/`break`) or
// highlight (`rect`) block can be left with no statements. Empty blocks such as `opt ... end`
// are invalid Mermaid and break rendering, so remove any block that has become empty,
// cascading inward-to-outer so a parent that only contained a now-removed nested block also
// collapses.
export function removeEmptySequenceBlocks(sourceCode: string): string {
  let code = sourceCode;

  for (let guard = 0; guard < 200; guard += 1) {
    const lines = code.split("\n");
    const blocks = getSequenceBlockEntries(code);
    if (blocks.length === 0) break;

    const sorted = [...blocks].sort((a, b) => b.depth - a.depth || b.startLine - a.startLine);
    let removedAny = false;

    for (const blk of sorted) {
      const inner = lines.slice(blk.startLine + 1, blk.endLine);
      if (inner.some(isSequenceContentLine)) continue;

      const toRemove = new Set<number>([blk.endLine, ...blk.sections.map((s) => s.line)]);
      code = lines.filter((_, i) => !toRemove.has(i)).join("\n");
      removedAny = true;
      break;
    }

    if (!removedAny) break;
  }

  return code;
}
