import { findFlowchartSubgraphEndLine, findFlowchartSubgraphLine } from "./selectionLineMap";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    // Drop any edge/style/class line that references the deleted subgraph.
    if (mentionRegex.test(line)) continue;

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
