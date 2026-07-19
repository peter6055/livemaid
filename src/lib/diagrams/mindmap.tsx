import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export type MindmapShapeKind =
  | "default"
  | "square"
  | "rounded"
  | "circle"
  | "bang"
  | "cloud"
  | "hexagon";

export interface MindmapNode {
  id: string;
  label: string;
  sourceLineIndex: number;
  indent: number;
  parentId: string | null;
  childIds: string[];
  shape: MindmapShapeKind;
  syntaxId: string | null;
}

export interface ParsedMindmap {
  nodes: MindmapNode[];
  headerLineIndex: number;
  bodyStartLineIndex: number;
}

const NODE_ID_PREFIX = "MINDMAP_";
const DEFAULT_INDENT = 2;

function splitFrontmatterLineCount(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

function leadingIndent(line: string): number {
  const match = line.match(/^[ \t]*/);
  return match ? match[0].replace(/\t/g, "  ").length : 0;
}

function isMindmapMetadataLine(trimmed: string): boolean {
  return (
    !trimmed ||
    trimmed.startsWith("%%") ||
    trimmed.startsWith("::icon(") ||
    trimmed.startsWith(":::")
  );
}

function stripClassSuffix(text: string): string {
  return text.replace(/\s+:::[A-Za-z0-9_ -]+$/, "").trim();
}

export function mindmapNodeIdForLine(lineIndex: number): string {
  return `${NODE_ID_PREFIX}${lineIndex}`;
}

export function mindmapLineFromNodeId(id: string | null | undefined): number | null {
  const match = id?.match(/^MINDMAP_(\d+)$/);
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isFinite(line) ? line : null;
}

export function parseMindmapNodeText(rawText: string): {
  label: string;
  shape: MindmapShapeKind;
  syntaxId: string | null;
} {
  const text = stripClassSuffix(rawText.trim());
  const patterns: Array<{ shape: MindmapShapeKind; re: RegExp }> = [
    { shape: "circle", re: /^([A-Za-z0-9_-]+)\(\((.*)\)\)$/ },
    { shape: "rounded", re: /^([A-Za-z0-9_-]+)\((.*)\)$/ },
    { shape: "square", re: /^([A-Za-z0-9_-]+)\[(.*)\]$/ },
    { shape: "hexagon", re: /^([A-Za-z0-9_-]+)\{\{(.*)\}\}$/ },
    { shape: "bang", re: /^([A-Za-z0-9_-]+)\)\)(.*)\(\($/ },
    { shape: "cloud", re: /^([A-Za-z0-9_-]+)\)(.*)\($/ },
  ];

  for (const { shape, re } of patterns) {
    const match = text.match(re);
    if (match) return { syntaxId: match[1], label: match[2].trim(), shape };
  }

  return { syntaxId: null, label: text, shape: "default" };
}

function safeSyntaxId(label: string, fallbackLine: number): string {
  const base = label
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^A-Za-z]+/, "");
  return base || `node_${fallbackLine + 1}`;
}

export function formatMindmapNodeText(
  label: string,
  shape: MindmapShapeKind,
  syntaxId: string | null,
  fallbackLine: number,
): string {
  const cleanLabel = label.replace(/[\r\n]+/g, " ").trim() || "New Element 1";
  if (shape === "default") return cleanLabel;
  const id = syntaxId || safeSyntaxId(cleanLabel, fallbackLine);
  if (shape === "square") return `${id}[${cleanLabel}]`;
  if (shape === "rounded") return `${id}(${cleanLabel})`;
  if (shape === "circle") return `${id}((${cleanLabel}))`;
  if (shape === "bang") return `${id}))${cleanLabel}((`;
  if (shape === "cloud") return `${id})${cleanLabel}(`;
  return `${id}{{${cleanLabel}}}`;
}

export function parseMindmap(code: string): ParsedMindmap {
  const lines = code.split("\n");
  const frontmatterEnd = splitFrontmatterLineCount(lines);
  const headerLineIndex = lines.findIndex(
    (line, index) => index >= frontmatterEnd && /^\s*mindmap\b/.test(line),
  );
  if (headerLineIndex < 0) return { nodes: [], headerLineIndex: -1, bodyStartLineIndex: -1 };

  const nodes: MindmapNode[] = [];
  const stack: MindmapNode[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (isMindmapMetadataLine(trimmed)) continue;

    const indent = leadingIndent(lines[i]);
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const parsed = parseMindmapNodeText(trimmed);
    const node: MindmapNode = {
      id: mindmapNodeIdForLine(i),
      label: parsed.label,
      sourceLineIndex: i,
      indent,
      parentId: parent?.id ?? null,
      childIds: [],
      shape: parsed.shape,
      syntaxId: parsed.syntaxId,
    };
    nodes.push(node);
    if (parent) parent.childIds.push(node.id);
    stack.push(node);
  }

  return { nodes, headerLineIndex, bodyStartLineIndex: headerLineIndex + 1 };
}

export function getMindmapNode(
  code: string,
  nodeId: string | null | undefined,
): MindmapNode | null {
  if (!nodeId) return null;
  return parseMindmap(code).nodes.find((node) => node.id === nodeId) ?? null;
}

function ensureMindmapHeader(code: string): string {
  return parseMindmap(code).headerLineIndex >= 0 ? code : `${code.trimEnd()}\nmindmap`;
}

