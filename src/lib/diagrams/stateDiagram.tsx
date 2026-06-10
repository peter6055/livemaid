/**
 * State Diagram (stateDiagram-v2) plugin — modular, self-contained.
 *
 * Everything state-diagram-specific lives in this file so the feature is a drop-in plugin per the
 * project's Composition / Plugin Architecture (see reference/ARCHITECTURE.md §6). The only wiring
 * outside this file is the registry entry in `registry.ts`, the Dashboard create-dialog type picker,
 * and the EditorCanvas / LiveMaidEditor canvas-interaction hooks.
 *
 * NOTE: this module intentionally omits the `"use client"` directive (mirroring `flowchart.tsx`,
 * `classDiagram.tsx`, and `erDiagram.tsx`). The registry is imported by the server-side
 * `POST /api/diagrams` route to read `defaultCode`; marking the module `"use client"` turns its
 * exports into client references whose `.defaultCode` is `undefined` server-side, which would
 * persist a new diagram with empty code. The toolbar is still only ever rendered inside the client
 * `LiveMaidEditor`. Do NOT import client-only hooks (`useState`) at the module top — only the
 * pre-marked `@/components/ui/*` client components (as ER/class do) and lucide icons.
 *
 * Mermaid state-diagram syntax reference (verified against mermaid 11.15 via headless parse + real
 * render — see reference/FEATURES_AND_TRUTHS.md §22):
 *  - header:        `stateDiagram-v2`
 *  - direction:     statement line `direction TB|BT|LR|RL` (also valid inside a composite)
 *  - bare state:    `s1`
 *  - described:     `state "Display Label" as s1`  OR the colon form  `s1 : Display Label`
 *  - start / end:   `[*] --> s1` (start) and `s1 --> [*]` (end)
 *  - transition:    `s1 --> s2 : label` (the ONLY arrow is `-->`)
 *  - choice:        `state choiceId <<choice>>`
 *  - fork / join:   `state forkId <<fork>>` / `state joinId <<join>>`
 *  - composite:     `state Parent { ... }` (MUST contain >=1 child — an EMPTY composite parses but
 *                   crashes the renderer with "No such shape: roundedWithTitle")
 *  - concurrency:   a line containing only `--` inside a composite block (parallel-region divider)
 *  - note:          `note left of X : text` / `note right of X : text` (state notes are LEFT/RIGHT
 *                   ONLY — `note over` is a lexical error)
 *  - styling:       `style id fill:#..,stroke:#..,stroke-width:..px,color:#..` (valid on simple,
 *                   composite, and choice nodes) ; also `classDef` + `class`/`:::`
 *
 * Label sanitization rule: the `state "Label" as id` form does NOT accept backslash-escaped quotes
 * (`state "a \"b\"" as id` is a parse error). Embedded double-quotes are sanitized to the `#quot;`
 * HTML entity instead. Forward slashes / brackets / commas need no escaping. (The colon form
 * `id : Label` tolerates quotes natively, but we standardise on the as-form per the PRD.)
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
  Workflow,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  Check,
  Circle,
  CircleDot,
  Square,
  Diamond,
  Split,
  Merge,
  Boxes,
  StickyNote,
  Plus,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Low-level token helpers                                                     */
/* -------------------------------------------------------------------------- */

const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The only transition arrow in state diagrams. */
export const STATE_ARROW = "-->";

/** Strip a trailing `:::className` style shorthand so id parsing stays clean. */
function stripStateClassShorthand(s: string): string {
  return s.replace(/:::[A-Za-z0-9_,-]+/g, "");
}

/**
 * Sanitize a label for the `state "Label" as id` form. Mermaid 11 does NOT accept backslash-escaped
 * quotes inside the quoted string, so embedded double-quotes are converted to the `#quot;` HTML
 * entity (verified to render correctly). Newlines collapse to spaces.
 */
