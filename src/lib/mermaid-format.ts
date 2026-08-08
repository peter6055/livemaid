import { determineDiagramType } from "@/lib/diagrams/utils";

export type MermaidFormatStatus = "changed" | "unchanged";

export type MermaidFormatResult = {
  formatted: string;
  status: MermaidFormatStatus;
  diagramType: string;
  skippedIndentSensitive?: boolean;
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

const INDENT_SENSITIVE = new Set(["mindmap", "timeline"]);

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
 * Light cleanup for indent-sensitive diagrams: trim trailing whitespace and
 * collapse blank lines without changing leading indentation of content.
 */
function lightCleanupPreserveIndent(bodyLines: string[]): string[] {
  const trimmed = bodyLines.map((l) => l.replace(/\s+$/, ""));
  return collapseBlankLines(trimmed);
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
 * Format Mermaid source for LiveMaid's editor Format action.
 * Preserves YAML front matter. Indent-sensitive diagrams (mindmap/timeline) get
 * light cleanup only and report `skippedIndentSensitive` so callers can explain
 * that structural re-indentation is skipped.
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

  if (INDENT_SENSITIVE.has(diagramType)) {
    const cleaned = lightCleanupPreserveIndent(bodyLines);
    const formatted = frontMatter + cleaned.join("\n") + newlineSuffix;
    return {
      formatted,
      status: formatted === code ? "unchanged" : "changed",
      diagramType,
      skippedIndentSensitive: true,
    };
  }

  const reformatted = formatBody(bodyLines, indentUnit);
  const formatted = frontMatter + reformatted.join("\n") + newlineSuffix;

  return {
    formatted,
    status: formatted === code ? "unchanged" : "changed",
    diagramType,
  };
}
