import { findFlowchartSubgraphEndLine, findFlowchartSubgraphLine } from "./selectionLineMap";

function leadingSpaces(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

/** Parse a `subgraph <id>` declaration; null otherwise (mirrors selectionLineMap). */
function parseSubgraphId(line: string): string | null {
  const m = line.trim().match(/^subgraph\s+([A-Za-z0-9_-]+)(?:\s*\[|\s*$)/);
  return m ? m[1] : null;
}

/** Innermost subgraph containing the line just before `beforeLine` (exclusive). */
function parentOfLine(lines: string[], beforeLine: number): string | null {
  const stack: string[] = [];
  for (let i = 0; i < beforeLine; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("%%")) continue;
    const id = parseSubgraphId(lines[i]);
    if (id) {
      stack.push(id);
      continue;
    }
    if (trimmed === "end") stack.pop();
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Indent for children inside a block; falls back to wrapper indent + 4. */
function childIndent(lines: string[], start: number, end: number): number {
  for (let i = start + 1; i < end; i += 1) {
    if (!lines[i].trim()) continue;
    return leadingSpaces(lines[i]);
  }
  return leadingSpaces(lines[start]) + 4;
}

/** Indent for a top-level subgraph declaration (first depth-0 decl, else 4). */
function topLevelIndent(lines: string[]): number {
  let depth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%%")) continue;
    const id = parseSubgraphId(line);
    if (id) {
      if (depth === 0 && line.trim()) return leadingSpaces(line);
      depth += 1;
      continue;
    }
    if (trimmed === "end") depth = Math.max(0, depth - 1);
  }
  return 4;
}

/**
 * Move a WHOLE subgraph block (`subgraph <draggedId> ... end`) so it becomes
 * a nested child of `destId`, or a top-level block when `destId` is null.
 * Pure string transform; returns `code` unchanged on every no-op/invalid case.
 * Already-a-child-of-dest (or already top level for null) is a no-op.
 */
export function moveFlowchartSubgraph(
  code: string,
  draggedId: string,
  destId: string | null,
): string {
  if (!draggedId) return code;
  if (destId !== null && !destId) return code;
  if (destId !== null && draggedId === destId) return code;

  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const lines = code.split(eol);

  const dragStart = findFlowchartSubgraphLine(code, draggedId);
  if (dragStart === -1) return code;
  const dragEnd = findFlowchartSubgraphEndLine(code, draggedId);
  if (dragEnd === -1) return code;

  if (destId === null) {
    if (parentOfLine(lines, dragStart) === null) return code;
    const slice = lines.slice(dragStart, dragEnd + 1);
    const delta = topLevelIndent(lines) - leadingSpaces(lines[dragStart]);
    const moved = slice.map((line) =>
      line.trim() ? " ".repeat(Math.max(0, leadingSpaces(line) + delta)) + line.trimStart() : line,
    );
    const rest = [...lines.slice(0, dragStart), ...lines.slice(dragEnd + 1)];
    let insertAt = rest.length;
    while (insertAt > 0 && !rest[insertAt - 1].trim()) insertAt -= 1;
    return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)].join(eol);
  }

  const destStartOrig = findFlowchartSubgraphLine(code, destId);
  if (destStartOrig === -1) return code;
  if (destStartOrig >= dragStart && destStartOrig <= dragEnd) return code;
  const destEndOrig = findFlowchartSubgraphEndLine(code, destId);
  if (destEndOrig === -1) return code;

  if (parentOfLine(lines, dragStart) === destId) return code;

  const slice = lines.slice(dragStart, dragEnd + 1);
  const rest = [...lines.slice(0, dragStart), ...lines.slice(dragEnd + 1)];
  const restCode = rest.join(eol);
  const destStart = findFlowchartSubgraphLine(restCode, destId);
  if (destStart === -1) return code;
  const destEnd = findFlowchartSubgraphEndLine(restCode, destId);
  if (destEnd === -1) return code;

  const restLines = restCode.split(eol);
  const delta = childIndent(restLines, destStart, destEnd) - leadingSpaces(lines[dragStart]);
  const moved = slice.map((line) =>
    line.trim() ? " ".repeat(Math.max(0, leadingSpaces(line) + delta)) + line.trimStart() : line,
  );
  return [...restLines.slice(0, destEnd), ...moved, ...restLines.slice(destEnd)].join(eol);
}