export function sanitizeStateLabel(label: string): string {
  return label.replace(/\r?\n/g, " ").replace(/"/g, "#quot;").trim();
}

/* -------------------------------------------------------------------------- */
/* Frontmatter (diagram title)                                                 */
/* -------------------------------------------------------------------------- */

/** Split the leading YAML frontmatter (between the first pair of `---`) from the body. */
export function splitStateFrontmatter(code: string): { fm: string | null; body: string } {
  const m = code.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (m) return { fm: m[1], body: code.slice(m[0].length) };
  return { fm: null, body: code };
}

/** Re-join a (possibly empty) frontmatter block with the body. Drops the block when empty. */
function joinStateFrontmatter(fmBody: string, body: string): string {
  const trimmed = fmBody.replace(/\s+$/, "");
  if (!trimmed) return body;
  return `---\n${trimmed}\n---\n${body}`;
}

/** Read the current frontmatter `title:` value, or "" if none. */
export function getStateTitle(code: string): string {
  const { fm } = splitStateFrontmatter(code);
  if (!fm) return "";
  const m = fm.match(/^title:[ \t]*(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

/**
 * Insert/replace the frontmatter `title:`. The title is always placed AFTER any `config:` block so
 * the config-anchored global helpers (theme/font in utils.ts) keep matching `^---\nconfig:`.
 */
export function upsertStateTitle(code: string, title: string): string {
  const { fm, body } = splitStateFrontmatter(code);
  const lines = fm ? fm.split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => /^title:[ \t]*/.test(l));
  if (idx >= 0) lines[idx] = `title: ${title}`;
  else lines.push(`title: ${title}`);
  return joinStateFrontmatter(lines.join("\n"), body);
}

/** Remove the frontmatter `title:` line (and the frontmatter block if it becomes empty). */
export function removeStateTitle(code: string): string {
  const { fm, body } = splitStateFrontmatter(code);
  if (!fm) return code;
  const lines = fm.split(/\r?\n/).filter((l) => !/^title:[ \t]*/.test(l));
  return joinStateFrontmatter(lines.join("\n"), body);
}

/* -------------------------------------------------------------------------- */
/* Direction                                                                   */
/* -------------------------------------------------------------------------- */

const STATE_DIRECTION_RE = /^([ \t]*)direction[ \t]+(TB|TD|BT|LR|RL)[ \t]*$/m;

/** Current layout direction (`TB` default; `TD` is normalised to `TB`). */
export function getStateDirection(code: string): string {
  const m = code.match(STATE_DIRECTION_RE);
  if (!m) return "TB";
  return m[2] === "TD" ? "TB" : m[2];
}

/** Add or update the top-level `direction` statement, placing it just under the header. */
export function setStateDirection(code: string, dir: string): string {
  if (STATE_DIRECTION_RE.test(code)) {
    return code.replace(STATE_DIRECTION_RE, `$1direction ${dir}`);
  }
  return code.replace(/((?:^|\n)[ \t]*stateDiagram(?:-v2)?\b[^\n]*)/, `$1\n    direction ${dir}`);
}

/* -------------------------------------------------------------------------- */
/* State discovery + naming                                                    */
/* -------------------------------------------------------------------------- */

/** Tokens that begin a non-state structural line and must never be treated as a state id. */
const STATE_STRUCTURAL_RE = /^(direction|classDef|class|style|note|end\s+note)\b/i;

/**
 * Gather every state id referenced in the diagram, in first-appearance order, across ALL nesting
 * levels (inner composite states get FLAT top-level ids in the rendered SVG, so a single flat set is
 * what we need for collision-free naming). The special `[*]` start/end pseudo-state is excluded.
 *
 * States are introduced via: a transition (`A --> B`), a described declaration
 * (`state "x" as id` / `id : x`), a choice/fork/join (`state id <<choice>>`), a composite opener
 * (`state id { ... }`), or a bare id line.
 */
export function getStateIds(code: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const id = raw.trim();
    if (!id || id === "[*]") return;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };

  let started = false;
  for (const rawLine of code.split("\n")) {
    let line = rawLine.trim();
    if (!started) {
      if (/^stateDiagram(?:-v2)?\b/.test(line)) started = true;
      continue;
    }
    if (!line || line.startsWith("%%")) continue;
    line = stripStateClassShorthand(line).trim();
    // Pure structural tokens / braces / the concurrency divider carry no state id.
    if (line === "{" || line === "}" || line === "--") continue;
    if (STATE_STRUCTURAL_RE.test(line)) continue;

    // A transition (`A --> B [: label]`) introduces both operands.
    const arrowIdx = line.indexOf(STATE_ARROW);
    if (arrowIdx >= 0) {
      const before = line.slice(0, arrowIdx).trim();
      const after = line
        .slice(arrowIdx + STATE_ARROW.length)
        .replace(/\s*:.*$/, "")
        .trim();
      add(before);
      add(after);
      continue;
    }

    // `state "Display Label" as id`
    let m = line.match(/^state\s+"(?:[^"]*)"\s+as\s+([^\s{]+)/i);
    if (m) {
      add(m[1]);
      continue;
    }
    // `state id <<choice|fork|join>>`
    m = line.match(/^state\s+([^\s{]+)\s*<<(?:choice|fork|join)>>/i);
    if (m) {
      add(m[1]);
      continue;
    }
    // `state id {` (composite opener) or bare `state id`
    m = line.match(/^state\s+([^\s{]+)/i);
    if (m) {
      add(m[1].replace(/\{$/, ""));
      continue;
    }
    // Colon-form described state `id : description` (no arrow on this line).
    m = line.match(/^([^\s:]+)\s*:/);
    if (m) {
      add(m[1]);
      continue;
    }
    // Bare id line.
    if (/^[A-Za-z0-9_-]+$/.test(line)) add(line);
  }
  return ids;
}

/**
 * Pick the next free `<prefix>_<n>` id (1-based) that does not collide with any existing state id.
 * Used for the toolbox's algorithmic ids: `state_1`, `choice_1`, `fork_1`, `join_1`, `parent_1`, …
 */
export function getNextStateId(code: string, prefix: string): string {
  const ids = new Set(getStateIds(code));
  let i = 1;
  while (ids.has(`${prefix}_${i}`)) i += 1;
  return `${prefix}_${i}`;
}

/* -------------------------------------------------------------------------- */
/* Creation (the shape toolbox)                                                */
/* -------------------------------------------------------------------------- */

/** Append a body line to the diagram (after trimming trailing whitespace). */
function appendStateLine(code: string, line: string): string {
  return code.replace(/\s*$/, "") + `\n${line}`;
}

/** Add a described state `state "State Name" as state_N`. Returns the new code. */
export function addState(code: string, id?: string): string {
  const sid = id ?? getNextStateId(code, "state");
  return appendStateLine(code, `    state "State Name" as ${sid}`);
}

/** Add a start transition `[*] --> state_N` (creates `state_N` as a first state). */
export function addStartTransition(code: string): string {
  const sid = getNextStateId(code, "state");
  return appendStateLine(code, `    [*] --> ${sid}`);
}

/** Add an end transition `state_N --> [*]` (creates `state_N` flowing to the terminal). */
export function addEndTransition(code: string): string {
  const sid = getNextStateId(code, "state");
  return appendStateLine(code, `    ${sid} --> [*]`);
}

/** Add a choice (conditional-branch) node `state choice_N <<choice>>`. */
export function addChoice(code: string): string {
  return appendStateLine(code, `    state ${getNextStateId(code, "choice")} <<choice>>`);
}

/** Add a fork bar `state fork_N <<fork>>`. */
export function addFork(code: string): string {
  return appendStateLine(code, `    state ${getNextStateId(code, "fork")} <<fork>>`);
}

/** Add a join bar `state join_N <<join>>`. */
export function addJoin(code: string): string {
  return appendStateLine(code, `    state ${getNextStateId(code, "join")} <<join>>`);
}

/**
 * Add a composite (nested) container `state parent_N { [*] --> inner_N }`. The seeded `[*] --> inner`
 * child is REQUIRED: an empty composite parses but crashes Mermaid's renderer
 * ("No such shape: roundedWithTitle").
 */
export function addComposite(code: string): string {
  const pid = getNextStateId(code, "parent");
  const inner = getNextStateId(code, "inner");
  return appendStateLine(code, `    state ${pid} {\n        [*] --> ${inner}\n    }`);
}

/**
 * Add an annotation note to a state. State-diagram notes support LEFT and RIGHT only (`note over` is
 * a lexical error). For the toolbox (no explicit target), the note attaches to the first existing
 * state id; if the diagram has no states yet, a `state_N` is created first so the note has a target.
 */
export function addNote(
  code: string,
  position: "left" | "right" = "right",
  stateId?: string,
): string {
  let working = code;
  let target = stateId;
  if (!target) {
    const ids = getStateIds(working);
    if (ids.length > 0) {
      target = ids[0];
    } else {
      target = getNextStateId(working, "state");
      working = appendStateLine(working, `    state "State Name" as ${target}`);
    }
  }
  return appendStateLine(working, `    note ${position} of ${target} : Add Text`);
}

/* -------------------------------------------------------------------------- */
/* SVG id resolution                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Extract the state id from a Mermaid state-node SVG id. Mermaid 11 renders each state (including
 * choice/fork/join, and composites) as `<g id="<renderId>-state-<Name>-<idx>">`, so we strip the
 * `…-state-` prefix and the trailing `-<idx>`. Greedy on the middle so dashed names survive. Returns
 * `null` for the `[*]` pseudo-states (`root_start` / `root_end` / `<Composite>_start`).
 */
export function stateNameFromSvgId(svgId: string | null | undefined): string | null {
  if (!svgId) return null;
  const m = svgId.match(/-state-(.+)-\d+$/);
  if (!m) return null;
  const name = m[1];
  if (name === "root_start" || name === "root_end" || /_start$/.test(name)) return null;
  return name;
}

/** Strip a `:::class` shorthand + surrounding whitespace from a transition operand → bare id (or `[*]`). */
function canonicalStateOperand(raw: string): string {
  return stripStateClassShorthand(raw).trim();
}

/* -------------------------------------------------------------------------- */
/* Labels (inline rename — Story 3)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Read a state's current display label. Resolves the `state "Label" as id` form (un-sanitising the
 * `#quot;` entity back to `"`) and the colon form `id : Label`. Returns "" when the state has no
 * explicit description (its display is just the id).
 */
export function getStateLabel(code: string, id: string): string {
  const esc = escapeForRegex(id);
  const asM = code.match(
    new RegExp(`^[ \\t]*state[ \\t]+"([^"]*)"[ \\t]+as[ \\t]+${esc}[ \\t]*$`, "m"),
  );
  if (asM) return asM[1].replace(/#quot;/g, '"').trim();
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (t.includes(STATE_ARROW) || /^state\b/.test(t) || /^note\b/i.test(t)) continue;
    const cm = t.match(new RegExp(`^${esc}[ \\t]*:[ \\t]*(.*)$`));
    if (cm) return cm[1].trim();
  }
  return "";
}

/**
 * Set (or clear) a state's display label using the COLON form `id : Label`. The colon form is used
 * uniformly (regular states AND composites) because it natively tolerates quotes / commas / slashes
 * without escaping (the `state "..." as id` form rejects backslash-escaped quotes), which is exactly
 * what the escape-character QA test requires. An existing description line (either form) is rewritten
 * in place, preserving indentation; an empty label collapses the state back to its bare id. When the
 * state has no description line yet, one is appended.
 */
export function setStateLabel(code: string, id: string, label: string): string {
  const esc = escapeForRegex(id);
  const lines = code.split("\n");
  const text = label.replace(/\r?\n/g, " ").trim();
  const asRe = new RegExp(`^([ \\t]*)state[ \\t]+"[^"]*"[ \\t]+as[ \\t]+${esc}[ \\t]*$`);
  const colonRe = new RegExp(`^([ \\t]*)${esc}[ \\t]*:`);

  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    const asM = lines[i].match(asRe);
    const colonM =
      !t.includes(STATE_ARROW) && !/^state\b/.test(t) && !/^note\b/i.test(t)
        ? lines[i].match(colonRe)
        : null;
    if (asM || colonM) {
      const indent = (asM ?? colonM)![1];
      lines[i] = text ? `${indent}${id} : ${text}` : `${indent}${id}`;
      return lines.join("\n");
    }
  }
  if (!text) return code;
  return appendStateLine(code, `    ${id} : ${text}`);
}

/** Whether `id` is declared as a composite container (`state id { ... }`) somewhere in the code. */
export function isCompositeState(code: string, id: string): boolean {
  const esc = escapeForRegex(id);
  return new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*\\{`, "m").test(code);
}

/** Whether `id` is a shape-only special node (choice / fork / join) — these have no editable label. */
export function isSpecialStateNode(code: string, id: string): boolean {
  const esc = escapeForRegex(id);
  return new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*<<(?:choice|fork|join)>>`, "mi").test(code);
}

/* -------------------------------------------------------------------------- */
/* Per-node styling (Story 7 — color / fill / border customizer)               */
/* -------------------------------------------------------------------------- */

// A `style <id> k:v,k:v` override line. `style <id> fill:#..,stroke:#..,stroke-width:..px,color:#..`
// is VERIFIED valid on simple, composite, AND choice/fork/join nodes (mermaid 11.15 — see §22), so a
// per-node override matches the PRD directly with no `classDef` fallback needed.
const STATE_STYLE_LINE_RE = (id: string) =>
  new RegExp(`^([ \\t]*)style[ \\t]+${escapeForRegex(id)}[ \\t]+(.*)$`, "m");

/** Parse a state's `style <id> k:v,k:v` line into a property map (empty when no style line exists). */
export function getStateStyle(code: string, id: string): Record<string, string> {
  const m = code.match(STATE_STYLE_LINE_RE(id));
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

/** Serialise a property map back into a `k:v,k:v` style-argument string. */
function serializeStateStyleProps(props: Record<string, string>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

/**
 * Merge `patch` into the state's `style <id> ...` line (upserting the line). Passing a property value
 * of "" removes that single property; when no properties remain the whole line is removed. The style
 * override is localised to this id and never leaks to other nodes (mirrors the ER style customizer).
 */
export function setStateStyle(code: string, id: string, patch: Record<string, string>): string {
  const merged = { ...getStateStyle(code, id), ...patch };
  Object.keys(merged).forEach((k) => {
    if (merged[k] === "" || merged[k] === undefined) delete merged[k];
  });
  const without = removeStateStyle(code, id);
  const serialized = serializeStateStyleProps(merged);
  if (!serialized) return without;
  return appendStateLine(without, `    style ${id} ${serialized}`);
}

/** Remove the state's `style <id> ...` line entirely (revert to the active theme). */
export function removeStateStyle(code: string, id: string): string {
  return code
    .split("\n")
    .filter((line) => !STATE_STYLE_LINE_RE(id).test(line))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Notes (Story 5/7 — annotations; state notes are LEFT/RIGHT only)            */
/* -------------------------------------------------------------------------- */

// Single-line note: `note left|right of <Target> : <text>`. (Multi-line `note ... end note` blocks
// are rendered but not inline-editable; the toolbox/toolbar always emits the single-line form.)
const STATE_NOTE_RE = /^([ \t]*)note[ \t]+(left|right)[ \t]+of[ \t]+(\S+)[ \t]*:[ \t]*(.*)$/i;

export interface StateNote {
  lineIndex: number;
  position: "left" | "right";
  target: string;
  text: string;
}

/** All single-line `note left|right of X : text` annotations, in source order. */
export function getStateNotes(code: string): StateNote[] {
  const out: StateNote[] = [];
  code.split("\n").forEach((line, i) => {
    const m = line.match(STATE_NOTE_RE);
    if (m) {
      out.push({
        lineIndex: i,
        position: m[2].toLowerCase() as "left" | "right",
        target: m[3],
        text: m[4].trim(),
      });
    }
  });
  return out;
}

/** Rewrite the text of the `noteIndex`-th note (source order); position + target preserved. */
export function updateStateNoteByIndex(code: string, noteIndex: number, text: string): string {
  const notes = getStateNotes(code);
  const n = notes[noteIndex];
  if (!n) return code;
  const lines = code.split("\n");
  const m = lines[n.lineIndex].match(STATE_NOTE_RE);
  if (!m) return code;
  const safe = text.replace(/\r?\n/g, " ").trim();
  lines[n.lineIndex] = `${m[1]}note ${n.position} of ${n.target} : ${safe}`;
  return lines.join("\n");
}

/** Flip the `noteIndex`-th note to a new side (left/right). Text + target preserved (Story 5). */
export function setStateNotePosition(
  code: string,
  noteIndex: number,
  position: "left" | "right",
): string {
  const notes = getStateNotes(code);
  const n = notes[noteIndex];
  if (!n) return code;
  const lines = code.split("\n");
  const m = lines[n.lineIndex].match(STATE_NOTE_RE);
  if (!m) return code;
  lines[n.lineIndex] = `${m[1]}note ${position} of ${n.target} : ${n.text}`;
  return lines.join("\n");
}

/** Append a note to a specific state (used by the floating toolbar's quick-annotation, Story 7). */
export function addNoteForState(
  code: string,
  stateId: string,
  position: "left" | "right" = "right",
  text = "Add Text",
): string {
  return appendStateLine(code, `    note ${position} of ${stateId} : ${text}`);
}

/** Delete the `noteIndex`-th note (source order). */
export function deleteStateNoteByIndex(code: string, noteIndex: number): string {
  const notes = getStateNotes(code);
  const n = notes[noteIndex];
  if (!n) return code;
  const lines = code.split("\n");
  lines.splice(n.lineIndex, 1);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Deletion with cascade cleanup (Story 4)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Delete a state and run a cascade cleanup: remove the state's declaration (described / choice-fork-
 * join / bare / composite `{ }` block), EVERY transition referencing it (as source or target,
 * including `[*] --> id` / `id --> [*]`), every note targeting it, and any `style`/`class` lines
 * referencing it. Leaves no orphaned transitions or annotations (the "clean sub-graph cascading" QA
 * requirement). Composite blocks are removed brace-depth-aware so the whole nested body goes with it.
 */
export function deleteStateById(code: string, id: string): string {
  const esc = escapeForRegex(id);
  const lines = code.split("\n");
  const remove = new Set<number>();

  // 1. Composite block `state id { ... }` — remove the whole brace-balanced body.
  const compRe = new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*\\{`);
  for (let i = 0; i < lines.length; i += 1) {
    if (!compRe.test(lines[i])) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j += 1) {
      depth += (lines[j].match(/\{/g)?.length ?? 0) - (lines[j].match(/\}/g)?.length ?? 0);
      remove.add(j);
      if (j > i && depth <= 0) break;
      if (j === i && depth <= 0) break; // single-line `state id { ... }`
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (remove.has(i)) continue;
    const t = stripStateClassShorthand(lines[i].trim());
    if (!t) continue;

    // Transition referencing the state (either endpoint).
    const arrowIdx = t.indexOf(STATE_ARROW);
    if (arrowIdx >= 0) {
      const before = canonicalStateOperand(t.slice(0, arrowIdx));
      const after = canonicalStateOperand(
        t.slice(arrowIdx + STATE_ARROW.length).replace(/\s*:.*$/, ""),
      );
      if (before === id || after === id) remove.add(i);
      continue;
    }
    // Note targeting the state.
    const noteM = t.match(/^note[ \t]+(?:left|right)[ \t]+of[ \t]+(\S+)[ \t]*:/i);
    if (noteM) {
      if (noteM[1] === id) remove.add(i);
      continue;
    }
    // Declarations of the state.
    if (new RegExp(`^state[ \\t]+"[^"]*"[ \\t]+as[ \\t]+${esc}[ \\t]*$`).test(t)) remove.add(i);
    else if (new RegExp(`^state[ \\t]+${esc}[ \\t]*<<`).test(t)) remove.add(i);
    else if (new RegExp(`^state[ \\t]+${esc}[ \\t]*$`).test(t)) remove.add(i);
    else if (new RegExp(`^${esc}[ \\t]*:`).test(t)) remove.add(i);
    else if (t === id) remove.add(i);
    // Per-state `style id ...` override.
    else if (new RegExp(`^style[ \\t]+${esc}\\b`).test(t)) remove.add(i);
  }

  // `class <a,b,c> styleName` lines: drop the deleted id from the comma list; remove the whole line
  // only when it becomes empty. (classDef definitions are left untouched.)
  const result = lines
    .filter((_, i) => !remove.has(i))
    .map((line) => {
      const m = line.match(/^([ \t]*)class[ \t]+([^\n]+?)[ \t]+([A-Za-z0-9_-]+)[ \t]*$/);
      if (!m) return line;
      const targets = m[2]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== id);
      if (targets.length === 0) return null; // whole line removed below
      return `${m[1]}class ${targets.join(", ")} ${m[3]}`;
    })
    .filter((l): l is string => l !== null)
    .join("\n");

  // Repair any composite emptied or concurrency region left dangling by the cascade (both crash the
  // renderer) — the same auto-collapse rule the move helpers use.
  return collapseEmptyComposites(result.replace(/\n{3,}/g, "\n\n"));
}

/* -------------------------------------------------------------------------- */
/* Composite nesting (Story 6 — "Move into composite" menu + concurrency `--`) */
/* -------------------------------------------------------------------------- */

export interface StateComposite {
  name: string;
  startLine: number; // 0-based line of the `state Name {` opener
  endLine: number; // 0-based line of the matching `}`
}

/**
 * Parse every composite `state Name { ... }` block — nested composites included — by scanning forward
 * from each opener and tracking brace depth (the same technique `deleteStateById` uses). State
 * diagrams only ever brace composite blocks, so depth tracking is unambiguous. Results are returned
 * in source order; a nested composite appears as its own independent entry.
 */
export function getStateComposites(code: string): StateComposite[] {
  const lines = code.split("\n");
  const out: StateComposite[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^[ \t]*state[ \t]+([^\s{]+)[ \t]*\{/);
    if (!m) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j += 1) {
      depth += (lines[j].match(/\{/g)?.length ?? 0) - (lines[j].match(/\}/g)?.length ?? 0);
      if (depth <= 0) {
        out.push({ name: m[1], startLine: i, endLine: j });
        break;
      }
    }
  }
  return out;
}

/** All composite container names in source order. */
export function getCompositeNames(code: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of getStateComposites(code)) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      out.push(c.name);
    }
  }
  return out;
}

/**
 * The name of the composite that DIRECTLY contains `id`'s declaration (the innermost one), or `null`
 * when the state sits at the root scope. Resolved from the state's declaration line so a state that
 * only appears inside a composite via a seeded child still reports its parent.
 */
export function getStateParentComposite(code: string, id: string): string | null {
  const declLine = findStateDefinitionLine(code, id);
  if (declLine < 0) return null;
  const containing = getStateComposites(code)
    .filter((c) => declLine > c.startLine && declLine < c.endLine)
    .sort((a, b) => b.startLine - a.startLine); // innermost first
  return containing.length ? containing[0].name : null;
}

/** Re-base a captured block of lines onto `baseIndent` (preserving relative indentation). */
function reindentStateBlock(blockLines: string[], baseIndent: string): string[] {
  const indents = blockLines
    .filter((l) => l.trim())
    .map((l) => l.match(/^[ \t]*/)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return blockLines.map((l) => (l.trim() ? baseIndent + l.slice(min) : l));
}

/**
 * Remove a state's OWN declaration line(s) from the code — its described / choice-fork-join / bare /
 * colon-form line, OR (when `id` is itself a composite) its whole brace-balanced block. Transitions,
 * notes, and `style` lines that REFERENCE the state are left untouched (they resolve it by bare name
 * across composite boundaries — verified). Returns the stripped code plus the captured declaration
 * lines (raw, with their original indentation), or `null` decl when the state had no standalone
 * declaration (it only appears inside transitions).
 */
function removeStateOwnDeclaration(
  code: string,
  id: string,
): { code: string; decl: string[] | null } {
  const esc = escapeForRegex(id);
  const lines = code.split("\n");
  const remove = new Set<number>();
  const captured: string[] = [];

  // Composite block `state id { ... }` — capture + remove the whole brace-balanced body.
  const compRe = new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*\\{`);
  for (let i = 0; i < lines.length; i += 1) {
    if (!compRe.test(lines[i])) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j += 1) {
      depth += (lines[j].match(/\{/g)?.length ?? 0) - (lines[j].match(/\}/g)?.length ?? 0);
      remove.add(j);
      captured.push(lines[j]);
      if (depth <= 0) break;
    }
    break;
  }

  if (captured.length === 0) {
    // Single-line declarations (described / special / bare / colon form).
    const declRes = [
      new RegExp(`^[ \\t]*state[ \\t]+"[^"]*"[ \\t]+as[ \\t]+${esc}[ \\t]*$`),
      new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*<<(?:choice|fork|join)>>[ \\t]*$`, "i"),
      new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*$`),
      new RegExp(`^[ \\t]*${esc}[ \\t]*:`),
      new RegExp(`^[ \\t]*${esc}[ \\t]*$`),
    ];
    for (let i = 0; i < lines.length; i += 1) {
      const t = lines[i].trim();
      if (t.includes(STATE_ARROW) || /^note\b/i.test(t) || /^style\b/i.test(t)) continue;
      if (declRes.some((re) => re.test(lines[i]))) {
        remove.add(i);
        captured.push(lines[i]);
        break; // a state has at most one standalone declaration line
      }
    }
  }

  const stripped = lines.filter((_, i) => !remove.has(i)).join("\n");
  return { code: stripped, decl: captured.length ? captured : null };
}

