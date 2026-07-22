import { CONNECTOR_REGEX } from "./utils";

/**
 * Canvas-to-code line mapping helpers.
 *
 * These resolve the 0-indexed source line(s) that define a selected canvas
 * element so the code panel can highlight + scroll to them. Sequence-diagram
 * elements (messages/notes/blocks/actors) already have dedicated entry parsers
 * in LiveMaidEditor / useCanvasInteraction; this module only covers the
 * flowchart cases (nodes and edges), which previously relied on ad-hoc inline
 * searches.
 *
 * A return of -1 means "no confident match" — callers should render no
 * highlight rather than guess.
 */

// Character-class *body* for a Mermaid identifier (no surrounding brackets, so
// it can be embedded inside both `[...]` and `[^...]`).
const MERMAID_ID = "A-Za-z0-9_-";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isStructuralLine(trimmed: string): boolean {
  return (
    !trimmed ||
    trimmed.startsWith("%%") ||
    trimmed.startsWith("subgraph") ||
    trimmed === "end" ||
    trimmed.startsWith("flowchart") ||
    trimmed.startsWith("graph")
  );
}

/**
 * Find the source line of a flowchart subgraph declaration.
 * Matches `subgraph <id>` or `subgraph <id>["Title"]` at the start of a line.
 * Returns the 0-indexed line number, or -1 if not found.
 */
export function findFlowchartSubgraphLine(code: string, subgraphId: string): number {
  if (!subgraphId) return -1;
  const esc = escapeRegExp(subgraphId);
  const declRe = new RegExp(`^\\s*subgraph\\s+${esc}(?:\\s*\\[|\\s*$)`, "im");
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (declRe.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Find the source line that best defines a flowchart node. Prefers a line where
 * the id is immediately followed by a shape opener (`A[...]`, `A(...)`, `A@{...}`)
 * — its declaration — and falls back to the first line that references the id as
 * a standalone token.
 */
export function findFlowchartNodeLine(code: string, nodeId: string): number {
  if (!nodeId) return -1;
  const esc = escapeRegExp(nodeId);
  const tokenRe = new RegExp(`(^|[^${MERMAID_ID}])${esc}([^${MERMAID_ID}]|$)`);
  const declRe = new RegExp(`(^|[^${MERMAID_ID}])${esc}\\s*(\\[|\\(|\\{|>|@\\{)`);

  const lines = code.split("\n");
  let firstReference = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (isStructuralLine(trimmed)) continue;
    if (!tokenRe.test(lines[i])) continue;
    if (declRe.test(lines[i])) return i; // declaration wins immediately
    if (firstReference === -1) firstReference = i;
  }

  return firstReference;
}

/**
 * Find the source line of the `occurrenceIndex`-th edge from `src` to `dst`.
 * Mirrors the scan in `getLinkIndex` (which returns a link ordinal) but returns
 * the absolute line index instead.
 */
export function findFlowchartEdgeLine(
  code: string,
  src: string,
  dst: string,
  occurrenceIndex: number = 0,
): number {
  if (!src || !dst) return -1;
  const lines = code.split("\n");
  let matchingOccurrenceCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (isStructuralLine(trimmed)) continue;
    if (!CONNECTOR_REGEX.test(trimmed)) continue;

    const parts = trimmed.split(CONNECTOR_REGEX);
    if (parts.length < 2) continue;

    for (let p = 0; p < parts.length - 1; p += 1) {
      const cleanSrcStr = parts[p]
        .replace(/\|[^|]*\|/g, "")
        .replace(/"[^"]*"/g, "")
        .replace(/\b[a-zA-Z0-9_-]+@\s*$/, "")
        .trim();
      const cleanDstStr = parts[p + 1]
        .replace(/\|[^|]*\|/g, "")
        .replace(/"[^"]*"/g, "")
        .trim();

      const srcLastWord = cleanSrcStr.split(/\s+/).pop() || "";
      const dstFirstWord = cleanDstStr.split(/\s+/)[0] || "";
      const srcMatch = srcLastWord.match(/^([a-zA-Z0-9_-]+)/);
      const dstMatch = dstFirstWord.match(/^([a-zA-Z0-9_-]+)/);

      if (srcMatch && dstMatch && srcMatch[1] === src && dstMatch[1] === dst) {
        if (matchingOccurrenceCount === occurrenceIndex) return i;
        matchingOccurrenceCount += 1;
      }
    }
  }

  return -1;
}

/**
 * Find the declaration line of a sequence participant/actor by id, e.g.
 * `participant Alice`, `actor Bob as Robert`. Returns -1 if the participant is
 * implicit (never explicitly declared).
 */
export function findSequenceParticipantLine(code: string, actorId: string): number {
  if (!actorId) return -1;
  const esc = escapeRegExp(actorId);
  const declRe = new RegExp(
    `^(?:participant|actor|boundary|control|entity|database|collections|queue)\\s+${esc}(?:\\s|@|$)`,
    "i",
  );
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (declRe.test(lines[i].trim())) return i;
  }
  return -1;
}
