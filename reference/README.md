# Reference Documentation Index

This folder is the source of truth for LiveMaid's architecture, design, and implemented
features. Read the relevant document before planning or implementing changes.

| Document                                                                       | Purpose                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)                                         | High-level system architecture, tech stack, and conventions.                          |
| [`DESIGN.md`](./DESIGN.md)                                                     | UI/UX design specification: color tokens, typography, components, interaction polish. |
| [`FEATURES_AND_TRUTHS.md`](./FEATURES_AND_TRUTHS.md)                           | **Read first.** Compact invariant map and mandatory reading entrypoint.               |
| [`EDITOR_INTERACTION_DETAILS.md`](./EDITOR_INTERACTION_DETAILS.md)             | Detailed canvas, overlay, hover, inline-edit, drag, and sequence interaction truths.  |
| [`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md)                     | Detailed class / ER / state plugin truths and plugin-specific mutation rules.         |
| [`SEQUENCE_PLUS_PLACEMENT_SOLUTION.md`](./SEQUENCE_PLUS_PLACEMENT_SOLUTION.md) | Model + regression guards for the sequence-diagram lifeline `+` button placement.     |
| [`HOW_TO_WRITE_VERIFICATION_PLAN.md`](./HOW_TO_WRITE_VERIFICATION_PLAN.md)     | Template/process for writing a verification (test) plan.                              |
| [`HOW_TO_WRITE_REGRESSION_PLAN.md`](./HOW_TO_WRITE_REGRESSION_PLAN.md)         | Template/process for writing a regression plan.                                       |

> **RULE:** All reference documentation for AI agents or developers MUST live in this
> `reference/` folder. Do not place docs at the repo root (keep the root clean).

---

## Mermaid Syntax: Do Not Guess

When you need to understand how Mermaid syntax works in order to implement or plan support
for a new diagram type (e.g. Class Diagrams, Entity Relationship diagrams, State diagrams),
**do not guess the syntax.** Read the official Mermaid documentation:

**URL:** [https://github.com/mermaid-js/mermaid/tree/develop/docs](https://github.com/mermaid-js/mermaid/tree/develop/docs)

### How LiveMaid parses & serializes

LiveMaid does **not** use a structured graph model (e.g. React Flow). The text code in the
editor is the single source of truth, and visual edits are applied with **regex-based string
mutation** of the raw Mermaid code. The relevant helpers live in
[`src/lib/diagrams/utils.ts`](../src/lib/diagrams/utils.ts), for example:

- `determineDiagramType(code)` — detects the diagram type from the code.
- `updateLinkStyleAndLabel`, `updateLinkColor`, `updateLinkAnimation`, `updateMermaidCurve`,
  `deleteLink`, `rebuildLinkStyles` — flowchart edge mutations.
- `CONNECTOR_PATTERN` — the ordered alternation of every Mermaid connector token.

Per-diagram behavior is registered as a `DiagramPlugin` in
[`src/lib/diagrams/registry.ts`](../src/lib/diagrams/registry.ts). To add a new diagram type:

1. Read the official syntax docs for that type.
2. Inspect the actual SVG DOM Mermaid generates for it (IDs/class names differ per type).
3. Add a `<type>.tsx` plugin and register it in `registry.ts`.
4. Write resilient regex mutators for the code serializer. Do not implement before you fully
   understand the official syntax.
