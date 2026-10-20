import { CONNECTOR_REGEX, rebuildLinkStyles } from "../utils";
import {
  findFlowchartNodeLine,
  findFlowchartNodeSubgraphId,
  findFlowchartSubgraphEndLine,
  findFlowchartSubgraphLine,
} from "./selectionLineMap";
import {
  findShapeEnd,
  maskShapeBodies,
  matchShapeOpener,
  splitTopLevelStatements,
} from "./shapeScan";

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

/** True when a single statement declares `nodeId` with a shape (`A[...]`, `A@{...}` …). */
function statementDeclaresNode(rawStatement: string, nodeId: string): boolean {
  // Mask shape labels: `A["B[example]"]` must never count as a declaration of B.
  const statement = maskShapeBodies(rawStatement);
  const esc = escapeRegExp(nodeId);
  if (new RegExp(`(^|[^A-Za-z0-9_-])${esc}\\s*(\\[|\\(|\\{|>|@\\{)`).test(statement)) return true;
  // Quoted-id fallback: the canvas id may be sanitized (spaces stripped).
  const sanitized = nodeId.replace(/\s+/g, "");
  const quotedRe = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = quotedRe.exec(statement)) !== null) {
    if (match[1].replace(/\s+/g, "") !== sanitized) continue;
    if (/^\s*(\[|\(|\{|>|@\{)/.test(statement.slice(match.index + match[0].length))) return true;
  }
  return false;
}

/**
 * Return the pure single-statement shape declaration for `nodeId` on `line`
 * (e.g. `A[...]`, `A(...)`, `A@{...}`), plus the remaining statements when the
 * line is a compound `;` line (so only the selected statement moves and the
 * rest stays valid Mermaid). Null when the line is not a pure declaration:
 * edge connectors, multi-line `@{` blocks (no closing `}` on the same line),
 * and global/structural lines never are.
 */
function extractPureDeclaration(
  line: string,
  nodeId: string,
): { decl: string; remainder: string | null } | null {
  const trimmed = line.trim();
  if (isGlobalOrStructural(trimmed)) return null;
  // Multi-line @{...} def: moving a single line would corrupt it.
  const atIndex = line.indexOf("@{");
  if (atIndex !== -1 && line.indexOf("}", atIndex) === -1) return null;
  const statements = splitTopLevelStatements(line);
  const index = statements.findIndex((statement) => statementDeclaresNode(statement, nodeId));
  if (index === -1) return null;
  // The declaring statement itself carries an edge (`A[X] --> B`): not a pure
  // declaration — the edge-splitting path handles it. Connector text in a
  // *different* statement (or inside a label) must not reject this one.
  if (CONNECTOR_REGEX.test(maskShapeBodies(statements[index]))) return null;
  if (statements.length === 1) return { decl: trimmed, remainder: null };
  const rest = statements
    .filter((_, i) => i !== index)
    .map((statement) => statement.trim())
    .join("; ");
  return { decl: statements[index].trim(), remainder: rest };
}

function isPureNodeDeclaration(line: string, nodeId: string): boolean {
  return extractPureDeclaration(line, nodeId) !== null;
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
  // Splittable edge-declarations (e.g. `A[X] --> B`) move just like pure ones.
  if (splitEdgeBearingDeclaration(code.split("\n"), nodeLine, nodeId))
    return { eligible: true, reason: null };
  // A line that both declares the node shape and connects it (e.g. `A[X] --> B`)
  // is an edge-declaration; a bare reference with no shape (e.g. `A --> B`) is
  // edge-only. Mirror the shape checks in isPureNodeDeclaration, on the
  // shape-masked line so label text cannot masquerade as a shape.
  const masked = maskShapeBodies(line);
  const esc = escapeRegExp(nodeId);
  let hasShape = new RegExp(`(^|[^A-Za-z0-9_-])${esc}\\s*(\\[|\\(|\\{|>|@\\{)`).test(masked);
  if (!hasShape) {
    const sanitized = nodeId.replace(/\s+/g, "");
    const quotedRe = /"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotedRe.exec(masked)) !== null) {
      if (match[1].replace(/\s+/g, "") !== sanitized) continue;
      if (/^\s*(\[|\(|\{|>|@\{)/.test(masked.slice(match.index + match[0].length))) {
        hasShape = true;
        break;
      }
    }
  }
  if (hasShape && CONNECTOR_REGEX.test(masked))
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

function skipSpaces(line: string, from: number): number {
  let p = from;
  while (p < line.length && (line[p] === " " || line[p] === "\t")) p += 1;
  return p;
}

/**
 * Split an edge-bearing declaration line for `nodeId` into its standalone
 * declaration (`A[X]`) and the bare edge that stays behind (`A --> B`,
 * operator/labels/chain tail verbatim). Returns null when the line cannot be
 * split safely — no connector, structural line, unclosed `@{`, `&`-fanout
 * (shortcut: any `&` rejects, even inside a label, rather than guessing),
 * no shape segment for `nodeId`, or a standalone duplicate declaration
 * elsewhere (moving would silently duplicate it).
 *
 * Token scanning runs over the shape-masked line (same length, identical
 * positions) so label interiors cannot produce false tokens; slicing uses
 * the original text.
 */
function splitEdgeBearingDeclaration(
  lines: string[],
  nodeLine: number,
  nodeId: string,
): { decl: string; edge: string } | null {
  const line = lines[nodeLine];
  const masked = maskShapeBodies(line);
  if (!CONNECTOR_REGEX.test(masked)) return null;
  if (line.includes("&")) return null;
  if (isGlobalOrStructural(line.trim())) return null;
  const atIndex = line.indexOf("@{");
  if (atIndex !== -1 && line.indexOf("}", atIndex) === -1) return null;

  // Quoted-id fallback first so an unquoted scan cannot match inside quotes
  // (e.g. `"A"[X]` for node `A`); top-level quoted ids survive the mask.
  let tokenStart = -1;
  let tokenEnd = -1;
  const sanitized = nodeId.replace(/\s+/g, "");
  const quotedRe = /"([^"]+)"/g;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = quotedRe.exec(masked)) !== null) {
    if (quotedMatch[1].replace(/\s+/g, "") !== sanitized) continue;
    if (matchShapeOpener(masked, skipSpaces(masked, quotedMatch.index + quotedMatch[0].length))) {
      tokenStart = quotedMatch.index;
      tokenEnd = quotedMatch.index + quotedMatch[0].length;
      break;
    }
  }
  if (tokenStart === -1) {
    const esc = escapeRegExp(nodeId);
    const tokenRe = new RegExp(`(^|[^A-Za-z0-9_-])${esc}(?![A-Za-z0-9_-])`, "g");
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenRe.exec(masked)) !== null) {
      const start = tokenMatch.index + tokenMatch[1].length;
      if (matchShapeOpener(masked, skipSpaces(masked, start + nodeId.length))) {
        tokenStart = start;
        tokenEnd = start + nodeId.length;
        break;
      }
    }
  }
  if (tokenStart === -1) return null;

  const openerAt = skipSpaces(line, tokenEnd);
  const opener = matchShapeOpener(line, openerAt);
  if (!opener) return null;
  const shapeEnd = findShapeEnd(line, openerAt, opener.open, opener.closers);
  if (shapeEnd === -1) return null;

  for (let i = 0; i < lines.length; i += 1) {
    if (i === nodeLine) continue;
    if (isPureNodeDeclaration(lines[i], nodeId)) return null;
  }

  const idToken = line.slice(tokenStart, tokenEnd);
  return {
    decl: `${idToken}${line.slice(openerAt, shapeEnd)}`,
    edge: `${line.slice(0, tokenStart)}${idToken}${line.slice(shapeEnd)}`,
  };
}

/** True when `line` references `id` as a real token (masked token or quoted id). */
function lineReferencesNode(line: string, id: string): boolean {
  const masked = maskShapeBodies(line);
  const esc = escapeRegExp(id);
  if (new RegExp(`(^|[^A-Za-z0-9_-])${esc}([^A-Za-z0-9_-]|$)`).test(masked)) return true;
  const sanitized = id.replace(/\s+/g, "");
  const quotedRe = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = quotedRe.exec(masked)) !== null) {
    if (match[1].replace(/\s+/g, "") === sanitized) return true;
  }
  return false;
}

