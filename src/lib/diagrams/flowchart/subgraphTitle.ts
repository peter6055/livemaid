import { findFlowchartSubgraphLine } from "./selectionLineMap";

/**
 * Flowchart/graph subgraph *title* editing helpers.
 *
 * A subgraph's visible title lives in its `subgraph <id>["Title"]` declaration.
 * These helpers resolve that title and rewrite ONLY the title portion, leaving
 * the identifier, indentation, nesting, child nodes and edges untouched.
 */

export const SUBGRAPH_TITLE_PREFIX = "SUBGRAPH_TITLE_";

/** Selection id used while the subgraph title editor is open. */
export function subgraphTitleId(subgraphId: string): string {
  return `${SUBGRAPH_TITLE_PREFIX}${subgraphId}`;
}

export function isSubgraphTitleId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(SUBGRAPH_TITLE_PREFIX));
}

export function subgraphIdFromTitleId(id: string): string {
  return id.slice(SUBGRAPH_TITLE_PREFIX.length);
}

/** Visible title of the matching `subgraph` declaration, or null if not found. */
export function getSubgraphTitle(code: string, subgraphId: string): string | null {
  const lineIndex = findFlowchartSubgraphLine(code, subgraphId);
  if (lineIndex === -1) return null;
  const line = code.split("\n")[lineIndex].trim();
  const bracket = line.match(/^subgraph\s+\S+?\s*\[([\s\S]*)\]\s*$/i);
  if (bracket) return decodeTitle(bracket[1].replace(/^["']|["']$/g, "").trim());
  const plain = line.match(/^subgraph\s+(.+)$/i);
  if (!plain) return null;
  const raw = plain[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return decodeTitle(raw.slice(1, -1).trim());
  }
  return raw;
}

/** `#quot;` is Mermaid's escape for a `"` inside a double-quoted label; undo it. */
function decodeTitle(title: string): string {
  return title.replace(/#quot;/g, '"');
}

/** Rewrite only the visible title of the matching subgraph declaration. */
export function setSubgraphTitle(code: string, subgraphId: string, newTitle: string): string {
  const lineIndex = findFlowchartSubgraphLine(code, subgraphId);
  if (lineIndex === -1) return code;
  const lines = code.split("\n");
  const original = lines[lineIndex];
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const idMatch = original.trim().match(/^subgraph\s+(\S+?)\s*(?:\[[\s\S]*\])?\s*$/i);
  if (!idMatch) return code;
  const subId = idMatch[1];
  const title = newTitle.replace(/\r?\n/g, "<br/>").trim();
  // Mermaid labels only support double-quoted strings; escape an embedded `"`
  // with the `#quot;` entity so the delimiter is never ambiguous.
  const quoted = `"${title.replace(/"/g, "#quot;")}"`;
  lines[lineIndex] = `${lead}subgraph ${subId}[${quoted}]`;
  return lines.join("\n");
}