/** True when a composite's body has no renderable content (only blanks / comments / `--` / direction). */
function isCompositeBodyEmpty(code: string, c: StateComposite): boolean {
  const lines = code.split("\n");
  for (let i = c.startLine + 1; i < c.endLine; i += 1) {
    const t = lines[i].trim();
    if (!t || t.startsWith("%%") || t === "--" || t === "{" || t === "}") continue;
    if (/^direction\b/i.test(t)) continue;
    return false;
  }
  return true;
}

/**
 * Locate one direct-level concurrency divider (`--`) that borders an EMPTY parallel region, returning
 * its line index (or -1). A `--` with renderable content on only ONE side CRASHES the renderer ("No
 * such shape: divider"), so any move/delete that empties a region must drop the now-dangling divider.
 * Only DIRECT-level dividers of each composite are considered (a nested composite's own `--` belongs
 * to it); nested blocks count as content for the region that holds them.
 */
function findDanglingDividerLine(code: string): number {
  const lines = code.split("\n");
  for (const c of getStateComposites(code)) {
    const dividerIdx: number[] = [];
    const segmentHasContent: boolean[] = [];
    let depth = 0;
    let hasContent = false;
    for (let i = c.startLine + 1; i < c.endLine; i += 1) {
      const t = lines[i].trim();
      if (depth === 0 && t === "--") {
        segmentHasContent.push(hasContent);
        dividerIdx.push(i);
        hasContent = false;
        continue;
      }
      if (depth > 0) {
        hasContent = true; // inside a nested block → content for the current region
      } else if (t && !t.startsWith("%%") && t !== "{" && t !== "}" && !/^direction\b/i.test(t)) {
        hasContent = true;
      }
      depth += (t.match(/\{/g)?.length ?? 0) - (t.match(/\}/g)?.length ?? 0);
      if (depth < 0) depth = 0;
    }
    segmentHasContent.push(hasContent);
    if (dividerIdx.length === 0) continue;
    const emptySeg = segmentHasContent.findIndex((has) => !has);
    if (emptySeg < 0) continue;
    // Drop the divider that borders the empty region (the one after it, else the one before it).
    return emptySeg < dividerIdx.length ? dividerIdx[emptySeg] : dividerIdx[emptySeg - 1];
  }
  return -1;
}

