/**
 * Class Diagram plugin (modular, self-contained).
 *
 * Everything class-diagram-specific lives in this file so the feature is a drop-in
 * plugin per the project's Composition / Plugin Architecture (see reference/ARCHITECTURE.md
 * §6). The only wiring outside this file is the registry entry in `registry.ts`.
 *
 * NOTE: this module intentionally omits the `"use client"` directive (mirroring
 * `flowchart.tsx`). The registry is imported by the server-side `POST /api/diagrams`
 * route to read `defaultCode`; marking the module `"use client"` turns its exports
 * into client references whose `.defaultCode` is `undefined` server-side, which would
 * persist a new diagram with empty code. The toolbar is still only ever rendered
 * inside the client `LiveMaidEditor`, so client behaviour is unaffected.
 *
 * Mermaid class-diagram syntax reference (verified against mermaid 11.15 docs):
 *  - header:        `classDiagram`
 *  - class:         `class Foo { ... }`  (members inside braces) or `Foo : +member` (colon form)
 *  - annotation:    `<<interface>>` on its own line inside the braces (or `<<x>> Foo`)
 *  - member kinds:  a member containing `()` is a method, otherwise an attribute
 *  - title:         frontmatter `--- \n title: X \n ---` above `classDiagram`
 *  - direction:     statement line `direction TB|BT|LR|RL` inside the body
 *  - notes:         `note "text"` (general) or `note for Foo "text"` (class-scoped)
 *  - config flag:   nested `config: \n  class: \n    hideEmptyMembersBox: true` in frontmatter
 */

import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Box,
  StickyNote,
  ChevronsDown,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  Check,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Frontmatter helpers (title + nested config flags)                           */
/* -------------------------------------------------------------------------- */

/** Split the leading YAML frontmatter (between the first pair of `---`) from the body. */
export function splitClassFrontmatter(code: string): { fm: string | null; body: string } {
  const m = code.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (m) return { fm: m[1], body: code.slice(m[0].length) };
  return { fm: null, body: code };
}

/** Re-join a (possibly empty) frontmatter block with the body. Drops the block when empty. */
function joinClassFrontmatter(fmBody: string, body: string): string {
  const trimmed = fmBody.replace(/\s+$/, "");
  if (!trimmed) return body;
  return `---\n${trimmed}\n---\n${body}`;
}