function uniqueChildLabel(code: string): string {
  const labels = new Set(parseMindmap(code).nodes.map((node) => node.label));
  const base = "New Element";
  let i = 1;
  while (labels.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

function insertionIndentForChild(parsed: ParsedMindmap, parent: MindmapNode): number {
  const directChild = parsed.nodes.find((node) => node.parentId === parent.id);
  if (directChild && directChild.indent > parent.indent) return directChild.indent;
  return parent.indent + DEFAULT_INDENT;
}

function descendantEndLine(lines: string[], parentLineIndex: number): number {
  const parentIndent = leadingIndent(lines[parentLineIndex] ?? "");
  let end = parentLineIndex;
  for (let i = parentLineIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      end = i;
      continue;
    }
    const indent = leadingIndent(lines[i]);
    if (indent <= parentIndent && !trimmed.startsWith("::")) break;
    end = i;
  }
  return end;
}

export function addRootMindmapNode(code: string, label = "Root"): { code: string; nodeId: string } {
  const source = ensureMindmapHeader(code);
  const lines = source.split("\n");
  const parsed = parseMindmap(source);
  const insertAt = parsed.headerLineIndex >= 0 ? parsed.headerLineIndex + 1 : lines.length;
  const line = `${" ".repeat(DEFAULT_INDENT)}${formatMindmapNodeText(label, "default", null, insertAt)}`;
  lines.splice(insertAt, 0, line);
  return { code: lines.join("\n"), nodeId: mindmapNodeIdForLine(insertAt) };
}

export function addMindmapChild(
  code: string,
  parentId: string,
  label = uniqueChildLabel(code),
): { code: string; nodeId: string } {
  const parsed = parseMindmap(code);
  const parent = parsed.nodes.find((node) => node.id === parentId);
  if (!parent) return { code, nodeId: parentId };
  const lines = code.split("\n");
  const insertAt = descendantEndLine(lines, parent.sourceLineIndex) + 1;
  const indent = insertionIndentForChild(parsed, parent);
  lines.splice(
    insertAt,
    0,
    `${" ".repeat(indent)}${formatMindmapNodeText(label, "default", null, insertAt)}`,
  );
  return { code: lines.join("\n"), nodeId: mindmapNodeIdForLine(insertAt) };
}

export function deleteMindmapNode(code: string, nodeId: string): string {
  const node = getMindmapNode(code, nodeId);
  if (!node) return code;
  const lines = code.split("\n");
  const end = descendantEndLine(lines, node.sourceLineIndex);
  lines.splice(node.sourceLineIndex, end - node.sourceLineIndex + 1);
  return lines.join("\n");
}

export function changeMindmapNodeShape(
  code: string,
  nodeId: string,
  shape: MindmapShapeKind,
): string {
  const node = getMindmapNode(code, nodeId);
  if (!node) return code;
  const lines = code.split("\n");
  const raw = lines[node.sourceLineIndex] ?? "";
  const indent = raw.match(/^[ \t]*/)?.[0] ?? "";
  lines[node.sourceLineIndex] =
    `${indent}${formatMindmapNodeText(node.label, shape, node.syntaxId, node.sourceLineIndex)}`;
  return lines.join("\n");
}

export function renameMindmapNode(code: string, nodeId: string, label: string): string {
  const node = getMindmapNode(code, nodeId);
  if (!node) return code;
  const lines = code.split("\n");
  const raw = lines[node.sourceLineIndex] ?? "";
  const indent = raw.match(/^[ \t]*/)?.[0] ?? "";
  lines[node.sourceLineIndex] =
    `${indent}${formatMindmapNodeText(label, node.shape, node.syntaxId, node.sourceLineIndex)}`;
  return lines.join("\n");
}

function mindmapRenderedNodes(container: Element): Element[] {
  const candidates = Array.from(
    container.querySelectorAll("g.mindmap-node, g.node, g[class*='mindmap']"),
  );
  const groups = candidates
    .map((el) => el.closest("g") ?? el)
    .filter((el, index, arr) => arr.indexOf(el) === index)
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  return groups;
}

function mindmapRenderedNodeIndex(element: Element): number | null {
  const rawId = element.getAttribute("data-id") || element.id || "";
  const match = rawId.match(/(?:^|[-_])node[_-](\d+)(?:$|\D)/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

export function mindmapNodeIdFromSvgElement(
  code: string,
  container: Element,
  element: Element,
): string | null {
  const group = element.closest("g.mindmap-node, g.node, g[class*='mindmap']");
  if (!group) return null;
  const index = mindmapRenderedNodeIndex(group);
  if (index === null) return null;
  return parseMindmap(code).nodes[index]?.id ?? null;
}

export function findMindmapSvgElementByNodeId(
  code: string,
  container: Element,
  nodeId: string,
): SVGElement | null {
  const index = parseMindmap(code).nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return null;
  return (
    (mindmapRenderedNodes(container).find((node) => mindmapRenderedNodeIndex(node) === index) as
      | SVGElement
      | undefined) ?? null
  );
}

function MindmapHeaderToolbar({ code, setCode }: EditorContext) {
  const parsed = parseMindmap(code);
  if (parsed.headerLineIndex < 0 || parsed.nodes.length > 0) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 rounded-md px-2 text-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={() => setCode(addRootMindmapNode(code).code)}
    >
      <Plus className="h-4 w-4" />
      <span className="text-sm font-medium">Add main element</span>
    </Button>
  );
}

export const MindmapPlugin: DiagramPlugin = {
  id: "mindmap",
  label: "Mindmap",
  defaultCode: `mindmap\n  Root`,
  ToolbarComponent: MindmapHeaderToolbar,
};