interface LineEndpoint {
  /** Id exactly as written on the line, including quotes. */
  idText: string;
  /** Inline shape text following the id (e.g. `[Y]`), or empty. */
  shapeText: string;
  /** Id without quotes. */
  plain: string;
  /** Id with quotes and whitespace stripped (Mermaid's SVG id form). */
  sanitized: string;
}

/**
 * Extract every edge endpoint token (with any inline shape) from an edge line,
 * in source order. Edge-label bars and shape labels are masked first, so label
 * text never yields a bogus endpoint; `&`-fanouts yield each fan member;
 * `id@` edge-id prefixes are skipped.
 */
function extractEdgeEndpoints(line: string): LineEndpoint[] {
  if (!CONNECTOR_REGEX.test(line)) return [];
  const masked = maskShapeBodies(line);
  const connectorRe = new RegExp(CONNECTOR_REGEX.source, "g");
  const bounds: number[] = [0];
  let match: RegExpExecArray | null;
  while ((match = connectorRe.exec(masked)) !== null) {
    bounds.push(match.index, match.index + match[0].length);
  }
  bounds.push(masked.length);

  const endpoints: LineEndpoint[] = [];
  const seen = new Set<string>();
  for (let k = 0; k + 1 < bounds.length; k += 2) {
    let p = bounds[k];
    const sideEnd = bounds[k + 1];
    while (p < sideEnd) {
      const ch = masked[p];
      if (ch === " " || ch === "\t" || ch === "&") {
        p += 1;
        continue;
      }
      let idEnd: number;
      if (ch === '"') {
        idEnd = p + 1;
        while (idEnd < sideEnd && masked[idEnd] !== '"') idEnd += 1;
        idEnd = Math.min(idEnd + 1, sideEnd);
      } else {
        const word = masked.slice(p, sideEnd).match(/^[A-Za-z0-9_-]+/);
        if (!word) {
          p += 1;
          continue;
        }
        idEnd = p + word[0].length;
      }
      // `word@connector` is an edge-id prefix, not an endpoint.
      if (masked[idEnd] === "@" && masked[idEnd + 1] !== "{") {
        p = idEnd + 1;
        continue;
      }
      const idText = line.slice(p, idEnd);
      let shapeText = "";
      let q = skipSpaces(line, idEnd);
      const opener = matchShapeOpener(line, q);
      if (opener) {
        const shapeEnd = findShapeEnd(line, q, opener.open, opener.closers);
        if (shapeEnd !== -1) {
          shapeText = line.slice(q, shapeEnd);
          q = shapeEnd;
        }
      }
      p = q;
      const plain = idText.replace(/"/g, "");
      const sanitized = plain.replace(/\s+/g, "");
      if (!sanitized || seen.has(sanitized)) continue;
      seen.add(sanitized);
      endpoints.push({ idText, shapeText, plain, sanitized });
    }
  }
  return endpoints;
}

/** Top-level content indent of the file: first non-structural top-level line. */
function computeTopIndent(lines: string[]): string {
  let topIndent = "    ";
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
  return topIndent;
}

/**
 * Re-scope every line inside the `owner` subgraph (including lines in its
 * nested child subgraphs) that references `nodeId`, out to top level, so the
 * source subgraph stops owning the node via its edge endpoints (Mermaid 11
 * collects edge endpoints into the subgraph node list; the FIRST subgraph
 * wins). Other endpoints of a relocated line keep their membership: when an
 * endpoint would no longer be referenced anywhere inside `owner` after the
 * relocation, a declaration for it (shaped `B[Y]` when the line carried a
 * shape, else the bare id) is left behind at the relocated line's original
 * position. Relative order of relocated lines is preserved.
 *
 * shortcut: lines referencing `nodeId` inside a subgraph that is NOT the
 * source subgraph (and not nested within it) are not re-scoped.
 */
function hoistIncidentEdgeLines(
  lines: string[],
  nodeId: string,
  owner: string,
  excludeLines: Set<number>,
): { lines: string[]; hoisted: boolean } {
  const current = lines.join("\n");
  const start = findFlowchartSubgraphLine(current, owner);
  if (start === -1) return { lines, hoisted: false };
  const end = findFlowchartSubgraphEndLine(current, owner);
  if (end === -1) return { lines, hoisted: false };

  const toHoist: number[] = [];
  for (let i = start + 1; i < end; i += 1) {
    if (excludeLines.has(i)) continue;
    const t = lines[i].trim();
    if (!t || t.startsWith("subgraph") || t === "end" || isGlobalOrStructural(t)) continue;
    if (lineReferencesNode(lines[i], nodeId)) toHoist.push(i);
  }
  if (toHoist.length === 0) return { lines, hoisted: false };

  const removed = new Set(toHoist);
  const remaining: string[] = [];
  for (let i = start + 1; i < end; i += 1) {
    if (!removed.has(i)) remaining.push(lines[i]);
  }

  const nodeSan = nodeId.replace(/\s+/g, "");
  const leftovers = new Map<
    string,
    { at: number; idText: string; decl: string; hasShape: boolean }
  >();
  for (const i of toHoist) {
    for (const ep of extractEdgeEndpoints(lines[i])) {
      if (ep.sanitized === nodeSan) continue;
      // Never leave a bare declaration shadowing a subgraph id.
      if (findFlowchartSubgraphLine(current, ep.plain) !== -1) continue;
      const prev = leftovers.get(ep.sanitized);
      if (prev) {
        // Prefer the occurrence that carries the endpoint's shape/label.
        if (ep.shapeText && !prev.hasShape) {
          prev.decl = ep.idText + ep.shapeText;
          prev.hasShape = true;
        }
        continue;
      }
      if (remaining.some((l) => lineReferencesNode(l, ep.sanitized))) continue;
      leftovers.set(ep.sanitized, {
        at: i,
        idText: ep.idText,
        decl: ep.idText + ep.shapeText,
        hasShape: ep.shapeText !== "",
      });
    }
  }

  const leftoverAt = new Map<number, string[]>();
  for (const leftover of leftovers.values()) {
    const decls = leftoverAt.get(leftover.at) ?? [];
    decls.push(leftover.decl);
    leftoverAt.set(leftover.at, decls);
  }

  const out: string[] = [];
  const hoistedTexts: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (removed.has(i)) hoistedTexts.push(lines[i]);
    else out.push(lines[i]);
    // A relocated line leaves a declaration behind at its original position
    // when an endpoint would otherwise lose its membership here.
    const decls = leftoverAt.get(i);
    if (decls) {
      const indent = indentOf(lines[i]);
      for (const decl of decls) out.push(indent + decl);
    }
  }
  const topIndent = computeTopIndent(out);
  let insertAt = out.length;
  while (insertAt > 0 && !out[insertAt - 1].trim()) insertAt -= 1;
  out.splice(insertAt, 0, ...hoistedTexts.map((text) => topIndent + text.trim()));
  return { lines: out, hoisted: true };
}

