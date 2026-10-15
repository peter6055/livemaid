import { CONNECTOR_REGEX } from "../utils";
import {
  findFlowchartNodeLine,
  findFlowchartNodeSubgraphId,
  findFlowchartSubgraphEndLine,
  findFlowchartSubgraphLine,
} from "./selectionLineMap";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lines that are global or structural — never a node declaration to move. */
function isGlobalOrStructural(trimmed: string): boolean {
  return (
    !trimmed ||
    trimmed.startsWith("%%") ||
    trimmed.startsWith("subgraph") ||
    trimmed === "end" ||
    trimmed.startsWith("flowchart") ||
    trimmed.startsWith("graph") ||
    trimmed.startsWith("direction") ||
    trimmed.startsWith("style ") ||
    trimmed.startsWith("linkStyle ") ||
    trimmed.startsWith("classDef ") ||
    trimmed.startsWith("class ") ||
    trimmed.startsWith("click ")
  );
}

/**
 * Return true when `line` is a pure single-line shape declaration for `nodeId`
 * (e.g. `A[...]`, `A(...)`, `A@{...}`), including quoted ids with spaces
 * (`"My Node"[Label]`). Lines with edge connectors, multi-line `@{` blocks
 * (no closing `}` on the same line), and global lines are not declarations.
 */