/**
 * Collapse every composite a mutation may have emptied AND prune any concurrency divider left bordering
 * an empty region. An EMPTY composite `state P { }` PARSES but CRASHES the renderer ("No such shape:
 * roundedWithTitle"), and a `--` with content on only one side CRASHES too ("No such shape: divider"),
 * so — exactly like the ER/namespace empty-container rule — any move/delete must repair both. Runs to a
 * fixpoint so a dangling divider is pruned, then an emptied inner composite collapses before its parent.
 */
export function collapseEmptyComposites(code: string): string {
  let result = code;
  for (;;) {
    const danglingDivider = findDanglingDividerLine(result);
    if (danglingDivider >= 0) {
      const lines = result.split("\n");
      lines.splice(danglingDivider, 1);
      result = lines.join("\n");
      continue;
    }
    const empty = getStateComposites(result).find((c) => isCompositeBodyEmpty(result, c));
    if (!empty) break;
    const lines = result.split("\n");
    lines.splice(empty.startLine, empty.endLine - empty.startLine + 1);
    result = lines.join("\n");
  }
  return result.replace(/\n{3,}/g, "\n\n");
}

/**
 * Relocate a state INTO a composite, OUT to the root scope (`target = null`), or BETWEEN composites.
 * Only the state's own declaration moves; its transitions / notes / styles stay put (they reference it
 * by bare name, which resolves across composite boundaries). A state that had no standalone
 * declaration is re-declared as a bare `id` line at the destination. Any composite emptied by the move
 * is auto-collapsed (mermaid forbids empty composites).
 */
