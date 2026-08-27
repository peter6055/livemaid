import { determineDiagramType } from "@/lib/diagrams/utils";

export type MermaidFormatStatus = "changed" | "unchanged";

export type MermaidFormatResult = {
  formatted: string;
  status: MermaidFormatStatus;
  diagramType: string;
};

const DEFAULT_INDENT = "    ";

const BLOCK_OPEN = new Set([
  "subgraph",
  "box",
  "loop",
  "alt",
  "opt",
  "par",
  "critical",
  "break",
  "rect",
]);

const BLOCK_SAME = new Set(["else", "and", "option"]);

const MINDMAP_MD_OPEN = '["`';
const MINDMAP_MD_CLOSE = '`"';

const BRACE_KEYWORD_OPEN = /^(?:class|state|namespace)\s+\S[\s\S]*\{\s*$/i;

/** ER entity bodies and similar: `CUSTOMER {` / `ORDER {` */
const BRACE_GENERIC_OPEN = /^[A-Za-z_][\w-]*\s*\{\s*$/;

const DIAGRAM_DECLARATIONS = new Set([
  "flowchart",
  "flowchart-elk",
  "graph",
  "sequencediagram",
  "classdiagram",
  "classdiagram-v2",
  "erdiagram",
  "statediagram",
  "statediagram-v2",
  "gitgraph",
  "requirementdiagram",
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "timeline",
  "quadrantchart",
  "sankey",
  "sankey-beta",
  "xychart",
  "xychart-beta",
  "block",
  "block-beta",
  "architecture-beta",
  "kanban",
  "packet",
  "packet-beta",
  "radar",
  "radar-beta",
  "treemap",
  "treemap-beta",
  "zenuml",
  "c4context",
  "c4container",
  "c4component",
  "c4dynamic",
  "c4deployment",
]);

function isBraceOpen(stripped: string): boolean {
  return BRACE_KEYWORD_OPEN.test(stripped) || BRACE_GENERIC_OPEN.test(stripped);
}

function extractFrontMatter(lines: string[]): {
  frontMatterLines: string[];
  bodyStartIndex: number;
} {
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { frontMatterLines: [], bodyStartIndex: 0 };
  }
  const endIndex = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (endIndex <= 0) {
    return { frontMatterLines: [], bodyStartIndex: 0 };
  }
  let bodyStartIndex = endIndex + 1;
  while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === "") {
    bodyStartIndex++;
  }
  return {
    frontMatterLines: lines.slice(0, endIndex + 1),
    bodyStartIndex,
  };
}

function collapseBlankLines(lines: string[]): string[] {
  const collapsed: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    const isBlank = line.trim() === "";
    if (isBlank && prevBlank) continue;
    collapsed.push(line);
    prevBlank = isBlank;
  }
  while (collapsed.length > 0 && collapsed[0].trim() === "") collapsed.shift();
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === "") {
    collapsed.pop();
  }
  return collapsed;
}

function isDiagramDeclaration(stripped: string): boolean {
  if (!stripped || stripped.startsWith("%%")) return false;
  const firstWord = stripped.split(/\s+/)[0].toLowerCase();
  return DIAGRAM_DECLARATIONS.has(firstWord);
}

/**
 * Format a mindmap body. Mindmap indentation is semantic, but only RELATIVE
 * (official grammar: a node's parent is the nearest preceding line with a
 * smaller leading-whitespace length, and unclear indentation is compensated),
 * so re-indenting to canonical depth preserves the exact tree. The exception
 * is a multi-line markdown string (`["` ... `"`]): inner lines are label
 * content and pass through verbatim. Comments and `::icon(` / `:::` lines are
 * ignored by the parser; they are anchored at the depth of the node they
 * follow.
 */
function formatMindmapBody(bodyLines: string[], indentUnit: string): string[] {
  const trimmed = bodyLines.map((l) => l.replace(/\s+$/, ""));
  const collapsed = collapseBlankLines(trimmed);

  const reformatted: string[] = [];
  const stack: number[] = [];
  let lastNodeDepth = 0;
  let seenHeader = false;
  let inMdString = false;

  for (const rawLine of collapsed) {
    if (inMdString) {
      reformatted.push(rawLine);
      if (rawLine.includes(MINDMAP_MD_CLOSE)) inMdString = false;
      continue;
    }

    const stripped = rawLine.trim();
    if (stripped === "") {
      reformatted.push("");
      continue;
    }

    if (!seenHeader && /^mindmap\b/i.test(stripped)) {
      seenHeader = true;
      reformatted.push(stripped);
      continue;
    }
    if (!seenHeader) {
      reformatted.push(stripped);
      continue;
    }

    // Parser-invisible lines (mindmap.jison: SPACELINE / decorateNode only).
    if (stripped.startsWith("%%") || stripped.startsWith("::icon(") || stripped.startsWith(":::")) {
      reformatted.push(indentUnit.repeat(lastNodeDepth) + stripped);
      continue;
    }

    const width = rawLine.length - stripped.length;
    while (stack.length > 0 && width <= stack[stack.length - 1]) stack.pop();
    const depth = stack.length + 1;
    stack.push(width);
    lastNodeDepth = depth;
    reformatted.push(indentUnit.repeat(depth) + stripped);

    const openIdx = stripped.indexOf(MINDMAP_MD_OPEN);
    if (
      openIdx >= 0 &&
      !stripped.slice(openIdx + MINDMAP_MD_OPEN.length).includes(MINDMAP_MD_CLOSE)
    ) {
      inMdString = true;
    }
  }

  return reformatted;
}

