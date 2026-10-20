import { findFlowchartSubgraphEndLine, findFlowchartSubgraphLine } from "./selectionLineMap";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Return true when the line is a Mermaid comment. */
function isCommentLine(line: string): boolean {
  return line.trim().startsWith("%%");
}

/**
 * If `line` is a `class <id1>[,<id2>,...] <className>` assignment, return the
 * list of IDs and the trailing class name portion; otherwise return null.
 * `classDef` definitions are not assignments and return null.
 */
function parseClassAssignment(
  line: string,
): { prefix: string; ids: string[]; suffix: string } | null {
  const trimmed = line.trim();
  if (!/^class\s+/.test(trimmed) || /^classDef\s+/.test(trimmed)) {
    return null;
  }
  const match = trimmed.match(/^class\s+(.+?)\s+(\S.*)$/);
  if (!match) return null;
  return {
    prefix: line.match(/^(\s*class\s+)/)?.[1] ?? "class ",
    ids: match[1].split(",").map((s) => s.trim()),
    suffix: match[2],
  };
}

/**
 * Delete a flowchart subgraph container while preserving its child nodes and
 * edges. The full `subgraph <id> ... end` block is removed, surviving content
 * is outdented to the parent scope, and any edges/styles/classes that
 * reference the deleted subgraph are dropped.
 */
export function deleteFlowchartSubgraph(code: string, subgraphId: string): string {
  const startLine = findFlowchartSubgraphLine(code, subgraphId);
  if (startLine === -1) return code;

  const endLine = findFlowchartSubgraphEndLine(code, subgraphId);
  if (endLine === -1) return code;

  const lines = code.split("\n");
  const blockIndent = lines[startLine].match(/^(\s*)/)?.[1].length ?? 0;
  const parentIndent = Math.max(0, blockIndent - 4);
  const indentDelta = blockIndent - parentIndent;

  const mentionRegex = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(subgraphId)}([^a-zA-Z0-9_]|$)`);

  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Drop the subgraph wrapper line and its matching end.
    if (i === startLine || i === endLine) continue;

    const line = lines[i];

    // Preserve comments even if they mention the subgraph ID.
    if (isCommentLine(line)) {
      resultLines.push(line);
      continue;
    }

    // For multi-ID class assignments, remove only the deleted ID and keep the
    // rest. If no IDs remain, drop the whole line.
    const classAssignment = parseClassAssignment(line);
    if (classAssignment) {
      const remainingIds = classAssignment.ids.filter((id) => id !== subgraphId);
      if (remainingIds.length === 0) continue;
      if (remainingIds.length !== classAssignment.ids.length) {
        resultLines.push(
          `${classAssignment.prefix}${remainingIds.join(", ")} ${classAssignment.suffix}`,
        );
        continue;
      }
      resultLines.push(line);
      continue;
    }

    // Drop any edge/style/class line that references the deleted subgraph,
    // ignoring quoted labels where the ID may appear as text.
    const lineWithoutQuotedLabels = line.replace(/"[^"]*"|'[^']*'/g, "");
    if (mentionRegex.test(lineWithoutQuotedLabels)) continue;

    if (i > startLine && i < endLine) {
      // Outdent surviving block content by one scope level.
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
      const newIndent = Math.max(parentIndent, leadingSpaces - indentDelta);
      resultLines.push(" ".repeat(newIndent) + line.trim());
      continue;
    }

    resultLines.push(line);
  }

  return resultLines.join("\n");
}