export function moveStateIntoComposite(code: string, id: string, target: string | null): string {
  if (isCompositeState(code, target ?? "") && target === id) return code; // can't nest into self
  const { code: without, decl } = removeStateOwnDeclaration(code, id);

  if (target === null) {
    const block = decl ? reindentStateBlock(decl, "    ") : [`    ${id}`];
    return collapseEmptyComposites(appendStateLine(without, block.join("\n")));
  }

  const comp = getStateComposites(without).find((c) => c.name === target);
  if (!comp) return code; // unknown / vanished target — no-op
  const lines = without.split("\n");
  const baseIndent = (lines[comp.startLine].match(/^[ \t]*/)?.[0] ?? "") + "    ";
  const block = decl ? reindentStateBlock(decl, baseIndent) : [`${baseIndent}${id}`];
  lines.splice(comp.endLine, 0, ...block);
  return collapseEmptyComposites(lines.join("\n"));
}

/** Create a brand-new composite and immediately move the given state into it ("Create new" menu item). */
export function moveStateToNewComposite(code: string, id: string): string {
  const pid = getNextStateId(code, "parent");
  const { code: without, decl } = removeStateOwnDeclaration(code, id);
  const inner = decl ? reindentStateBlock(decl, "        ") : [`        ${id}`];
  const block = [`    state ${pid} {`, ...inner, `    }`].join("\n");
  return collapseEmptyComposites(appendStateLine(without, block));
}

