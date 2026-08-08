import { determineDiagramType } from "@/lib/diagrams/utils";

export type MermaidFormatStatus =
  | "changed"
  | "unchanged"
  | "skipped-indent-sensitive";

export type MermaidFormatResult = {
  formatted: string;
  status: MermaidFormatStatus;
  diagramType: string;
};

const DEFAULT_INDENT = "    ";

const BLOCK_OPEN = new Set([
  "subgraph",
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

const BRACE_KEYWORD_OPEN =
  /^(?:class|state|namespace)\s+\S[\s\S]*\{\s*$/i;

/** ER entity bodies and similar: `CUSTOMER {` / `ORDER {` */
const BRACE_GENERIC_OPEN = /^[A-Za-z_][\w-]*\s*\{\s*$/;

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
  return (
    /^(?:flowchart|graph)(?:\s|$)/i.test(stripped) ||
    /^(?:sequenceDiagram|classDiagram(?:-v2)?|erDiagram|stateDiagram(?:-v2)?|gitGraph|requirementDiagram|gantt|pie|journey|mindmap|timeline|quadrantChart|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|architecture-beta)\b/.test(
      stripped,
    ) ||
    /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/.test(stripped)
  );
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
    if (isDecl || stripped.startsWith("%%{")) {
      depth = 0;
    } else {
      const base = seenDiagramDecl ? 1 : 0;
      if (BLOCK_SAME.has(firstWord)) {
        depth = base + braceDepth + Math.max(0, endBlockDepth - 1);
      } else if (stripped === "}") {
        depth = base + braceDepth;
      } else if (firstWord === "end") {
        depth = base + braceDepth + endBlockDepth;
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
 * Preserves YAML front matter. Skips structural re-indent for mindmap/timeline.
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
  const frontMatter =
    frontMatterLines.length > 0 ? frontMatterLines.join("\n") + "\n" : "";

  if (INDENT_SENSITIVE.has(diagramType)) {
    const cleaned = lightCleanupPreserveIndent(bodyLines);
    const formatted = frontMatter + cleaned.join("\n");
    if (formatted === code) {
      return { formatted: code, status: "unchanged", diagramType };
    }
    return { formatted, status: "skipped-indent-sensitive", diagramType };
  }

  const reformatted = formatBody(bodyLines, indentUnit);
  const formatted = frontMatter + reformatted.join("\n");

  if (formatted === code) {
    return { formatted, status: "unchanged", diagramType };
  }
  return { formatted, status: "changed", diagramType };
}
