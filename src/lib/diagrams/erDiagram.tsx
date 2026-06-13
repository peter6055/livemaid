/**
 * ER Diagram (Entity-Relationship) plugin — modular, self-contained.
 *
 * Everything ER-diagram-specific lives in this file so the feature is a drop-in plugin per the
 * project's Composition / Plugin Architecture (see reference/ARCHITECTURE.md §6). The only wiring
 * outside this file is the registry entry in `registry.ts`, the Dashboard create-dialog type
 * picker, and the EditorCanvas / LiveMaidEditor canvas-interaction hooks.
 *
 * NOTE: this module intentionally omits the `"use client"` directive (mirroring `flowchart.tsx`
 * and `classDiagram.tsx`). The registry is imported by the server-side `POST /api/diagrams` route
 * to read `defaultCode`; marking the module `"use client"` turns its exports into client references
 * whose `.defaultCode` is `undefined` server-side, which would persist a new diagram with empty
 * code. The toolbar is still only ever rendered inside the client `LiveMaidEditor`. Do NOT import
 * client-only hooks (`useState`) or hook-using `@/components/ui/*` dialogs at the module top.
 *
 * Mermaid ER-diagram syntax reference (verified against mermaid 11.15 docs):
 *  - header:        `erDiagram`
 *  - entity block:  `ENTITY { type name [PK|FK|UK[, ...]] ["comment"] }` (attributes inside braces)
 *  - bare entity:   `ENTITY` (renders an empty box, relationship-less)
 *  - relationship:  `<first> <leftCard><line><rightCard> <second> : <label>`
 *  - cardinality:   left/right crow's-foot markers — `|o`/`o|` (zero-or-one), `||` (exactly one),
 *                   `}o`/`o{` (zero-or-more), `}|`/`|{` (one-or-more). Each marker is 2 chars.
 *  - line token:    `--` identifying (solid) / `..` non-identifying (dashed). So a full operator
 *                   is always 6 chars, e.g. `||--o{`, `}o..o{`.
 *  - alias:         `id[Alias]` or `id["Alias with space"]`
 *  - direction:     statement line `direction TB|BT|LR|RL` inside the body
 *  - styling:       `style id fill:#..,stroke:#..,stroke-width:..px` ; `classDef` ; `id:::class`
 */

import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table2, Workflow, ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Check, Type } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Low-level token helpers                                                     */
/* -------------------------------------------------------------------------- */

const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strip Mermaid `:::className` class-shorthand from a string (for clean entity-ref parsing). */
function stripErClassShorthand(s: string): string {
  return s.replace(/:::[A-Za-z0-9_,-]+/g, "");
}

// A cardinality marker is exactly two characters; we accept every marker variant on BOTH ends
// (Mermaid is lenient about which side a marker appears on, e.g. `o{--||` is valid).
const ER_CARD = "(?:\\|o|o\\||\\|\\||}o|o\\{|}\\||\\|\\{)";
const ER_LINE_TOKEN = "(?:--|\\.\\.)";
/** Full relationship operator (left-card + line + right-card), e.g. `||--o{`. Always 6 chars. */
export const ER_REL_OP = `${ER_CARD}${ER_LINE_TOKEN}${ER_CARD}`;
const ER_REL_OP_RE = new RegExp(ER_REL_OP);

/**
 * Resolve the canonical entity id from a raw operand. Strips a trailing `:::class` shorthand,
 * resolves the `id[Alias]` alias form to its id, and unquotes a `"Quoted Name"`.
 */