/**
 * Insert a concurrency divider (`--`) inside a composite, opening a new parallel region. A `--` with
 * content on only ONE side CRASHES the renderer ("No such shape: divider" — verified), so the new
 * region is seeded with a fresh `[*] --> inner_N` child (mirroring `addComposite`'s seed rule).
 */
export function addConcurrencyDivider(code: string, compositeId: string): string {
  const comp = getStateComposites(code).find((c) => c.name === compositeId);
  if (!comp) return code;
  const lines = code.split("\n");
  const baseIndent = (lines[comp.startLine].match(/^[ \t]*/)?.[0] ?? "") + "    ";
  const inner = getNextStateId(code, "inner");
  lines.splice(comp.endLine, 0, `${baseIndent}--`, `${baseIndent}[*] --> ${inner}`);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Source-line resolution (canvas → code highlight)                            */
/* -------------------------------------------------------------------------- */

/** Find the 0-based source line that best identifies a state (declaration, else first reference). -1 if none. */
export function findStateDefinitionLine(code: string, id: string): number {
  const esc = escapeForRegex(id);
  const lines = code.split("\n");
  const declRes = [
    new RegExp(`^[ \\t]*state[ \\t]+"[^"]*"[ \\t]+as[ \\t]+${esc}[ \\t]*$`),
    new RegExp(`^[ \\t]*state[ \\t]+${esc}[ \\t]*(?:<<|\\{|$)`),
    new RegExp(`^[ \\t]*${esc}[ \\t]*:`),
    new RegExp(`^[ \\t]*${esc}[ \\t]*$`), // bare standalone id line (its own declaration)
  ];
  for (let i = 0; i < lines.length; i += 1) {
    if (declRes.some((re) => re.test(lines[i]))) return i;
  }
  const tokenRe = new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`);
  for (let i = 0; i < lines.length; i += 1) {
    const t = stripStateClassShorthand(lines[i]);
    if (tokenRe.test(t)) return i;
  }
  return -1;
}

/* -------------------------------------------------------------------------- */
/* Transitions (edges)                                                         */
/* -------------------------------------------------------------------------- */

export interface StateTransition {
  lineIndex: number;
  source: string; // `[*]` for a start/terminal endpoint
  target: string;
  label: string;
}

interface StateEdgeOrderEntry {
  kind: "transition" | "note";
  lineIndex: number;
  source: string;
  target: string;
  label: string;
}

/**
 * The ordered list of every edge-producing line in code order — transitions AND notes. Mermaid 11
 * assigns each rendered transition the `data-id="edge<N>"` where N is the index of that edge among
 * ALL edge-producing lines (a `note left|right of X` line draws a connector and therefore CONSUMES
 * an index too — verified). So indexing this list by N maps a clicked transition straight back to
 * its source line, robustly across dashed names and parallel edges (each parallel `A --> B` gets a
 * distinct N). Notes occupy a slot but are not selectable transitions.
 */
function getStateEdgeOrder(code: string): StateEdgeOrderEntry[] {
  const out: StateEdgeOrderEntry[] = [];
  let inFrontmatter = false;
  code.split("\n").forEach((line, i) => {
    const t = stripStateClassShorthand(line.trim());
    if (t === "---") {
      inFrontmatter = !inFrontmatter;
      return;
    }
    if (inFrontmatter || !t || t.startsWith("%%")) return;
    if (/^note[ \t]+(?:left|right)[ \t]+of\b/i.test(t)) {
      out.push({ kind: "note", lineIndex: i, source: "", target: "", label: "" });
      return;
    }
    const arrowIdx = t.indexOf(STATE_ARROW);
    if (arrowIdx >= 0) {
      const source = canonicalStateOperand(t.slice(0, arrowIdx));
      const afterRaw = t.slice(arrowIdx + STATE_ARROW.length);
      const labelM = afterRaw.match(/:(.*)$/);
      const target = canonicalStateOperand(afterRaw.replace(/\s*:.*$/, ""));
      out.push({
        kind: "transition",
        lineIndex: i,
        source,
        target,
        label: labelM ? labelM[1].trim() : "",
      });
    }
  });
  return out;
}

/** Every transition statement in source order, with absolute line indices. */
export function getStateTransitions(code: string): StateTransition[] {
  return getStateEdgeOrder(code)
    .filter((e) => e.kind === "transition")
    .map((e) => ({ lineIndex: e.lineIndex, source: e.source, target: e.target, label: e.label }));
}

/**
 * Resolve a Mermaid transition `data-id` (`edge<N>`) back to its parsed transition. Note-edges use a
 * different id shape (`<src>-<src>----note-<N>`) and are intentionally NOT matched here.
 */
export function stateTransitionFromEdgeDataId(
  code: string,
  dataId: string | null | undefined,
): StateTransition | null {
  if (!dataId) return null;
  const m = dataId.match(/^edge(\d+)$/);
  if (!m) return null;
  const entry = getStateEdgeOrder(code)[parseInt(m[1], 10)];
  if (!entry || entry.kind !== "transition") return null;
  return {
    lineIndex: entry.lineIndex,
    source: entry.source,
    target: entry.target,
    label: entry.label,
  };
}

/** Append a transition `source --> target [: label]`. */
export function addTransition(code: string, source: string, target: string, label = ""): string {
  const lbl = label.replace(/\r?\n/g, " ").trim();
  return appendStateLine(
    code,
    lbl ? `    ${source} --> ${target} : ${lbl}` : `    ${source} --> ${target}`,
  );
}

/**
 * Create a NEW (auto-named) state and immediately transition to it from `source`. Used by drag-to-
 * connect when the purple `+` is dropped on empty canvas. Returns the new id + updated code.
 */
export function addStateWithTransition(code: string, source: string): { code: string; id: string } {
  const id = getNextStateId(code, "state");
  return { code: appendStateLine(code, `    ${source} --> ${id}`), id };
}

/** Rewrite the `: label` of the transition at `lineIndex` (empty label clears it). Indent preserved. */
export function setStateTransitionLabel(code: string, lineIndex: number, label: string): string {
  const lines = code.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return code;
  const line = lines[lineIndex];
  const arrowIdx = line.indexOf(STATE_ARROW);
  if (arrowIdx < 0) return code;
  const head = line.slice(0, arrowIdx + STATE_ARROW.length);
  const afterRaw = line.slice(arrowIdx + STATE_ARROW.length);
  const target = afterRaw.replace(/\s*:.*$/, "").trimEnd();
  const lbl = label.replace(/\r?\n/g, " ").trim();
  lines[lineIndex] = lbl ? `${head}${target} : ${lbl}` : `${head}${target}`;
  return lines.join("\n");
}

/** Delete the transition at `lineIndex` (the connected states are preserved). */
export function deleteStateTransition(code: string, lineIndex: number): string {
  const lines = code.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return code;
  lines.splice(lineIndex, 1);
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

const StateDiagramToolbar = ({ code, setCode, requestConfirm }: EditorContext) => {
  const currentDirection = getStateDirection(code);
  const hasTitle = !!getStateTitle(code).trim();

  // The shape toolbox (Story 2) — each button drops the correct semantic UML node with an
  // algorithmic id and the baseline syntax. Mirrors the ER "Entity" button chrome.
  const toolboxItems: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    run: () => void;
  }> = [
    {
      key: "state",
      label: "State",
      icon: <Square className="w-4 h-4" />,
      run: () => setCode(addState(code)),
    },
    {
      key: "start",
      label: "Start",
      icon: <Circle className="w-4 h-4" />,
      run: () => setCode(addStartTransition(code)),
    },
    {
      key: "end",
      label: "End",
      icon: <CircleDot className="w-4 h-4" />,
      run: () => setCode(addEndTransition(code)),
    },
    {
      key: "choice",
      label: "Choice",
      icon: <Diamond className="w-4 h-4" />,
      run: () => setCode(addChoice(code)),
    },
    {
      key: "fork",
      label: "Fork",
      icon: <Split className="w-4 h-4" />,
      run: () => setCode(addFork(code)),
    },
    {
      key: "join",
      label: "Join",
      icon: <Merge className="w-4 h-4" />,
      run: () => setCode(addJoin(code)),
    },
    {
      key: "composite",
      label: "Composite",
      icon: <Boxes className="w-4 h-4" />,
      run: () => setCode(addComposite(code)),
    },
    {
      key: "note",
      label: "Note",
      icon: <StickyNote className="w-4 h-4" />,
      run: () => setCode(addNote(code)),
    },
  ];

  // Title is a toggle (same UX as the class/ER diagrams): ON inserts a default title immediately;
  // OFF asks for confirmation first (removing the title would drop the user-entered title text). The
  // confirmation uses the injected `requestConfirm` (UI-library AlertDialog rendered by the client
  // editor) — this plugin module is imported SERVER-side by the create route, so it must NOT import
  // client-only dialog components itself. Falls back to `window.confirm`.
  const handleToggleTitle = async () => {
    if (!hasTitle) {
      setCode(upsertStateTitle(code, "Diagram Title"));
      return;
    }
    const current = getStateTitle(code).trim();
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
    if (ok) setCode(removeStateTitle(code));
  };

  return (
    <>
      {/* Layout direction (US8) — mirrors the flowchart / class / ER direction control. The global
          theme + typography controls live in the shared top toolbar, so theming applies here
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
                onClick={() => setCode(setStateDirection(code, d.id))}
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

      {/* Title toggle — same inline label + pill-switch styling as the class/ER Title toggle. The
          diagram title TEXT is editable by double-clicking it on the canvas. */}
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

      {/* Shape toolbox (Story 2) — collapsed into a single "Shape" palette so the toolbar stays
          compact (mirrors the flowchart Shape dropdown). Each tile drops the correct semantic UML
          node via the existing add* helpers. */}
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
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Shape</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 p-3 bg-background border-border rounded-xl"
          sideOffset={10}
          align="start"
        >
          <div className="grid grid-cols-4 gap-2">
            {toolboxItems.map((item) => (
              <DropdownMenuItem
                key={item.key}
                onClick={item.run}
                title={`Add ${item.label.toLowerCase()}`}
                className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background p-1 text-foreground hover:border-indigo-400 hover:bg-accent cursor-pointer focus:bg-accent"
              >
                {item.icon}
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export const StateDiagramPlugin: DiagramPlugin = {
  id: "stateDiagram",
  label: "State Diagram",
  defaultCode: `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`,
  ToolbarComponent: StateDiagramToolbar,
};