function formatBody(bodyLines: string[], indentUnit: string): string[] {
  const trimmed = bodyLines.map((l) => l.replace(/\s+$/, ""));
  const collapsed = collapseBlankLines(trimmed);

  let endBlockDepth = 0;
  let braceDepth = 0;
  let seenDiagramDecl = false;
  const reformatted: string[] = [];

  for (const rawLine of collapsed) {
    const stripped = rawLine.trim();
    if (stripped === "") {
      reformatted.push("");
      continue;
    }

    // Directives stay at column 0.
    if (stripped.startsWith("%%{")) {
      reformatted.push(stripped);
      continue;
    }

    const firstWord = stripped.split(/\s+/)[0].toLowerCase();
    const isDecl = isDiagramDeclaration(stripped);

    if (stripped === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (firstWord === "end") {
      endBlockDepth = Math.max(0, endBlockDepth - 1);
    }

    let depth: number;
    if (isDecl) {
      depth = 0;
    } else {
      const base = seenDiagramDecl ? 1 : 0;
      if (BLOCK_SAME.has(firstWord)) {
        depth = base + braceDepth + Math.max(0, endBlockDepth - 1);
      } else if (stripped === "}") {
        depth = base + braceDepth;
      } else {
        depth = base + braceDepth + endBlockDepth;
      }
    }

    reformatted.push(indentUnit.repeat(depth) + stripped);

    if (isDecl) {
      seenDiagramDecl = true;
    }
    if (isBraceOpen(stripped)) {
      braceDepth++;
    } else if (BLOCK_OPEN.has(firstWord)) {
      endBlockDepth++;
    }
  }

  return reformatted;
}

/**
 * Format a timeline body. Timeline structure is statement-per-line and
 * indentation carries NO meaning (unlike mindmap), so re-indentation cannot
 * change how Mermaid parses the diagram. Canonical style mirrors the timeline
 * plugin's own mutations in `src/lib/diagrams/timeline.tsx`:
 *   - header/directives at column 0
 *   - title / section at one level
 *   - periods at one level outside sections, two levels inside a section
 *   - `: event` continuation lines at their period's level
 */
function formatTimelineBody(bodyLines: string[], indentUnit: string): string[] {
  const trimmed = bodyLines.map((l) => l.replace(/\s+$/, ""));
  const collapsed = collapseBlankLines(trimmed);

  const reformatted: string[] = [];
  let seenHeader = false;
  let inSection = false;

  for (const rawLine of collapsed) {
    const stripped = rawLine.trim();
    if (stripped === "") {
      reformatted.push("");
      continue;
    }

    // Directives stay at column 0.
    if (stripped.startsWith("%%{")) {
      reformatted.push(stripped);
      continue;
    }

    if (!seenHeader) {
      const isHeader = /^timeline\b/i.test(stripped);
      reformatted.push(isHeader || stripped.startsWith("%%") ? stripped : indentUnit + stripped);
      if (isHeader) seenHeader = true;
      continue;
    }

    if (/^section\b/i.test(stripped)) {
      inSection = true;
      reformatted.push(indentUnit + stripped);
      continue;
    }
    if (/^title\b/i.test(stripped)) {
      reformatted.push(indentUnit + stripped);
      continue;
    }
    // Periods and `: event` continuation lines share the period's depth.
    reformatted.push(indentUnit.repeat(inSection ? 2 : 1) + stripped);
  }

  return reformatted;
}

/**
 * Format Mermaid source for LiveMaid's editor Format action.
 * Preserves YAML front matter. Mindmaps are re-indented by relative depth
 * (see `formatMindmapBody`); timelines are fully formatted because their
 * grammar is line-based, not indentation-based.
 */
export function formatMermaidSource(
  code: string,
  options?: { indent?: string },
): MermaidFormatResult {
  const indentUnit = options?.indent ?? DEFAULT_INDENT;
  const diagramType = determineDiagramType(code);
  const lines = code.split("\n");
  const { frontMatterLines, bodyStartIndex } = extractFrontMatter(lines);
  const bodyLines = lines.slice(bodyStartIndex);
  const frontMatter = frontMatterLines.length > 0 ? frontMatterLines.join("\n") + "\n" : "";
  const trailingNewline = code.endsWith("\n");
  const newlineSuffix = trailingNewline ? "\n" : "";

  const reformatted =
    diagramType === "mindmap"
      ? formatMindmapBody(bodyLines, indentUnit)
      : diagramType === "timeline"
        ? formatTimelineBody(bodyLines, indentUnit)
        : formatBody(bodyLines, indentUnit);
  const formatted = frontMatter + reformatted.join("\n") + newlineSuffix;

  return {
    formatted,
    status: formatted === code ? "unchanged" : "changed",
    diagramType,
  };
}