/**
 * Move the declaration of `nodeId` into `destSubgraphId` (or to top level
 * when null), preserving id/label/shape/style/connections. Style/class/
 * linkStyle/click lines, and comments stay in place. Returns the input string
 * unchanged (same value) on every no-op/invalid case.
 *
 * An edge-bearing declaration (e.g. `A[X] --> B`) auto-splits: the bare edge
 * (`A --> B`) moves out with the node (it would otherwise keep the source
 * subgraph owning the node via Mermaid's edge-endpoint membership), and only
 * the declaration takes the declaration slot. A compound `;` line (e.g.
 * `A[Alpha]; B[Beta]`) moves only `nodeId`'s statement; the remaining
 * statement(s) stay on the original line without a dangling separator. Only
 * the first single-line declaration is moved; duplicate declarations beyond
 * the first are left behind.
 *
 * After the declaration moves, every other line inside the source subgraph
 * that references the node (including lines in nested child subgraphs) is
 * re-scoped to top level — with declarations left behind for endpoints that
 * would otherwise lose their subgraph membership — and positional linkStyle
 * indices are healed via `rebuildLinkStyles` (only when such hoisting
 * happened, so plain moves stay byte-identical).
 *
 * shortcut: lines referencing the node inside a subgraph that is NOT the
 * source subgraph are not re-scoped.
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
  let content: string;
  let bareEdge: string | null = null;
  let remainderLine: string | null = null;
  const pure = extractPureDeclaration(declLine, nodeId);
  if (pure) {
    content = pure.decl;
    if (pure.remainder !== null) remainderLine = indentOf(declLine) + pure.remainder;
  } else {
    const split = splitEdgeBearingDeclaration(lines, nodeLine, nodeId);
    if (!split) return code;
    content = split.decl;
    bareEdge = split.edge;
  }

  // Owner is resolved BEFORE any mutation so hoisting scans the source block.
  const owner = findFlowchartNodeSubgraphId(code, nodeId);

  if (destSubgraphId !== null) {
    if (findFlowchartSubgraphLine(code, destSubgraphId) === -1) return code;
    const endLine = findFlowchartSubgraphEndLine(code, destSubgraphId);
    if (endLine === -1) return code;
    if (owner === destSubgraphId) return code;

    if (bareEdge !== null) lines[nodeLine] = bareEdge;
    else if (remainderLine !== null) lines[nodeLine] = remainderLine;
    else lines.splice(nodeLine, 1);
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
    return finalizeMove(code, lines, nodeId, owner, new Set([freshEnd]));
  }

  // Top level: already top-level is a no-op.
  if (owner === null) return code;
  if (bareEdge !== null) lines[nodeLine] = bareEdge;
  else if (remainderLine !== null) lines[nodeLine] = remainderLine;
  else lines.splice(nodeLine, 1);
  const topIndent = computeTopIndent(lines);
  // Append after the last non-blank line so trailing newlines are preserved.
  let insertAt = lines.length;
  while (insertAt > 0 && !lines[insertAt - 1].trim()) insertAt -= 1;
  lines.splice(insertAt, 0, `${topIndent}${content}`);
  return finalizeMove(code, lines, nodeId, owner, new Set([insertAt]));
}

/**
 * Re-scope incident edges out of the source subgraph (when there is one) and
 * heal positional linkStyle indices — but only when hoisting actually
 * happened, so plain moves stay byte-identical.
 */
function finalizeMove(
  original: string,
  lines: string[],
  nodeId: string,
  owner: string | null,
  movedDeclLine: Set<number>,
): string {
  let working = lines;
  let hoisted = false;
  if (owner !== null) {
    const result = hoistIncidentEdgeLines(working, nodeId, owner, movedDeclLine);
    working = result.lines;
    hoisted = result.hoisted;
  }
  const out = working.join("\n");
  return hoisted ? rebuildLinkStyles(original, out) : out;
}