export function canonicalEntityId(raw: string): string {
  const s = stripErClassShorthand(raw.trim()).trim();
  const aliasMatch = s.match(/^([^[\s"]+)\s*\[/); // id[Alias] / id["Alias"]
  if (aliasMatch) return aliasMatch[1];
  const quotedMatch = s.match(/^"([^"]*)"/); // "Quoted Name"
  if (quotedMatch) return quotedMatch[1];
  const bareMatch = s.match(/^([^\s{[]+)/); // bare token up to space / brace / bracket
  return bareMatch ? bareMatch[1] : s;
}

/* -------------------------------------------------------------------------- */
/* Frontmatter (diagram title)                                                 */
/* -------------------------------------------------------------------------- */

/** Split the leading YAML frontmatter (between the first pair of `---`) from the body. */
export function splitErFrontmatter(code: string): { fm: string | null; body: string } {
  const m = code.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (m) return { fm: m[1], body: code.slice(m[0].length) };
  return { fm: null, body: code };
}

/** Re-join a (possibly empty) frontmatter block with the body. Drops the block when empty. */
function joinErFrontmatter(fmBody: string, body: string): string {
  const trimmed = fmBody.replace(/\s+$/, "");
  if (!trimmed) return body;
  return `---\n${trimmed}\n---\n${body}`;
}

/** Read the current frontmatter `title:` value, or "" if none. */
export function getErTitle(code: string): string {
  const { fm } = splitErFrontmatter(code);
  if (!fm) return "";
  const m = fm.match(/^title:[ \t]*(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

/**
 * Insert/replace the frontmatter `title:`. The title is always placed AFTER any `config:` block so
 * the config-anchored global helpers (theme/font in utils.ts) keep matching `^---\nconfig:`.
 */
export function upsertErTitle(code: string, title: string): string {
  const { fm, body } = splitErFrontmatter(code);
  const lines = fm ? fm.split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => /^title:[ \t]*/.test(l));
  if (idx >= 0) lines[idx] = `title: ${title}`;
  else lines.push(`title: ${title}`);
  return joinErFrontmatter(lines.join("\n"), body);
}

/** Remove the frontmatter `title:` line (and the frontmatter block if it becomes empty). */
export function removeErTitle(code: string): string {
  const { fm, body } = splitErFrontmatter(code);
  if (!fm) return code;
  const lines = fm.split(/\r?\n/).filter((l) => !/^title:[ \t]*/.test(l));
  return joinErFrontmatter(lines.join("\n"), body);
}

/* -------------------------------------------------------------------------- */
/* Direction                                                                   */
/* -------------------------------------------------------------------------- */

const ER_DIRECTION_RE = /^([ \t]*)direction[ \t]+(TB|TD|BT|LR|RL)[ \t]*$/m;

/** Current layout direction (`TB` default; `TD` is normalised to `TB`). */
export function getErDirection(code: string): string {
  const m = code.match(ER_DIRECTION_RE);
  if (!m) return "TB";
  return m[2] === "TD" ? "TB" : m[2];
}

/** Add or update the `direction` statement, placing it just under the `erDiagram` header. */
export function setErDirection(code: string, dir: string): string {
  if (ER_DIRECTION_RE.test(code)) {
    return code.replace(ER_DIRECTION_RE, `$1direction ${dir}`);
  }
  return code.replace(/((?:^|\n)[ \t]*erDiagram\b[^\n]*)/, `$1\n    direction ${dir}`);
}

/* -------------------------------------------------------------------------- */
/* Entity discovery + naming                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Gather every entity id referenced in the diagram, in first-appearance order. Entities can be
 * declared via a `{ }` attribute block, as a bare standalone line, or implicitly inside a
 * relationship statement (`A ||--o{ B : x` auto-creates both `A` and `B`).
 */
export function getErEntityNames(code: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => {
    const id = n.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      names.push(id);
    }
  };

  let started = false;
  let depth = 0;
  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (!started) {
      if (/^erDiagram\b/.test(line)) started = true;
      continue;
    }
    // Inside an entity attribute block: skip the body, just balance the braces.
    if (depth > 0) {
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
      if (depth < 0) depth = 0;
      continue;
    }
    if (!line || line.startsWith("%%")) continue;
    if (/^(direction|style|classDef|class)\b/.test(line)) continue;

    const clean = stripErClassShorthand(line);
    const rel = clean.match(ER_REL_OP_RE);
    if (rel && rel.index !== undefined) {
      // A relationship statement is always single-line and never opens an attribute block. Its
      // cardinality markers contain literal `{`/`}` characters (e.g. `o{`, `|{`), so we must NOT
      // feed this line into the brace-depth counter — doing so would falsely "enter a block".
      const before = clean.slice(0, rel.index);
      const after = clean.slice(rel.index + rel[0].length).replace(/\s*:(?!:).*$/, "");
      add(canonicalEntityId(before));
      add(canonicalEntityId(after));
    } else {
      // An entity declaration: a bare line, or a block opener whose `{` increments the depth so
      // the attribute body is skipped until the matching `}`.
      add(canonicalEntityId(line));
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
      if (depth < 0) depth = 0;
    }
  }
  return names;
}

/** Pick the next free `Untitled-Entity` / `Untitled-Entity-N` id given the existing entities. */
export function getNextEntityName(code: string): string {
  const base = "Untitled-Entity";
  const names = new Set(getErEntityNames(code));
  if (!names.has(base)) return base;
  let i = 1;
  while (names.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/* -------------------------------------------------------------------------- */
/* Entity parsing + serialization (two-way binding for the Property Panel)     */
/* -------------------------------------------------------------------------- */

export interface ParsedEntity {
  name: string;
  alias: string; // display alias from `id[Alias]`, or "" when none
  attributes: string[]; // raw attribute lines, e.g. `string registrationNumber PK`
}

/**
 * Build a regex that matches an entity block opener for `name`. Captures: g1 = indent,
 * g2 = the optional `[Alias]` segment (with brackets), g3 = the optional `:::class` shorthand.
 * The opener may or may not include the `{` on the same line.
 */
function entityHeaderRe(name: string): RegExp {
  const esc = escapeForRegex(name);
  return new RegExp(
    `^([ \\t]*)${esc}[ \\t]*(\\[[^\\]]*\\])?[ \\t]*(:::[A-Za-z0-9_,-]+)?[ \\t]*\\{`,
  );
}

/** Read the (display) alias for an entity, e.g. `p[Person]` → `Person`. "" when none. */
export function getEntityAlias(code: string, name: string): string {
  const esc = escapeForRegex(name);
  const m = code.match(new RegExp(`(?:^|\\n)[ \\t]*${esc}[ \\t]*\\[([^\\]]*)\\]`));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Read an entity definition by name: its display alias plus the raw attribute lines found inside
 * its `{ }` block. Returns empty attributes for a bare (block-less) or undeclared entity.
 */
export function parseEntityByName(code: string, name: string): ParsedEntity {
  const result: ParsedEntity = { name, alias: getEntityAlias(code, name), attributes: [] };
  const lines = code.split("\n");
  const headerRe = entityHeaderRe(name);
  const startIdx = lines.findIndex((l) => headerRe.test(l));
  if (startIdx < 0) return result;

  // Single-line `ENTITY { ... }` (rare) — extract between the braces on this line.
  const sameLine = lines[startIdx].match(/\{(.*)\}/);
  if (sameLine) {
    sameLine[1]
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((a) => result.attributes.push(a));
    return result;
  }

  // Multi-line block: collect until the matching `}`.
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === "}" || t.startsWith("}")) break;
    if (t) result.attributes.push(t);
  }
  return result;
}

/**
 * Validate a single attribute row from the entity property panel. Returns a human-readable error
 * string when invalid, or `null` when valid. An empty / whitespace-only row is valid — it is just a
 * placeholder filtered out on commit.
 *
 * Mermaid attribute grammar (verified against the docs): `type name [keys] ["comment"]` where the
 * `type` and `name` tokens are mandatory, `{`/`}` are forbidden (block delimiters), and the `type`
 * / `name` tokens must match the character rules enforced by `validateAttributeType` /
 * `validateAttributeName` below.
 */
export function validateEntityAttribute(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/[{}]/.test(t)) return "Attributes can't contain { or } characters.";
  const { type, name } = parseAttributeParts(t);
  if (!type || !name) return "Attributes need a type and a name, e.g. string email.";
  return validateAttributeType(type) ?? validateAttributeName(name);
}

// Mermaid ER attribute grammar (verified against the docs): a `type` value must BEGIN with an
// alphabetic character and may then contain letters, digits, hyphens, underscores, parentheses and
// square brackets (NOTE: NOT commas — `decimal(10,2)` is rejected). There is NO implicit set of
// valid data types — any token matching this shape is accepted (e.g. `string`, `varchar(100)`,
// `string[]`, a custom domain type). A `name` value follows the SAME format but may additionally
// start with a single `*` (an alternative marker indicating the attribute is a primary key).
const ER_ATTR_TYPE_RE = /^[A-Za-z][A-Za-z0-9_()[\]-]*$/;
const ER_ATTR_NAME_RE = /^\*?[A-Za-z][A-Za-z0-9_()[\]-]*$/;

/**
 * Validate the Data Type field. Free text is allowed (no fixed type set), but it must follow the
 * Mermaid grammar: start with a letter, then only letters / digits / `_` / `-` / `(` / `)` / `[` /
 * `]`. Returns an error string, or `null` when valid (a blank value is a valid placeholder).
 */
export function validateAttributeType(type: string): string | null {
  const t = type.trim();
  if (!t) return null;
  if (!ER_ATTR_TYPE_RE.test(t)) {
    return "Type must start with a letter and use only letters, digits, _ - ( ) [ ].";
  }
  return null;
}

/**
 * Validate the Name field. Same grammar as the type, but a single leading `*` (primary-key marker)
 * is allowed. Returns an error string, or `null` when valid (a blank value is a valid placeholder).
 */
export function validateAttributeName(name: string): string | null {
  const n = name.trim();
  if (!n) return null;
  if (!ER_ATTR_NAME_RE.test(n)) {
    return "Name must start with a letter (or * for a primary key) and use only letters, digits, _ - ( ) [ ].";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Attribute field model (Data Type / Name / Keys / Comment)                   */
/*                                                                             */
/* The property panel edits each attribute as four structured fields instead   */
/* of one freeform string. These pure helpers convert between the Mermaid      */
/* attribute line (`type name [keys] ["comment"]`) and that field model.       */
/* -------------------------------------------------------------------------- */

/**
 * Predefined data types offered in the property-panel Data Type dropdown. Mermaid allows ANY type
 * token (e.g. `string(99)`, `varchar(100)`, `string[]`, custom domain types), so the field stays
 * editable for custom values — this list is just the quick-pick set of common ones.
 */
export const ER_DATA_TYPES: string[] = [
  "string",
  "int",
  "integer",
  "bigint",
  "smallint",
  "float",
  "double",
  "decimal",
  "boolean",
  "char",
  "varchar",
  "text",
  "date",
  "datetime",
  "timestamp",
  "time",
  "uuid",
  "json",
  "blob",
  "enum",
];

/** The three Mermaid attribute key constraints, with human-readable labels for the Keys dropdown. */
export const ER_KEY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "PK", label: "Primary Key" },
  { value: "FK", label: "Foreign Key" },
  { value: "UK", label: "Unique Key" },
];

/** A single ER attribute decomposed into its Mermaid grammar parts: `type name [keys] ["comment"]`. */
export interface ParsedAttribute {
  type: string;
  name: string;
  keys: string; // normalized, comma+space separated subset of PK/FK/UK (e.g. "PK, FK"), or ""
  comment: string; // unquoted comment text, or ""
}

/** Normalize a raw key string into the canonical ordered `PK, FK, UK` subset (deduped, uppercased). */
export function normalizeAttributeKeys(raw: string): string {
  const order = ["PK", "FK", "UK"];
  const found = raw.toUpperCase().match(/\b(?:PK|FK|UK)\b/g) ?? [];
  return [...new Set(found)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(", ");
}

/**
 * Split a raw attribute line into its `{ type, name, keys, comment }` parts (the inverse of
 * `serializeAttributeParts`). Lenient for in-progress editing: missing parts come back as "".
 * Grammar: `type name [PK|FK|UK[, ...]] ["comment"]`.
 */
export function parseAttributeParts(raw: string): ParsedAttribute {
  const result: ParsedAttribute = { type: "", name: "", keys: "", comment: "" };
  let s = raw.trim();
  if (!s) return result;
  // 1. Trailing quoted comment.
  const cm = s.match(/\s*"((?:[^"\\]|\\.)*)"\s*$/);
  if (cm && cm.index !== undefined) {
    result.comment = cm[1].replace(/\\"/g, '"');
    s = s.slice(0, cm.index).trim();
  }
  // 2. type (first token) + name (second token) + trailing keys (the rest).
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens[0]) result.type = tokens[0];
  if (tokens[1]) result.name = tokens[1];
  if (tokens.length > 2) result.keys = normalizeAttributeKeys(tokens.slice(2).join(" "));
  return result;
}

/** Re-join attribute parts into a Mermaid attribute line (the inverse of `parseAttributeParts`). */
export function serializeAttributeParts(a: ParsedAttribute): string {
  const type = a.type.trim();
  const name = a.name.trim();
  // A row with neither a type nor a name is a blank placeholder (filtered out on commit).
  if (!type && !name) return "";
  const keys = normalizeAttributeKeys(a.keys);
  const comment = a.comment.trim();
  let s = [type, name].filter(Boolean).join(" ");
  if (keys) s += ` ${keys}`;
  if (comment) s += ` "${comment.replace(/"/g, '\\"')}"`;
  return s;
}

export interface EntityEdits {
  alias?: string;
  attributes?: string[];
  newName?: string;
}

/** Re-serialise an entity's attribute block into canonical multi-line form at the given indent. */
function buildEntityBlock(
  name: string,
  alias: string,
  attributes: string[],
  indent: string,
): string {
  const head = alias ? `${name}[${alias}]` : name;
  const body = attributes
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => `${indent}    ${a}`);
  return `${indent}${head} {${body.length ? "\n" + body.join("\n") + "\n" + indent : ""}}`;
}

/**
 * Apply property-panel edits to an entity, re-serialising it into the canonical brace form. Renames
 * are propagated to relationship lines and `style`/`class` references via a whole-word replacement.
 */
export function applyEntityEdits(code: string, name: string, edits: EntityEdits): string {
  const esc = escapeForRegex(name);
  const targetName = (edits.newName ?? name).trim() || name;
  const existing = parseEntityByName(code, name);
  const alias = edits.alias !== undefined ? edits.alias.trim() : existing.alias;
  const attributes = (edits.attributes ?? existing.attributes).map((a) => a.trim()).filter(Boolean);

  let result = code;
  let replaced = false;

  // Replace an existing multi-line OR single-line block (preserving the keyword indent).
  const blockRe = new RegExp(
    `(^|\\n)([ \\t]*)${esc}[ \\t]*(?:\\[[^\\]]*\\])?[ \\t]*(?::::[A-Za-z0-9_,-]+)?[ \\t]*\\{[\\s\\S]*?\\}`,
    "m",
  );
  if (blockRe.test(result)) {
    result = result.replace(
      blockRe,
      (_m, pre, indent) => `${pre}${buildEntityBlock(targetName, alias, attributes, indent)}`,
    );
    replaced = true;
  } else {
    // Replace a bare (block-less) declaration line.
    const bareRe = new RegExp(`(^|\\n)([ \\t]*)${esc}[ \\t]*(?:\\[[^\\]]*\\])?[ \\t]*$`, "m");
    if (bareRe.test(result)) {
      result = result.replace(
        bareRe,
        (_m, pre, indent) => `${pre}${buildEntityBlock(targetName, alias, attributes, indent)}`,
      );
      replaced = true;
    }
  }

  // Entity was only referenced (e.g. via a relationship) and never declared — append a block.
  if (!replaced) {
    result =
      result.replace(/\s*$/, "") + `\n${buildEntityBlock(targetName, alias, attributes, "    ")}`;
  }

  // Propagate a rename to the remaining references (relationships, style/class lines).
  if (targetName !== name) {
    result = result.replace(new RegExp(`\\b${esc}\\b`, "g"), targetName);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Add / duplicate / delete / rename entities                                  */
/* -------------------------------------------------------------------------- */

/** Append a body line to the diagram (after trimming trailing whitespace). */
function appendErLine(code: string, line: string): string {
  return code.replace(/\s*$/, "") + `\n${line}`;
}

/** Add a new (empty) entity block. Returns the new code; the entity id is `name` (auto if omitted). */
export function addEntity(code: string, name?: string): string {
  const entityName = name ?? getNextEntityName(code);
  return appendErLine(code, `    ${entityName} {\n    }`);
}

/**
 * Build a collision-free `<base>_Copy_<n>` name (US4): the first duplicate is `Foo_Copy_1`, the
 * next `Foo_Copy_2`, and so on. The base strips any pre-existing `_Copy_<n>` suffix so repeatedly
 * duplicating a clone does not stack suffixes.
 */
export function getEntityCopyName(code: string, name: string): string {
  const base = name.replace(/_Copy_\d+$/, "");
  const names = new Set(getErEntityNames(code));
  let i = 1;
  while (names.has(`${base}_Copy_${i}`)) i += 1;
  return `${base}_Copy_${i}`;
}

/**
 * Duplicate an entity: clone its attribute block under a collision-free `_Copy_N` name (US4) and
 * append it to the diagram. The clone carries the same attributes AND the same per-entity `style`
 * override (if any), so the copy looks identical to the original. Relationships are NOT cloned.
 */
export function duplicateEntity(code: string, name: string): string {
  const parsed = parseEntityByName(code, name);
  const copyName = getEntityCopyName(code, name);
  // The duplicate keeps the original's attributes but drops the alias (a copy gets a fresh id).
  let result = appendErLine(code, buildEntityBlock(copyName, "", parsed.attributes, "    "));
  // Carry over any custom style override so the clone is visually identical to the original.
  const style = getEntityStyle(code, name);
  if (Object.keys(style).length > 0) {
    result = setEntityStyle(result, copyName, style);
  }
  return result;
}

/**
 * Delete an entity: remove its `{ }` block (or bare declaration) AND every relationship line that
 * references it, so the diagram stays clean. Other entities and relationships are untouched.
 */
export function deleteEntity(code: string, name: string): string {
  const esc = escapeForRegex(name);
  let result = code;

  // 1. Remove the multi-line / single-line attribute block.
  result = result.replace(
    new RegExp(
      `(?:^|\\n)[ \\t]*${esc}[ \\t]*(?:\\[[^\\]]*\\])?[ \\t]*(?::::[A-Za-z0-9_,-]+)?[ \\t]*\\{[\\s\\S]*?\\}`,
      "g",
    ),
    "",
  );

  // 2. Remove relationship + bare/standalone + style/class lines that reference the entity.
  result = result
    .split("\n")
    .filter((line) => {
      const t = stripErClassShorthand(line.trim());
      if (!t) return true;
      const rel = t.match(ER_REL_OP_RE);
      if (rel && rel.index !== undefined) {
        const before = canonicalEntityId(t.slice(0, rel.index));
        const after = canonicalEntityId(
          t.slice(rel.index + rel[0].length).replace(/\s*:(?!:).*$/, ""),
        );
        return before !== name && after !== name;
      }
      // bare standalone entity line, or `style <name> ...` / `class <name> ...`
      if (new RegExp(`^(?:style|class)[ \\t]+${esc}\\b`).test(t)) return false;
      if (t === name) return false;
      return true;
    })
    .join("\n");

  return result.replace(/\n{3,}/g, "\n\n");
}

/** Find the 0-based source line that DECLARES an entity (block or bare). -1 when not found. */
export function findEntityDefinitionLine(code: string, name: string): number {
  const esc = escapeForRegex(name);
  const declRe = new RegExp(
    `^[ \\t]*${esc}[ \\t]*(?:\\[[^\\]]*\\])?[ \\t]*(?::::[A-Za-z0-9_,-]+)?[ \\t]*\\{?`,
  );
  const lines = code.split("\n");
  // Prefer a block/bare declaration; fall back to the first relationship reference.
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t || /^erDiagram\b/.test(t)) continue;
    if (declRe.test(lines[i]) && !ER_REL_OP_RE.test(stripErClassShorthand(t))) return i;
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (new RegExp(`\\b${esc}\\b`).test(stripErClassShorthand(lines[i]))) return i;
  }
  return -1;
}

/* -------------------------------------------------------------------------- */
/* Relationships                                                               */
/* -------------------------------------------------------------------------- */

export interface ErRelationship {
  lineIndex: number;
  source: string;
  target: string;
  operator: string; // 6-char operator, e.g. `||--o{`
  label: string;
}

/** Decompose a 6-char operator into its `{ left, line, right }` parts. */
export function parseErOperator(op: string): { left: string; line: string; right: string } {
  return { left: op.slice(0, 2), line: op.slice(2, 4), right: op.slice(4, 6) };
}

/** Compose an operator from its parts. */
export function buildErOperator(left: string, line: string, right: string): string {
  return `${left}${line}${right}`;
}

/** All relationship statements in source order, with absolute line indices. */
export function getErRelationships(code: string): ErRelationship[] {
  const out: ErRelationship[] = [];
  code.split("\n").forEach((rawLine, i) => {
    const t = rawLine.trim();
    if (!t || t.startsWith("%%")) return;
    const clean = stripErClassShorthand(t);
    const rel = clean.match(ER_REL_OP_RE);
    if (!rel || rel.index === undefined) return;
    const before = clean.slice(0, rel.index);
    const afterRaw = clean.slice(rel.index + rel[0].length);
    const labelMatch = afterRaw.match(/:(?!:)\s*(.*)$/);
    const after = afterRaw.replace(/\s*:(?!:).*$/, "");
    const source = canonicalEntityId(before);
    const target = canonicalEntityId(after);
    if (!source || !target) return;
    out.push({
      lineIndex: i,
      source,
      target,
      operator: rel[0],
      label: labelMatch ? labelMatch[1].trim().replace(/^["']|["']$/g, "") : "",
    });
  });
  return out;
}

/**
 * Append a relationship `source <operator> target : "label"`. Both entities may be implicit —
 * Mermaid auto-creates any entity referenced only inside a relationship. The default operator is
 * `||--||` (exactly-one to exactly-one) and the default label is an empty quoted string, matching
 * the drag-to-connect default (`ENTITY_A ||--|| ENTITY_B : ""`). NOTE: a relationship statement with
 * a second entity but NO label is a Mermaid parse error, so an empty label is always emitted as `""`.
 */
export function addErRelationship(
  code: string,
  source: string,
  target: string,
  operator = "||--||",
  label = "",
): string {
  const trimmed = label.trim();
  const labelStr = !trimmed
    ? `""`
    : /[\s"]/.test(trimmed)
      ? `"${trimmed.replace(/"/g, '\\"')}"`
      : trimmed;
  return appendErLine(code, `    ${source} ${operator} ${target} : ${labelStr}`);
}

/**
 * Create a NEW entity (auto-named, collision-free) and immediately relate it to `source`. Used by
 * drag-to-connect when the purple `+` is dropped on empty canvas. Returns the entity name and the
 * updated code so the caller can (e.g.) keep the new entity referenced. A single appended block +
 * relationship line keeps it one undo step.
 */
export function addEntityWithRelationship(
  code: string,
  source: string,
  operator = "||--||",
  label = "",
): { code: string; name: string } {
  const name = getNextEntityName(code);
  // Emit the empty entity block first, then the relationship referencing it.
  const withEntity = addEntity(code, name);
  const withRel = addErRelationship(withEntity, source, name, operator, label);
  return { code: withRel, name };
}

/** Rewrite the operator of the relationship at `lineIndex`, preserving entities + label. */
export function updateErRelationshipOperator(
  code: string,
  lineIndex: number,
  operator: string,
): string {
  const lines = code.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return code;
  lines[lineIndex] = lines[lineIndex].replace(ER_REL_OP_RE, operator);
  return lines.join("\n");
}

/** Rewrite the `: "label"` of the relationship at `lineIndex` (always emits a label). */
export function setErRelationshipLabel(code: string, lineIndex: number, label: string): string {
  const lines = code.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return code;
  const line = lines[lineIndex];
  const opMatch = line.match(ER_REL_OP_RE);
  if (!opMatch || opMatch.index === undefined) return code;
  const head = line.slice(0, opMatch.index + opMatch[0].length);
  const afterRaw = line.slice(opMatch.index + opMatch[0].length);
  // Preserve the target operand (everything up to the label colon).
  const target = afterRaw.replace(/\s*:(?!:).*$/, "").trimEnd();
  const trimmed = label.trim();
  // A relationship with a second entity but NO label is a Mermaid parse error, so an empty label
  // is emitted as `""`. Labels containing whitespace or quotes are double-quoted (escaped).
  const labelStr = !trimmed
    ? `""`
    : /[\s"]/.test(trimmed)
      ? `"${trimmed.replace(/"/g, '\\"')}"`
      : trimmed;
  lines[lineIndex] = `${head}${target} : ${labelStr}`;
  return lines.join("\n");
}

/** Delete the relationship at `lineIndex` (entities are preserved if declared/referenced elsewhere). */
export function deleteErRelationship(code: string, lineIndex: number): string {
  const lines = code.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return code;
  lines.splice(lineIndex, 1);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Edge resolution + cardinality model (the on-canvas edge toolbar)            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a Mermaid ER edge `data-id` back to its parsed relationship. Mermaid renders each
 * relationship path with `data-id="id_<srcSvgId>_<dstSvgId>_<N>"` where `N` is a GLOBAL 0-based
 * counter assigned in CODE ORDER — exactly the order of `getErRelationships`. So the trailing `_<N>`
 * indexes directly into that array (robust against dashed entity names like `LINE-ITEM`, which would
 * make parsing the embedded ids ambiguous). Returns `null` when the index is out of range.
 */
export function erRelationshipFromEdgeDataId(
  code: string,
  dataId: string | null | undefined,
): ErRelationship | null {
  if (!dataId) return null;
  const m = dataId.match(/_(\d+)$/);
  if (!m) return null;
  const idx = parseInt(m[1], 10);
  return getErRelationships(code)[idx] ?? null;
}

/**
 * The four crow's-foot cardinality markers for the SOURCE (left) entity — the marker faces the line,
 * so it reads outer→inner left-to-right (outer = max, inner = min).
 */
export const ER_SOURCE_CARDINALITIES: Array<{ value: string; label: string }> = [
  { value: "|o", label: "Zero or one" },
  { value: "||", label: "Exactly one" },
  { value: "}o", label: "Zero or more" },
  { value: "}|", label: "One or more" },
];

/** The four crow's-foot markers for the TARGET (right) entity — mirrored from the source set. */
export const ER_TARGET_CARDINALITIES: Array<{ value: string; label: string }> = [
  { value: "o|", label: "Zero or one" },
  { value: "||", label: "Exactly one" },
  { value: "o{", label: "Zero or more" },
  { value: "|{", label: "One or more" },
];

/** The two relationship line styles: identifying (solid `--`) vs non-identifying (dashed `..`). */
export const ER_LINE_STYLES: Array<{ value: string; label: string }> = [
  { value: "--", label: "Identifying" },
  { value: "..", label: "Non-identifying" },
];

/* -------------------------------------------------------------------------- */
/* Per-entity styling (US5 — granular custom styling)                          */
/* -------------------------------------------------------------------------- */

const STYLE_LINE_RE = (name: string) =>
  new RegExp(`^([ \\t]*)style[ \\t]+${escapeForRegex(name)}[ \\t]+(.*)$`, "m");

/** Parse a `style <name> k:v,k:v` line into a property map (empty when no style line exists). */
export function getEntityStyle(code: string, name: string): Record<string, string> {
  const m = code.match(STYLE_LINE_RE(name));
  if (!m) return {};
  const props: Record<string, string> = {};
  m[2].split(",").forEach((pair) => {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key) props[key] = val;
    }
  });
  return props;
}

/** Serialise a property map back into a `k:v,k:v` style argument string. */
function serializeStyleProps(props: Record<string, string>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

/**
 * Merge `patch` into the entity's `style <name> ...` line (upserting the line). Passing a property
 * value of "" removes that single property. When no properties remain the whole line is removed.
 */
export function setEntityStyle(code: string, name: string, patch: Record<string, string>): string {
  const merged = { ...getEntityStyle(code, name), ...patch };
  Object.keys(merged).forEach((k) => {
    if (merged[k] === "" || merged[k] === undefined) delete merged[k];
  });
  const without = removeEntityStyle(code, name);
  const serialized = serializeStyleProps(merged);
  if (!serialized) return without;
  return appendErLine(without, `    style ${name} ${serialized}`);
}

/** Remove the entity's `style <name> ...` line entirely (reset to the active theme). */
export function removeEntityStyle(code: string, name: string): string {
  return code
    .split("\n")
    .filter((line) => !STYLE_LINE_RE(name).test(line))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* SVG id resolution                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Extract the entity id from a Mermaid ER-entity SVG node id. Mermaid 11 renders each entity as
 * `<g class="node ..." id="entity-<Name>-<n>">`, so we strip the `entity-` prefix and the trailing
 * `-<n>` index. Greedy on the middle so dashed names (e.g. `LINE-ITEM`) survive.
 */
export function entityNameFromSvgId(svgId: string | null | undefined): string | null {
  if (!svgId) return null;
  const m = svgId.match(/entity-(.+)-\d+$/);
  return m ? m[1] : null;
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

const ErDiagramToolbar = ({ code, setCode, requestConfirm }: EditorContext) => {
  const currentDirection = getErDirection(code);
  const hasTitle = !!getErTitle(code).trim();

  const handleAddEntity = () => setCode(addEntity(code));

  // Title is a toggle (same UX as the class diagram): ON inserts a default title immediately; OFF
  // asks for confirmation first (removing the title would drop the user-entered title text). The
  // confirmation uses the injected `requestConfirm` (UI-library AlertDialog rendered by the client
  // editor) — this plugin module is imported SERVER-side by the create-diagram route to read
  // `defaultCode`, so it must NOT import client-only dialog components itself. Falls back to
  // `window.confirm`.
  const handleToggleTitle = async () => {
    if (!hasTitle) {
      setCode(upsertErTitle(code, "Diagram Title"));
      return;
    }
    const current = getErTitle(code).trim();
    const description = `Turning off the title removes it from the diagram. The current title${
      current ? ` ("${current}")` : ""
    } will be lost.`;
    const ok = requestConfirm
      ? await requestConfirm({
          title: "Remove diagram title?",
          description,
          confirmLabel: "Remove title",
          destructive: true,
        })
      : window.confirm(`Remove diagram title?\n\n${description}`);
    if (ok) setCode(removeErTitle(code));
  };

  return (
    <>
      {/* Layout direction (US6) — mirrors the flowchart / class direction control. The global
          theme + typography controls live in the shared top toolbar, so US2 theming applies here
          automatically. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-md px-2.5 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            />
          }
        >
          <Workflow className="w-4 h-4" />
          <span className="text-sm font-medium">Direction</span>
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
                onClick={() => setCode(setErDirection(code, d.id))}
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

      <div className="h-5 w-px bg-border" />

      {/* Title toggle — same inline label + pill-switch styling as the class diagram's Title
          toggle (and the sequence Auto Number toggle). The diagram title TEXT is editable by
          double-clicking it on the canvas. */}
      <div className="flex items-center gap-2 px-2 h-8 select-none">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground whitespace-nowrap">
          <Type className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          <span>Title</span>
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
          onClick={handleAddEntity}
          title="Add an entity"
        >
          <Table2 className="w-4 h-4" />
          <span className="text-sm font-medium">Entity</span>
        </Button>
      </div>
    </>
  );
};

export const ErDiagramPlugin: DiagramPlugin = {
  id: "erDiagram",
  label: "ER Diagram",
  defaultCode: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string custNumber
        string sector
    }
    ORDER ||--|{ LINE-ITEM : contains
    ORDER {
        int orderNumber
        string deliveryAddress
    }
    LINE-ITEM {
        string productCode
        int quantity
        float pricePerUnit
    }`,
  ToolbarComponent: ErDiagramToolbar,
};
