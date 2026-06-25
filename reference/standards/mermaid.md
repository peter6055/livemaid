# Mermaid Implementation Rules

Do not guess Mermaid syntax.

1. Read official docs: https://github.com/mermaid-js/mermaid/tree/develop/docs
2. Read the specific `.md` files for the syntax you are implementing.
3. Do not implement until you understand official behavior.

## How LiveMaid Parses & Serializes

The editor text is the source of truth. Visual edits use **regex-based string mutation** in `src/lib/diagrams/utils.ts`:

- `determineDiagramType(code)` — diagram type detection.
- Flowchart helpers: `updateLinkStyleAndLabel`, `updateLinkColor`, `updateLinkAnimation`, `updateMermaidCurve`, `deleteLink`, `rebuildLinkStyles`, `CONNECTOR_PATTERN`.

Per-diagram behavior: `DiagramPlugin` in `src/lib/diagrams/registry.ts`.

To add a new diagram type:

1. Read official syntax docs.
2. Inspect the SVG DOM Mermaid generates (IDs/classes differ per type).
3. Add `<type>.tsx` plugin and register in `registry.ts`.
4. Write resilient regex mutators. Do not implement before understanding syntax.
