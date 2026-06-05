export type SequenceBlockType = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect';

export interface SequenceBlockSection {
  kind: 'main' | 'else' | 'and' | 'option';
  line: number;
  title: string;
}

export interface SequenceBlockNode {
  id: string;
  type: SequenceBlockType;
  title: string;
  startLine: number;
  endLine: number;
  depth: number;
  parentId: string | null;
  sections: SequenceBlockSection[];
}

export interface SequenceModel {
  code: string;
  lines: string[];
  isSequence: boolean;
  blocks: SequenceBlockNode[];
  messageLines: number[];
  noteLines: number[];
  participantLines: number[];
}

const BLOCK_TYPES = new Set<SequenceBlockType>(['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect']);
const KEYWORD_PREFIXES = [
  'sequenceDiagram',
  'Note',
  'note',
  'rect',
  'alt',
  'opt',
  'loop',
  'par',
  'critical',
  'break',
  'option',
  'else',
  'and',
  'end',
  'participant',
  'actor',
  'boundary',
  'control',
  'entity',
  'database',
  'collections',
  'queue',
  'autonumber',
  'activate',
  'deactivate',
  'box',
  'links',
  'link',
  'properties',
  'details',
];

const getIndent = (line: string): string => {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
};

const withIndent = (line: string, indent: string): string => {
  const trimmed = line.trim();
  if (!trimmed) return line;
  return `${indent}${trimmed}`;
};

const indentBy = (line: string, spaces: number): string => {
  if (!line.trim()) return line;
  return `${' '.repeat(Math.max(0, spaces))}${line}`;
};

const unindentBy = (line: string, spaces: number): string => {
  if (!line.trim()) return line;
  let remaining = spaces;
  let i = 0;
  while (i < line.length && remaining > 0 && line[i] === ' ') {
    i += 1;
    remaining -= 1;
  }
  return line.slice(i);
};

export const isSequenceMessageLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('%%')) return false;
  if (KEYWORD_PREFIXES.some((kw) => trimmed === kw || trimmed.startsWith(`${kw} `))) return false;
  return trimmed.includes(':');
};

export function parseSequenceModel(code: string): SequenceModel {
  const lines = code.split('\n');
  const isSequence = lines.some((line) => line.trim().startsWith('sequenceDiagram'));

  const blocks: SequenceBlockNode[] = [];
  const messageLines: number[] = [];
  const noteLines: number[] = [];
  const participantLines: number[] = [];
  const stack: Array<{
    id: string;
    type: SequenceBlockType;
    title: string;
    startLine: number;
    depth: number;
    parentId: string | null;
    sections: SequenceBlockSection[];
  }> = [];

  let inFrontmatter = false;
  let idCounter = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (isSequenceMessageLine(line)) {
      messageLines.push(i);
    }

    if (/^Note\s+/i.test(trimmed)) {
      noteLines.push(i);
    }
    if (/^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+/i.test(trimmed)) {
      participantLines.push(i);
    }

    const blockMatch = trimmed.match(/^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i);
    if (blockMatch) {
      const type = blockMatch[1].toLowerCase() as SequenceBlockType;
      if (BLOCK_TYPES.has(type)) {
        idCounter += 1;
        const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
        stack.push({
          id: `SEQ_BLOCK_${idCounter}`,
          type,
          title: blockMatch[2] || '',
          startLine: i,
          depth: stack.length,
          parentId,
          sections: [{ kind: 'main', line: i, title: blockMatch[2] || '' }],
        });
        continue;
      }
    }

    const sectionMatch = trimmed.match(/^(else|and|option)\b\s*(.*)$/i);
    if (sectionMatch && stack.length > 0) {
      const top = stack[stack.length - 1];
      const kind = sectionMatch[1].toLowerCase() as 'else' | 'and' | 'option';
      top.sections.push({ kind, line: i, title: sectionMatch[2] || '' });
      continue;
    }

    if (/^end\b/i.test(trimmed) && stack.length > 0) {
      const top = stack.pop()!;
      blocks.push({
        id: top.id,
        type: top.type,
        title: top.title,
        startLine: top.startLine,
        endLine: i,
        depth: top.depth,
        parentId: top.parentId,
        sections: top.sections,
      });
    }
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    blocks.push({
      id: top.id,
      type: top.type,
      title: top.title,
      startLine: top.startLine,
      endLine: lines.length - 1,
      depth: top.depth,
      parentId: top.parentId,
      sections: top.sections,
    });
  }

  return {
    code,
    lines,
    isSequence,
    blocks: blocks.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine),
    messageLines,
    noteLines,
    participantLines,
  };
}