/** Read the current frontmatter `title:` value, or "" if none. */
export function getClassTitle(code: string): string {
  const { fm } = splitClassFrontmatter(code);
  if (!fm) return "";
  const m = fm.match(/^title:[ \t]*(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

/**
 * Insert/replace the frontmatter `title:`. The title is always placed AFTER any `config:`
 * block so the config-anchored global helpers (theme/font) keep matching `^---\nconfig:`.
 */
export function upsertClassTitle(code: string, title: string): string {
  const { fm, body } = splitClassFrontmatter(code);
  const lines = fm ? fm.split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => /^title:[ \t]*/.test(l));
  if (idx >= 0) lines[idx] = `title: ${title}`;
  else lines.push(`title: ${title}`);
  return joinClassFrontmatter(lines.join("\n"), body);
}

/** Remove the frontmatter `title:` line (and the frontmatter block if it becomes empty). */
export function removeClassTitle(code: string): string {
  const { fm, body } = splitClassFrontmatter(code);
  if (!fm) return code;
  const lines = fm.split(/\r?\n/).filter((l) => !/^title:[ \t]*/.test(l));
  return joinClassFrontmatter(lines.join("\n"), body);
}

// A class-diagram note line: `note "text"` or `note for ClassName "text"` (group 2 = inner text).
const CLASS_NOTE_RE = /^(\s*note(?:\s+for\s+[^"]+?)?\s+)"((?:[^"\\]|\\.)*)"(\s*)$/;

/** All `note` lines in source order, with their absolute line index and (unescaped) text. */
export function getClassNotes(code: string): Array<{ lineIndex: number; text: string }> {
  const out: Array<{ lineIndex: number; text: string }> = [];
  code.split("\n").forEach((line, i) => {
    const m = line.match(CLASS_NOTE_RE);
    if (m) out.push({ lineIndex: i, text: m[2].replace(/\\"/g, '"') });
  });
  return out;
}

/**
 * Rewrite the quoted text of the `noteIndex`-th note (source order). The note keyword and any
 * `for <Class>` target are preserved; only the quoted string is replaced. Quotes in the new text
 * are escaped. Returns the code unchanged when the index is out of range.
 */
export function updateClassNoteByIndex(code: string, noteIndex: number, text: string): string {
  const notes = getClassNotes(code);
  const target = notes[noteIndex];
  if (!target) return code;
  const escaped = text.replace(/"/g, '\\"');
  const lines = code.split("\n");
  lines[target.lineIndex] = lines[target.lineIndex].replace(
    CLASS_NOTE_RE,
    (_m, head, _t, tail) => `${head}"${escaped}"${tail}`,
  );
  return lines.join("\n");
}

/** Whether the `config.class.hideEmptyMembersBox` flag is currently enabled. */
export function getHideEmptyMembersBox(code: string): boolean {
  const { fm } = splitClassFrontmatter(code);
  return !!fm && /hideEmptyMembersBox:[ \t]*true/.test(fm);
}

/**
 * Toggle the nested `config.class.hideEmptyMembersBox` flag. The `config:` block is kept as the
 * FIRST key of the frontmatter so the existing config-anchored helpers continue to work.
 */
export function setHideEmptyMembersBox(code: string, on: boolean): string {
  const { fm, body } = splitClassFrontmatter(code);
  let lines = fm ? fm.split(/\r?\n/) : [];

  // Always drop any pre-existing flag line first (idempotent).
  lines = lines.filter((l) => !/^[ \t]*hideEmptyMembersBox:[ \t]*/.test(l));

  if (on) {
    const configIdx = lines.findIndex((l) => /^config:[ \t]*$/.test(l));
    if (configIdx < 0) {
      // No config block yet — create one at the TOP (before title etc.).
      lines.unshift("config:", "  class:", "    hideEmptyMembersBox: true");
    } else {
      // Locate a `class:` child of config (indent 2) before the next top-level key.
      let classIdx = -1;
      for (let i = configIdx + 1; i < lines.length; i += 1) {
        if (/^\S/.test(lines[i])) break;
        if (/^[ \t]{2}class:[ \t]*$/.test(lines[i])) {
          classIdx = i;
          break;
        }
      }
      if (classIdx < 0) lines.splice(configIdx + 1, 0, "  class:", "    hideEmptyMembersBox: true");
      else lines.splice(classIdx + 1, 0, "    hideEmptyMembersBox: true");
    }
  } else {
    // Turning off: clean up an emptied `class:` and then an emptied `config:` block.
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/^[ \t]{2}class:[ \t]*$/.test(lines[i])) {
        const child = lines[i + 1];
        if (!child || /^[ \t]{0,3}\S/.test(child)) lines.splice(i, 1);
      }
    }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/^config:[ \t]*$/.test(lines[i])) {
        const child = lines[i + 1];
        if (!child || /^\S/.test(child)) lines.splice(i, 1);
      }
    }
  }
  return joinClassFrontmatter(lines.join("\n"), body);
}

/* -------------------------------------------------------------------------- */
/* Direction + node helpers                                                    */
/* -------------------------------------------------------------------------- */

const DIRECTION_RE = /^([ \t]*)direction[ \t]+(TB|TD|BT|LR|RL)[ \t]*$/m;

/** Current layout direction (`TB` default; `TD` is normalised to `TB`). */
export function getClassDirection(code: string): string {
  const m = code.match(DIRECTION_RE);
  if (!m) return "TB";
  return m[2] === "TD" ? "TB" : m[2];
}

/** Add or update the `direction` statement, placing it just under the `classDiagram` header. */
export function setClassDirection(code: string, dir: string): string {
  if (DIRECTION_RE.test(code)) {
    return code.replace(DIRECTION_RE, `$1direction ${dir}`);
  }
  return code.replace(/((?:^|\n)[ \t]*classDiagram\b[^\n]*)/, `$1\n    direction ${dir}`);
}

/** Pick the next free `UntitledClass` / `UntitledClassN` id given the existing classes. */
export function getNextClassName(code: string): string {
  const base = "UntitledClass";
  const names = new Set<string>();
  const re = /(?:^|\n)[ \t]*class[ \t]+([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) names.add(m[1]);
  if (!names.has(base)) return base;
  let i = 1;
  while (names.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

/* -------------------------------------------------------------------------- */
/* Class parsing + serialization (two-way binding for the Property Panel)      */
/* -------------------------------------------------------------------------- */

export interface ParsedClass {
  name: string;
  annotation: string; // inner text only, e.g. "interface" (no `<<>>`)
  attributes: string[]; // member lines WITHOUT parentheses, e.g. "+String name"
  methods: string[]; // member lines WITH parentheses, e.g. "+makeSound() void"
}

const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripAnnotationDelims = (s: string) => s.trim().replace(/^<</, "").replace(/>>$/, "").trim();

/** Extract the class name from a Mermaid class-node SVG id (e.g. `…-classId-Animal-6` → `Animal`). */
export function classNameFromSvgId(svgId: string | null | undefined): string | null {
  if (!svgId) return null;
  const m = svgId.match(/classId-(.+)-\d+$/);
  return m ? m[1] : null;
}

/**
 * Read a class definition from the code by name, gathering members from BOTH the brace form
 * (`class Foo { ... }`) and the colon form (`Foo : +member`), plus any annotation declared
 * inline, in a separate `<<x>> Foo` line, or nested inside the braces.
 */
export function parseClassByName(code: string, name: string): ParsedClass {
  const result: ParsedClass = { name, annotation: "", attributes: [], methods: [] };
  const esc = escapeForRegex(name);

  const classify = (member: string) => {
    const t = member.trim();
    if (!t) return;
    if (/^<<.+>>$/.test(t)) {
      result.annotation = stripAnnotationDelims(t);
      return;
    }
    if (t.includes("(")) result.methods.push(t);
    else result.attributes.push(t);
  };

  // 1. Brace block: `class Foo { ...body... }`
  const braceRe = new RegExp(
    `(?:^|\\n)[ \\t]*class[ \\t]+${esc}\\b[^\\n{]*\\{([\\s\\S]*?)\\}`,
    "m",
  );
  const bm = code.match(braceRe);
  if (bm) bm[1].split("\n").forEach(classify);

  // 2. Colon form: `Foo : +member`
  const colonRe = new RegExp(`^[ \\t]*${esc}[ \\t]*:[ \\t]*(.+)$`, "gm");
  let cm: RegExpExecArray | null;
  while ((cm = colonRe.exec(code))) classify(cm[1]);

  // 3. Separate annotation line: `<<x>> Foo`
  if (!result.annotation) {
    const sepRe = new RegExp(`^[ \\t]*<<(.+?)>>[ \\t]+${esc}[ \\t]*$`, "m");
    const sm = code.match(sepRe);
    if (sm) result.annotation = sm[1].trim();
  }

  return result;
}

export interface ClassEdits {
  annotation?: string;
  attributes?: string[];
  methods?: string[];
  newName?: string;
}

/**
 * Apply Property-Panel edits to a class, re-serialising it into the canonical brace form and
 * removing now-redundant colon-form member lines / separate annotation lines for that class.
 * Renames are propagated to relationship lines via a whole-word replacement.
 */
export function applyClassEdits(code: string, name: string, edits: ClassEdits): string {
  const esc = escapeForRegex(name);
  const targetName = (edits.newName ?? name).trim() || name;

  const existing = parseClassByName(code, name);
  const annotation =
    edits.annotation !== undefined ? stripAnnotationDelims(edits.annotation) : existing.annotation;
  const attributes = (edits.attributes ?? existing.attributes).map((a) => a.trim()).filter(Boolean);
  const methods = (edits.methods ?? existing.methods).map((m) => m.trim()).filter(Boolean);

  const buildBlock = (indent: string) => {
    const body: string[] = [];
    if (annotation) body.push(`${indent}    <<${annotation}>>`);
    attributes.forEach((a) => body.push(`${indent}    ${a}`));
    methods.forEach((m) => body.push(`${indent}    ${m}`));
    return `${indent}class ${targetName} {${body.length ? "\n" + body.join("\n") + "\n" + indent : ""}}`;
  };

  let result = code;
  let replaced = false;

  // Replace an existing brace block (preserving the indentation of the `class` keyword).
  const braceRe = new RegExp(`(^|\\n)([ \\t]*)class[ \\t]+${esc}\\b[^\\n{]*\\{[\\s\\S]*?\\}`, "m");
  if (braceRe.test(result)) {
    result = result.replace(braceRe, (_m, pre, indent) => `${pre}${buildBlock(indent)}`);
    replaced = true;
  } else {
    // Replace a bare `class Foo` declaration (no braces).
    const declRe = new RegExp(`(^|\\n)([ \\t]*)class[ \\t]+${esc}\\b[^\\n]*`, "m");
    if (declRe.test(result)) {
      result = result.replace(declRe, (_m, pre, indent) => `${pre}${buildBlock(indent)}`);
      replaced = true;
    }
  }

  // Drop colon-form members and a separate annotation line for this class (now in the block).
  result = result.replace(new RegExp(`(?:^|\\n)[ \\t]*${esc}[ \\t]*:[ \\t]*[^\\n]*`, "g"), "");
  result = result.replace(
    new RegExp(`(?:^|\\n)[ \\t]*<<[^>]+>>[ \\t]+${esc}[ \\t]*(?=\\n|$)`, "g"),
    "",
  );

  // Class was only referenced (e.g. via a relationship) and never declared — append a block.
  if (!replaced) result = result.replace(/\s*$/, "") + `\n${buildBlock("    ")}`;

  // Propagate a rename to the remaining references (relationships, `note for`, cardinality lines).
  // The regenerated block already carries the new name, so a whole-word swap only touches the rest.
  if (targetName !== name) {
    result = result.replace(new RegExp(`\\b${esc}\\b`, "g"), targetName);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Relationships + note linking (drag-to-connect)                              */
/* -------------------------------------------------------------------------- */

/**
 * The eight UML class relationship types Mermaid supports, with their operators. `source op target`
 * is emitted verbatim, so the picker icon should read left-to-right with the dragged-from class as
 * the source. Ordered most-common-first.
 */
export const CLASS_RELATIONSHIP_TYPES: Array<{ key: string; label: string; operator: string }> = [
  { key: "association", label: "Association", operator: "-->" },
  { key: "inheritance", label: "Inheritance", operator: "<|--" },
  { key: "composition", label: "Composition", operator: "*--" },
  { key: "aggregation", label: "Aggregation", operator: "o--" },
  { key: "dependency", label: "Dependency", operator: "..>" },
  { key: "realization", label: "Realization", operator: "..|>" },
  { key: "link", label: "Link (solid)", operator: "--" },
  { key: "dashed", label: "Link (dashed)", operator: ".." },
];

/** Append a class body line (after trimming trailing whitespace) — the toolbar's add pattern. */
function appendClassBodyLine(code: string, line: string): string {
  return code.replace(/\s*$/, "") + `\n${line}`;
}

/**
 * Append a relationship `source <operator> target` (with an optional ` : label`) to the diagram.
 * Both classes may be implicit — Mermaid auto-creates any class referenced only in a relationship.
 */
export function addClassRelationship(
  code: string,
  source: string,
  target: string,
  operator: string,
  label?: string,
): string {
  const labelPart = label && label.trim() ? ` : ${label.trim()}` : "";
  return appendClassBodyLine(code, `    ${source} ${operator} ${target}${labelPart}`);
}

/** Create a new (empty) class and immediately relate the source to it. Returns the new code. */
export function addClassWithRelationship(
  code: string,
  source: string,
  newName: string,
  operator: string,
): string {
  const withClass = appendClassBodyLine(code, `    class ${newName} {\n    }`);
  return appendClassBodyLine(withClass, `    ${source} ${operator} ${newName}`);
}

/** Append a class-scoped note (`note for <ClassName> "text"`) for the given class. */
export function appendClassNoteForClass(code: string, className: string, text: string): string {
  const escaped = text.replace(/"/g, '\\"');
  return appendClassBodyLine(code, `    note for ${className} "${escaped}"`);
}

/**
 * Re-target the `noteIndex`-th note (source order) so it is attached to `className`
 * (`note "x"` → `note for ClassName "x"`). The quoted text is preserved verbatim. Returns the code
 * unchanged when the index is out of range.
 */
export function setClassNoteTarget(code: string, noteIndex: number, className: string): string {
  const notes = getClassNotes(code);
  const target = notes[noteIndex];
  if (!target) return code;
  const lines = code.split("\n");
  lines[target.lineIndex] = lines[target.lineIndex].replace(
    CLASS_NOTE_RE,
    (_m, head: string, body: string, tail: string) => {
      const indent = head.match(/^\s*/)?.[0] ?? "";
      return `${indent}note for ${className} "${body}"${tail}`;
    },
  );
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Relationship editing (operator + cardinality) — for the edge toolbar        */
/* -------------------------------------------------------------------------- */

/**
 * A class-relationship operator decomposes into an end marker on each side plus a line style.
 * Re-composing `leftToken(source) + line + rightToken(target)` reproduces every Mermaid relation
 * operator (the eight presets are just particular {sourceMarker, lineStyle, targetMarker} tuples),
 * so the edge toolbar can mutate either end / the line independently and stay perfectly faithful.
 */
export type ClassEndMarker = "none" | "arrow" | "triangle" | "diamondFilled" | "diamondHollow";
export type ClassLineStyle = "solid" | "dashed";

/** End-marker metadata: the token Mermaid uses at the LEFT (source) and RIGHT (target) end. */
export const CLASS_END_MARKERS: Array<{
  key: ClassEndMarker;
  label: string;
  left: string;
  right: string;
}> = [
  { key: "none", label: "None", left: "", right: "" },
  { key: "arrow", label: "Arrow", left: "<", right: ">" },
  { key: "triangle", label: "Triangle", left: "<|", right: "|>" },
  { key: "diamondFilled", label: "Filled diamond", left: "*", right: "*" },
  { key: "diamondHollow", label: "Hollow diamond", left: "o", right: "o" },
];

export interface ClassRelationshipParts {
  sourceMarker: ClassEndMarker;
  lineStyle: ClassLineStyle;
  targetMarker: ClassEndMarker;
}

const LEFT_TOKEN_TO_MARKER: Array<[string, ClassEndMarker]> = [
  ["<|", "triangle"],
  ["<", "arrow"],
  ["*", "diamondFilled"],
  ["o", "diamondHollow"],
];
const RIGHT_TOKEN_TO_MARKER: Array<[string, ClassEndMarker]> = [
  ["|>", "triangle"],
  [">", "arrow"],
  ["*", "diamondFilled"],
  ["o", "diamondHollow"],
];

/** Decompose a relationship operator string (e.g. `<|--`, `..>`, `*--*`) into its parts. */
export function parseClassRelationshipOperator(operator: string): ClassRelationshipParts {
  const op = operator.trim();
  const lineStyle: ClassLineStyle = op.includes("..") ? "dashed" : "solid";
  const lineToken = lineStyle === "dashed" ? ".." : "--";
  const lineAt = op.indexOf(lineToken);
  const leftRaw = lineAt >= 0 ? op.slice(0, lineAt) : "";
  const rightRaw = lineAt >= 0 ? op.slice(lineAt + lineToken.length) : "";
  const sourceMarker = LEFT_TOKEN_TO_MARKER.find(([t]) => t === leftRaw)?.[1] ?? "none";
  const targetMarker = RIGHT_TOKEN_TO_MARKER.find(([t]) => t === rightRaw)?.[1] ?? "none";
  return { sourceMarker, lineStyle, targetMarker };
}

/** Re-compose an operator string from its parts. */
export function buildClassRelationshipOperator(parts: ClassRelationshipParts): string {
  const left = CLASS_END_MARKERS.find((m) => m.key === parts.sourceMarker)?.left ?? "";
  const right = CLASS_END_MARKERS.find((m) => m.key === parts.targetMarker)?.right ?? "";
  const line = parts.lineStyle === "dashed" ? ".." : "--";
  return `${left}${line}${right}`;
}

/**
 * Relationship-line grammar (after stripping indent):
 *   `Source ["srcCard"] <operator> ["tgtCard"] Target [: label]`
 * The operator is a maximal run of relation characters; identifiers never contain them, so the
 * regex naturally rejects `class …`, `note …` and colon-form member lines.
 */
const CLASS_REL_LINE_RE =
  /^([ \t]*)([A-Za-z0-9_~$]+)[ \t]+(?:"([^"]*)"[ \t]+)?([<>|o*.\-]+)[ \t]+(?:"([^"]*)"[ \t]+)?([A-Za-z0-9_~$]+)[ \t]*(?::[ \t]*(.*))?$/;

const CLASS_REL_KEYWORDS =
  /^(?:class|note|namespace|direction|click|callback|link|style|cssClass)\b/;

export interface ParsedClassRelationship {
  lineIndex: number;
  source: string;
  target: string;
  operator: string;
  sourceCard: string; // "" when absent
  targetCard: string; // "" when absent
  label: string; // "" when absent
  occurrence: number; // GLOBAL 1-based index among ALL relationship lines (matches Mermaid's edge id)
}

/** Parse a single line as a relationship, or return `null`. */
function parseClassRelationshipLine(
  line: string,
): Omit<ParsedClassRelationship, "lineIndex" | "occurrence"> | null {
  const trimmed = line.trim();
  if (!trimmed || CLASS_REL_KEYWORDS.test(trimmed)) return null;
  const m = line.match(CLASS_REL_LINE_RE);
  if (!m) return null;
  const operator = m[4];
  // Require the operator to actually contain a line token (-- or ..); a bare `<` etc. is not valid.
  if (!operator.includes("--") && !operator.includes("..")) return null;
  return {
    source: m[2],
    sourceCard: m[3] ?? "",
    operator,
    targetCard: m[5] ?? "",
    target: m[6],
    label: (m[7] ?? "").trim(),
  };
}

/**
 * All relationship lines in source order, each tagged with its GLOBAL 1-based occurrence index.
 *
 * Mermaid renders every class relationship edge with `data-id="id_<Src>_<Dst>_<N>"` where `N` is a
 * GLOBAL counter that increments once per relationship across the WHOLE diagram (NOT per
 * source/target pair). e.g. `A <--> B`, `A <|-- C`, `A -- D` → `…_1`, `…_2`, `…_3`. We mirror that
 * here so `classRelationshipFromEdgeDataId` can resolve any edge (the earlier per-pair counter only
 * matched the first edge of each distinct pair, leaving the rest unselectable).
 */
export function getClassRelationships(code: string): ParsedClassRelationship[] {
  const out: ParsedClassRelationship[] = [];
  let counter = 0;
  code.split("\n").forEach((line, i) => {
    const parsed = parseClassRelationshipLine(line);
    if (!parsed) return;
    counter += 1;
    out.push({ lineIndex: i, occurrence: counter, ...parsed });
  });
  return out;
}

/**
 * Resolve a Mermaid class-edge `data-id` (`id_<Src>_<Dst>_<N>`) to its relationship by computing
 * each relationship's expected id and matching — this avoids ambiguous `_` splitting when class
 * names themselves contain underscores.
 */
export function classRelationshipFromEdgeDataId(
  code: string,
  dataId: string | null | undefined,
): ParsedClassRelationship | null {
  if (!dataId) return null;
  const rels = getClassRelationships(code);
  return rels.find((r) => `id_${r.source}_${r.target}_${r.occurrence}` === dataId) ?? null;
}

/** Build the canonical relationship line text (no indent) from its parts. */
function buildClassRelationshipLine(
  indent: string,
  r: {
    source: string;
    sourceCard: string;
    operator: string;
    targetCard: string;
    target: string;
    label: string;
  },
): string {
  const src = r.sourceCard ? `${r.source} "${r.sourceCard}"` : r.source;
  const tgt = r.targetCard ? `"${r.targetCard}" ${r.target}` : r.target;
  const label = r.label ? ` : ${r.label}` : "";
  return `${indent}${src} ${r.operator} ${tgt}${label}`;
}

/** Locate the relationship matching (source, target, occurrence) and return its line index, or -1. */
function findClassRelationshipLineIndex(
  code: string,
  source: string,
  target: string,
  occurrence: number,
): number {
  const rel = getClassRelationships(code).find(
    (r) => r.source === source && r.target === target && r.occurrence === occurrence,
  );
  return rel ? rel.lineIndex : -1;
}

/** Rewrite the matched relationship's operator in place, preserving cardinality + label. */
export function updateClassRelationshipOperator(
  code: string,
  source: string,
  target: string,
  occurrence: number,
  newOperator: string,
): string {
  const lines = code.split("\n");
  const idx = findClassRelationshipLineIndex(code, source, target, occurrence);
  if (idx < 0) return code;
  const parsed = parseClassRelationshipLine(lines[idx]);
  if (!parsed) return code;
  const indent = lines[idx].match(/^[ \t]*/)?.[0] ?? "    ";
  lines[idx] = buildClassRelationshipLine(indent, { ...parsed, operator: newOperator });
  return lines.join("\n");
}

/**
 * Set the source/target cardinality of the matched relationship (empty string removes that end's
 * cardinality). Operator and label are preserved.
 */
export function setClassRelationshipCardinality(
  code: string,
  source: string,
  target: string,
  occurrence: number,
  sourceCard: string,
  targetCard: string,
): string {
  const lines = code.split("\n");
  const idx = findClassRelationshipLineIndex(code, source, target, occurrence);
  if (idx < 0) return code;
  const parsed = parseClassRelationshipLine(lines[idx]);
  if (!parsed) return code;
  const indent = lines[idx].match(/^[ \t]*/)?.[0] ?? "    ";
  lines[idx] = buildClassRelationshipLine(indent, {
    ...parsed,
    sourceCard: sourceCard.trim(),
    targetCard: targetCard.trim(),
  });
  return lines.join("\n");
}

/** Set the matched relationship's `: label` (empty string removes it). Operator + cardinality kept. */
export function setClassRelationshipLabel(
  code: string,
  source: string,
  target: string,
  occurrence: number,
  label: string,
): string {
  const lines = code.split("\n");
  const idx = findClassRelationshipLineIndex(code, source, target, occurrence);
  if (idx < 0) return code;
  const parsed = parseClassRelationshipLine(lines[idx]);
  if (!parsed) return code;
  const indent = lines[idx].match(/^[ \t]*/)?.[0] ?? "    ";
  lines[idx] = buildClassRelationshipLine(indent, { ...parsed, label: label.trim() });
  return lines.join("\n");
}

/** Remove the matched relationship line entirely. Returns the code unchanged when not found. */
export function deleteClassRelationship(
  code: string,
  source: string,
  target: string,
  occurrence: number,
): string {
  const idx = findClassRelationshipLineIndex(code, source, target, occurrence);
  if (idx < 0) return code;
  const lines = code.split("\n");
  lines.splice(idx, 1);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                     */
/* -------------------------------------------------------------------------- */

const DIRECTION_OPTIONS = [
  { id: "TB", label: "Top to bottom", icon: <ArrowDown className="w-4 h-4" /> },
  { id: "BT", label: "Bottom to top", icon: <ArrowUp className="w-4 h-4" /> },
  { id: "LR", label: "Left to right", icon: <ArrowRight className="w-4 h-4" /> },
  { id: "RL", label: "Right to left", icon: <ArrowLeft className="w-4 h-4" /> },
];

const ClassDiagramToolbar = ({ code, setCode }: EditorContext) => {
  const currentDirection = getClassDirection(code);
  const hideEmpty = getHideEmptyMembersBox(code);
  const hasTitle = !!getClassTitle(code).trim();

  const handleAddClass = () => {
    const name = getNextClassName(code);
    const block = `    class ${name} {\n    }`;
    setCode(code.replace(/\s*$/, "") + `\n${block}`);
  };

  // Title is a toggle: ON inserts a default title, OFF removes the frontmatter `title:`.
  const handleToggleTitle = () => {
    setCode(hasTitle ? removeClassTitle(code) : upsertClassTitle(code, "Diagram Title"));
  };

  const handleAddNote = () => {
    setCode(code.replace(/\s*$/, "") + `\n    note "This is a sample note"`);
  };

  return (
    <>
      {/* Hide-empty-members toggle — identical inline label + switch styling to the sequence
          diagram's Auto Number toggle, placed in front of the Class button. */}
      <div className="flex items-center gap-2 px-2 h-8 select-none">
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground whitespace-nowrap">
          Hide Empty Members
        </span>
        <button
          type="button"
          onClick={() => setCode(setHideEmptyMembersBox(code, !hideEmpty))}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            hideEmpty ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
          }`}
          aria-label="Toggle hide empty members box"
          aria-pressed={hideEmpty}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
              hideEmpty ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Title toggle — same inline label + switch styling as Hide Empty Members. */}
      <div className="flex items-center gap-2 px-2 h-8 select-none">
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground whitespace-nowrap">
          Title
        </span>
        <button
          type="button"
          onClick={handleToggleTitle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            hasTitle ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
          }`}
          aria-label="Toggle diagram title"
          aria-pressed={hasTitle}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
              hasTitle ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="h-5 w-px bg-border" />

      <div className="flex items-center gap-1 rounded-xl bg-background p-0 border-none">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={handleAddClass}
          title="Add a class node"
        >
          <Box className="w-4 h-4" />
          <span className="text-sm font-medium">Class</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          onClick={handleAddNote}
          title="Add a floating note"
        >
          <StickyNote className="w-4 h-4" />
          <span className="text-sm font-medium">Note</span>
        </Button>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Layout direction — mirrors the flowchart direction control. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
            />
          }
        >
          <ChevronsDown className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-1"
          sideOffset={10}
          align="start"
        >
          <div className="flex flex-col">
            {DIRECTION_OPTIONS.map((d) => (
              <DropdownMenuItem
                key={d.id}
                onClick={() => setCode(setClassDirection(code, d.id))}
                className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-accent"
              >
                {d.icon}
                <span className="flex-1 text-sm font-medium">{d.label}</span>
                {currentDirection === d.id && <Check className="w-4 h-4 text-indigo-500" />}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export const ClassDiagramPlugin: DiagramPlugin = {
  id: "classDiagram",
  label: "Class Diagram",
  defaultCode: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }`,
  ToolbarComponent: ClassDiagramToolbar,
};
