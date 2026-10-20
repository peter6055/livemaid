/**
 * Shared leaf scanner for Mermaid flowchart shape syntax.
 *
 * - opener→closer matching with multiple closers per opener (trapezoids),
 *   quote-aware (`"` delimits everywhere; `'` is ordinary legacy label text
 *   and only delimits inside `@{...}` expanded metadata).
 * - a length-preserving line masker that blanks shape-label bodies and
 *   edge-label bars so token/regex matching only ever sees structural text
 *   (ids, brackets, connectors) — declaration-like text inside another
 *   node's quoted label can no longer match.
 *
 * Leaf module: no project imports, so both `selectionLineMap.ts` and
 * `membership.ts` can use it without a cycle.
 */

/** Shape openers (longest first) with every closer each opener may terminate with. */
const SHAPE_DELIMITERS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["(((", [")))"]],
  ["((", ["))"]],
  ["[[", ["]]"]],
  ["[(", [")]"]],
  ["{{", ["}}"]],
  ["([", ["])"]],
  ["[/", ["/]", "\\]"]],
  ["[\\", ["\\]", "/]"]],
  ["@{", ["}"]],
  ["[", ["]"]],
  ["(", [")"]],
  ["{", ["}"]],
  [">", ["]"]],
];

export interface ShapeOpener {
  open: string;
  closers: readonly string[];
}

/**
 * `>` is both the asymmetric-shape opener (`A>flag]`) and the tail of every
 * arrow connector (`-->`, `==>`). It only opens a shape when the previous
 * non-blank char is part of an id or a closing quote — never `-`, `=`, `.`
 * (connector chars).
 */
function isAsymmetricOpenerContext(line: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && (line[j] === " " || line[j] === "\t")) j -= 1;
  return j >= 0 && /[A-Za-z0-9_"]/.test(line[j]);
}

/** Match a shape opener at `at` (longest first), or null. */
export function matchShapeOpener(line: string, at: number): ShapeOpener | null {
  for (const [open, closers] of SHAPE_DELIMITERS) {
    if (!line.startsWith(open, at)) continue;
    if (open === ">" && !isAsymmetricOpenerContext(line, at)) continue;
    return { open, closers };
  }
  return null;
}

/** Index one past the first matching quote; `line.length` when unterminated. */
function findQuoteEnd(line: string, at: number): number {
  const quote = line[at];
  for (let i = at + 1; i < line.length; i += 1) {
    if (line[i] === "\\") i += 1;
    else if (line[i] === quote) return i + 1;
  }
  return line.length;
}

/**
 * Index one past the first closer (any of `closers`) for the shape opened at
 * `openAt`, respecting quoted strings: `"` delimits everywhere; `'` is
 * ordinary text in legacy labels and only delimits inside `@{...}` metadata.
 * Returns -1 when no closer is found on the line.
 */
export function findShapeEnd(
  line: string,
  openAt: number,
  open: string,
  closers: readonly string[],
): number {
  let inString = false;
  let quote = "";
  for (let i = openAt + open.length; i < line.length; i += 1) {
    const ch = line[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "'" && open === "@{") {
      inString = true;
      quote = ch;
      continue;
    }
    for (const close of closers) {
      if (line.startsWith(close, i)) return i + close.length;
    }
  }
  return -1;
}

/**
 * Length-preserving mask of one line: blank (with spaces) every shape-label
 * body (`[...]`, `(...)`, `{...}`, `>...`, `@{...}` incl. trapezoid
 * variants) and every edge-label bar (`|...|`), so token matching cannot hit
 * id-like text that only exists inside another node's label or an edge
 * label. Quoted strings at top level (e.g. quoted node ids in
 * `"My Node"[Label]` or `"My Node" --> B`) pass through verbatim. Unmatched
 * openers and lone `|` are copied through unchanged. Indices are identical
 * between the input and the masked output.
 */
export function maskShapeBodies(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      const end = findQuoteEnd(line, i);
      out += line.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "|") {
      // Edge-label bar: mask through the closing `|`, skipping quoted runs.
      let j = i + 1;
      let close = -1;
      while (j < line.length) {
        if (line[j] === '"') {
          j = findQuoteEnd(line, j);
          continue;
        }
        if (line[j] === "|") {
          close = j;
          break;
        }
        j += 1;
      }
      if (close === -1) {
        out += ch;
        i += 1;
        continue;
      }
      out += " ".repeat(close - i + 1);
      i = close + 1;
      continue;
    }
    const opener = matchShapeOpener(line, i);
    if (opener) {
      const end = findShapeEnd(line, i, opener.open, opener.closers);
      if (end !== -1) {
        // Keep the opener visible (it is structural); blank interior + closer.
        out += opener.open;
        out += " ".repeat(end - i - opener.open.length);
        i = end;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Split a line into `;`-separated statements at top level only — never
 * inside quotes, shape brackets, or edge-label bars. Statement slices keep
 * their original text (including inner spacing).
 */
export function splitTopLevelStatements(line: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      i = findQuoteEnd(line, i);
      continue;
    }
    if (ch === "|") {
      let j = i + 1;
      while (j < line.length && line[j] !== "|") j += 1;
      i = j < line.length ? j + 1 : line.length;
      continue;
    }
    const opener = matchShapeOpener(line, i);
    if (opener) {
      const end = findShapeEnd(line, i, opener.open, opener.closers);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    if (ch === ";") {
      statements.push(line.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  statements.push(line.slice(start));
  return statements;
}