function isPureNodeDeclaration(line: string, nodeId: string): boolean {
  if (CONNECTOR_REGEX.test(line)) return false;
  const trimmed = line.trim();
  if (isGlobalOrStructural(trimmed)) return false;
  // Multi-line @{...} def: moving a single line would corrupt it.
  const atIndex = line.indexOf("@{");
  if (atIndex !== -1 && line.indexOf("}", atIndex) === -1) return false;
  const esc = escapeRegExp(nodeId);
  if (new RegExp(`(^|[^A-Za-z0-9_-])${esc}\\s*(\\[|\\(|\\{|>|@\\{)`).test(line)) return true;
  // Quoted-id fallback: the canvas id may be sanitized (spaces stripped).
  const sanitized = nodeId.replace(/\s+/g, "");
  const quotedRe = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = quotedRe.exec(line)) !== null) {
    if (match[1].replace(/\s+/g, "") !== sanitized) continue;
    const after = line.slice(match.index + match[0].length);
    if (/^\s*(\[|\(|\{|>|@\{)/.test(after)) return true;
  }
  return false;
}

export type FlowchartNodeMoveBlockReason =
  | "edge-declaration"
  | "edge-only"
  | "multiline-block"
  | "unknown-node";

/**
 * Explain why `moveFlowchartNode` would refuse to move `nodeId`. Reuses the
 * same `findFlowchartNodeLine` / `isPureNodeDeclaration` checks so the reason
 * matches the no-op behavior; does not change it.
 */
export function getFlowchartNodeMoveEligibility(
  code: string,
  nodeId: string,
): { eligible: boolean; reason: FlowchartNodeMoveBlockReason | null } {
  if (!nodeId) return { eligible: false, reason: "unknown-node" };
  const nodeLine = findFlowchartNodeLine(code, nodeId);
  if (nodeLine === -1) return { eligible: false, reason: "unknown-node" };
  const line = code.split("\n")[nodeLine];
  if (isPureNodeDeclaration(line, nodeId)) return { eligible: true, reason: null };
  // A line that both declares the node shape and connects it (e.g. `A[X] --> B`)
  // is an edge-declaration; a bare reference with no shape (e.g. `A --> B`) is
  // edge-only. Mirror the shape checks in isPureNodeDeclaration.
  const esc = escapeRegExp(nodeId);
  let hasShape = new RegExp(`(^|[^A-Za-z0-9_-])${esc}\\s*(\\[|\\(|\\{|>|@\\{)`).test(line);
  if (!hasShape) {
    const sanitized = nodeId.replace(/\s+/g, "");
    const quotedRe = /"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotedRe.exec(line)) !== null) {
      if (match[1].replace(/\s+/g, "") !== sanitized) continue;
      if (/^\s*(\[|\(|\{|>|@\{)/.test(line.slice(match.index + match[0].length))) {
        hasShape = true;
        break;
      }
    }
  }
  if (hasShape && CONNECTOR_REGEX.test(line))
    return { eligible: false, reason: "edge-declaration" };
  const atIndex = line.indexOf("@{");
  if (atIndex !== -1 && line.indexOf("}", atIndex) === -1)
    return { eligible: false, reason: "multiline-block" };
  return { eligible: false, reason: "edge-only" };
}

/** Human-readable explanation for a blocked node move. */
export function flowchartNodeMoveBlockedMessage(
  reason: FlowchartNodeMoveBlockReason | "same-owner" | "unknown-dest",
): string {
  switch (reason) {
    case "edge-declaration":
      return "This node can't be moved directly because its Mermaid declaration also defines a connection. Move the node declaration and connection into separate lines, then try again.";
    case "edge-only":
      return "This node can't be moved directly because it has no standalone declaration to move. Add a separate `ID[Label]` line, then try again.";
    case "multiline-block":
      return "This node can't be moved directly because its declaration spans multiple lines.";
    case "unknown-node":
      return "This node can't be moved. Its declaration wasn't found.";
    case "same-owner":
      return "Already in this subgraph.";
    case "unknown-dest":
      return "This drop target isn't valid. Try another subgraph or empty canvas.";
  }
}

function indentOf(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? "";
}

/**
 * Move the pure declaration line of `nodeId` into `destSubgraphId` (or to top
 * level when null), preserving id/label/shape/style/connections. Edges,
 * style/class/linkStyle/click lines, and comments stay in place. Returns the
 * input string unchanged (same value) on every no-op/invalid case.
 *
 * Only the first single-line `declRe` hit is moved; duplicate declarations
 * beyond the first are left behind.
 */
export function moveFlowchartNode(
  code: string,
  nodeId: string,
  destSubgraphId: string | null,
): string {
  if (!nodeId) return code;

  const nodeLine = findFlowchartNodeLine(code, nodeId);
  if (nodeLine === -1) return code;

  const lines = code.split("\n");
  const declLine = lines[nodeLine];
  if (!isPureNodeDeclaration(declLine, nodeId)) return code;

  if (destSubgraphId !== null) {
    if (findFlowchartSubgraphLine(code, destSubgraphId) === -1) return code;
    const endLine = findFlowchartSubgraphEndLine(code, destSubgraphId);
    if (endLine === -1) return code;
    if (findFlowchartNodeSubgraphId(code, nodeId) === destSubgraphId) return code;

    const content = declLine.trim();
    lines.splice(nodeLine, 1);
    // Re-resolve the dest end after removal (indices shift when node was above it).
    const updated = lines.join("\n");
    const freshEnd = findFlowchartSubgraphEndLine(updated, destSubgraphId);
    if (freshEnd === -1) return code;
    const endIndent = lines[freshEnd].match(/^(\s*)/)?.[1].length ?? 0;
    // Adopt the dest block's existing child indent; fall back to end indent + 4.
    let childIndent = " ".repeat(endIndent + 4);
    const startLine = findFlowchartSubgraphLine(updated, destSubgraphId);
    for (let i = startLine + 1; i < freshEnd; i += 1) {
      const t = lines[i].trim();
      if (!t || t.startsWith("%%") || t.startsWith("direction")) continue;
      if (t === "end" || t.startsWith("subgraph")) continue;
      childIndent = indentOf(lines[i]);
      break;
    }
    lines.splice(freshEnd, 0, `${childIndent}${content}`);
    return lines.join("\n");
  }

  // Top level: already top-level is a no-op.
  if (findFlowchartNodeSubgraphId(code, nodeId) === null) return code;
  const content = declLine.trim();
  lines.splice(nodeLine, 1);
  // Adopt the file's top-level content indent; fall back to 4 spaces.
  let topIndent = "    ";
  {
    const stack: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("%%") && t.startsWith("subgraph")) {
        stack.push(t);
        continue;
      }
      if (t === "end") {
        stack.pop();
        continue;
      }
      if (stack.length > 0) continue;
      if (isGlobalOrStructural(t)) continue;
      topIndent = indentOf(line);
      break;
    }
  }
  // Append after the last non-blank line so trailing newlines are preserved.
  let insertAt = lines.length;
  while (insertAt > 0 && !lines[insertAt - 1].trim()) insertAt -= 1;
  lines.splice(insertAt, 0, `${topIndent}${content}`);
  return lines.join("\n");
}
