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
  Heading,
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

  const handleAddClass = () => {
    const name = getNextClassName(code);
    const block = `    class ${name} {\n    }`;
    setCode(code.replace(/\s*$/, "") + `\n${block}`);
  };

  const handleAddTitle = () => {
    if (getClassTitle(code).trim()) return; // already has a title
    setCode(upsertClassTitle(code, "Diagram Title"));
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
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${hideEmpty ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
            }`}
          aria-label="Toggle hide empty members box"
          aria-pressed={hideEmpty}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${hideEmpty ? "translate-x-[18px]" : "translate-x-0.5"
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
          onClick={handleAddTitle}
          title="Add a diagram title"
        >
          <Heading className="w-4 h-4" />
          <span className="text-sm font-medium">Title</span>
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