export const serializeSequenceModel = (model: SequenceModel): string => model.lines.join('\n');

export const validateMutation = (model: SequenceModel): { valid: boolean; reason?: string } => {
  const seen = new Set<string>();
  for (const block of model.blocks) {
    if (seen.has(block.id)) return { valid: false, reason: 'Duplicate block id' };
    seen.add(block.id);
    if (block.startLine >= block.endLine) return { valid: false, reason: `Invalid block bounds: ${block.id}` };
    if (block.startLine < 0 || block.endLine >= model.lines.length) {
      return { valid: false, reason: `Out-of-range block bounds: ${block.id}` };
    }
    if (block.parentId) {
      const parent = model.blocks.find((b) => b.id === block.parentId);
      if (!parent) return { valid: false, reason: `Missing parent: ${block.id}` };
      if (block.startLine <= parent.startLine || block.endLine >= parent.endLine) {
        return { valid: false, reason: `Block escapes parent bounds: ${block.id}` };
      }
    }
  }
  return { valid: true };
};

const getDefaultHeader = (type: SequenceBlockType): string => {
  switch (type) {
    case 'loop': return 'loop Loop';
    case 'alt': return 'alt Condition';
    case 'opt': return 'opt Optional';
    case 'par': return 'par Branch A';
    case 'critical': return 'critical Critical';
    case 'break': return 'break Break';
    case 'rect': return 'rect rgb(200, 200, 255)';
    default: return `${type} Block`;
  }
};

const getDefaultSecondaryBranch = (type: SequenceBlockType): string[] => {
  if (type === 'alt') return ['else Alternative', 'A->>B: Alternative path'];
  if (type === 'par') return ['and Branch B', 'A->>B: Parallel path'];
  if (type === 'critical') return ['option Fallback', 'A->>B: Recovery path'];
  return [];
};

export function insertBlockAround(
  model: SequenceModel,
  range: { startLine: number; endLine: number },
  type: SequenceBlockType
): { ok: boolean; code: string; error?: string } {
  if (!model.isSequence) return { ok: false, code: model.code, error: 'Not a sequence diagram' };
  const startLine = Math.max(0, Math.min(model.lines.length - 1, range.startLine));
  const endLine = Math.max(startLine, Math.min(model.lines.length - 1, range.endLine));
  const lines = [...model.lines];

  const baseIndent = getIndent(lines[startLine] || '    ');
  const innerIndent = `${baseIndent}    `;
  const header = withIndent(getDefaultHeader(type), baseIndent);
  const selected = lines.slice(startLine, endLine + 1).map((line) => indentBy(unindentBy(line, baseIndent.length), innerIndent.length));
  const tail = getDefaultSecondaryBranch(type).map((line) => withIndent(line, innerIndent));
  const payload = [header, ...selected, ...tail, withIndent('end', baseIndent)];

  lines.splice(startLine, endLine - startLine + 1, ...payload);
  return { ok: true, code: lines.join('\n') };
}

export function insertBlockAroundMessageIndex(
  code: string,
  messageIndex: number,
  type: SequenceBlockType
): { ok: boolean; code: string; error?: string } {
  const model = parseSequenceModel(code);
  const line = model.messageLines[messageIndex];
  if (!Number.isFinite(line)) return { ok: false, code, error: 'Message not found' };
  return insertBlockAround(model, { startLine: line, endLine: line }, type);
}

const findBlock = (model: SequenceModel, blockId: string): SequenceBlockNode | null =>
  model.blocks.find((b) => b.id === blockId) || null;

export function resizeBlock(
  code: string,
  blockId: string,
  newStartLine: number,
  newEndLine: number
): { ok: boolean; code: string; error?: string } {
  const model = parseSequenceModel(code);
  const block = findBlock(model, blockId);
  if (!block) return { ok: false, code, error: 'Block not found' };
  if (newStartLine >= newEndLine) return { ok: false, code, error: 'Invalid resize bounds' };

  const lines = [...model.lines];
  const headerLine = lines[block.startLine];
  const endLine = lines[block.endLine];
  const originalStart = block.startLine;
  const originalEnd = block.endLine;

  if (!headerLine || !endLine) return { ok: false, code, error: 'Missing block delimiters' };

  // Expand/shrink top boundary.
  if (newStartLine < originalStart) {
    for (let i = newStartLine; i < originalStart; i += 1) {
      lines[i] = indentBy(lines[i], 4);
    }
  } else if (newStartLine > originalStart) {
    for (let i = originalStart + 1; i <= Math.min(newStartLine, originalEnd - 1); i += 1) {
      lines[i] = unindentBy(lines[i], 4);
    }
  }

  // Expand/shrink bottom boundary.
  if (newEndLine > originalEnd) {
    for (let i = originalEnd + 1; i <= newEndLine; i += 1) {
      lines[i] = indentBy(lines[i], 4);
    }
  } else if (newEndLine < originalEnd) {
    for (let i = Math.max(newEndLine + 1, originalStart + 1); i < originalEnd; i += 1) {
      lines[i] = unindentBy(lines[i], 4);
    }
  }

  let adjustedStart = newStartLine;
  let adjustedEnd = newEndLine;
  lines.splice(originalStart, 1);
  if (adjustedStart > originalStart) adjustedStart -= 1;
  if (adjustedEnd > originalStart) adjustedEnd -= 1;
  lines.splice(adjustedStart, 0, headerLine);

  const oldEndAfterHeaderMove = originalEnd > originalStart ? originalEnd : originalEnd + 1;
  let endIndex = oldEndAfterHeaderMove;
  if (adjustedStart <= oldEndAfterHeaderMove) endIndex += 1;
  lines.splice(endIndex, 1);
  const insertEndAt = adjustedEnd >= endIndex ? adjustedEnd : adjustedEnd;
  lines.splice(insertEndAt, 0, endLine);

  const nextModel = parseSequenceModel(lines.join('\n'));
  const validation = validateMutation(nextModel);
  if (!validation.valid) {
    return { ok: false, code, error: validation.reason || 'Invalid resize mutation' };
  }
  return { ok: true, code: lines.join('\n') };
}

export function moveLineIntoBlock(
  code: string,
  messageLine: number,
  blockId: string
): { ok: boolean; code: string; error?: string } {
  const model = parseSequenceModel(code);
  const block = findBlock(model, blockId);
  if (!block) return { ok: false, code, error: 'Block not found' };
  if (messageLine <= block.startLine || messageLine >= block.endLine) {
    return { ok: false, code, error: 'Message line outside movable range' };
  }

  const lines = [...model.lines];
  const moved = lines[messageLine];
  if (!moved) return { ok: false, code, error: 'Line not found' };
  lines.splice(messageLine, 1);
  const insertAt = messageLine < block.endLine ? block.endLine - 1 : block.endLine;
  const blockIndent = getIndent(lines[block.startLine] || '    ');
  lines.splice(insertAt, 0, withIndent(moved, `${blockIndent}    `));
  return { ok: true, code: lines.join('\n') };
}

export function moveLineOut(
  code: string,
  messageLine: number
): { ok: boolean; code: string; error?: string } {
  const model = parseSequenceModel(code);
  const containing = model.blocks
    .filter((b) => messageLine > b.startLine && messageLine < b.endLine)
    .sort((a, b) => a.depth - b.depth)[0];
  if (!containing) return { ok: false, code, error: 'No containing block' };

  const lines = [...model.lines];
  const moved = lines[messageLine];
  if (!moved) return { ok: false, code, error: 'Line not found' };
  lines.splice(messageLine, 1);
  const insertAt = containing.endLine > messageLine ? containing.endLine : containing.endLine + 1;
  lines.splice(insertAt, 0, unindentBy(moved, 4));
  return { ok: true, code: lines.join('\n') };
}

