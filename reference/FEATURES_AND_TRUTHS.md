# LiveMaid Features & Implementation Truths

This document is the mandatory, compact entrypoint for editor work.

Read this file first, then read only the linked detail docs that match the area you are
changing. This keeps the always-read surface small while preserving the deeper truths in
focused references.

## 1. How to Read the Docs

Always read these three files before modifying editor behavior:

1. [`FEATURES_AND_TRUTHS.md`](./FEATURES_AND_TRUTHS.md) — global invariants and reading map.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system structure and cross-cutting conventions.
3. [`DESIGN.md`](./DESIGN.md) — UI behavior, theming, and interaction expectations.

Then read the relevant deep-dive doc:

| If you are changing...                                                                                          | Read next                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Canvas selection, pan/zoom, overlays, hover, inline editing, sequence interactions, drag-to-connect affordances | [`EDITOR_INTERACTION_DETAILS.md`](./EDITOR_INTERACTION_DETAILS.md)             |
| Flowchart / class / ER / state / sequence plugin behavior and syntax-backed mutations                           | [`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md)                     |
| Sequence lifeline `+` placement behavior specifically                                                           | [`SEQUENCE_PLUS_PLACEMENT_SOLUTION.md`](./SEQUENCE_PLUS_PLACEMENT_SOLUTION.md) |
| Verification-plan writing                                                                                       | [`HOW_TO_WRITE_VERIFICATION_PLAN.md`](./HOW_TO_WRITE_VERIFICATION_PLAN.md)     |
| Regression-plan writing                                                                                         | [`HOW_TO_WRITE_REGRESSION_PLAN.md`](./HOW_TO_WRITE_REGRESSION_PLAN.md)         |

## 2. Support Matrix

- Two-way canvas editing is implemented for `flowchart`/`graph`, `sequenceDiagram`,
  `classDiagram`, `erDiagram`, and `stateDiagram` / `stateDiagram-v2`.
- Other Mermaid diagram types are render-only on the canvas. Code remains the only editing
  surface for them.
- Diagram type detection comes from `determineDiagramType` in
  [`src/lib/diagrams/utils.ts`](../src/lib/diagrams/utils.ts).

## 3. Global Editor Invariants

These are the high-value truths that apply across the editor:

- The Monaco code editor is the single source of truth. Canvas actions must mutate Mermaid
  code, then let Mermaid re-render.
- `react-zoom-pan-pinch` drives the canvas. `limitToBounds={false}` is required so panning
  still works when the diagram fits in view.
- Pan/zoom must be suspended while inline text editing or drag interactions are active.
- Selection, edit entry, and deselection logic must stay centralized. Event propagation is
  not reliable enough to scatter this across many local handlers.
- Overlay UI must stop pointer propagation so the canvas does not pan, zoom, or deselect
  underneath it.
- Static viewport overlays must position relative to the non-transformed shell container,
  not the zoomed canvas inner element.
- Canvas mutations must route through the shared code-change path so undo/redo, autosave,
  and re-render behavior stay consistent.
- If syntax becomes invalid, the editor must preserve the last valid canvas render rather
  than collapsing the interaction model.

## 4. Visual and Interaction Truths

- The main application shell follows the active runtime theme, while the Mermaid drawing
  canvas itself stays white for readability and contrast.
- Floating canvas controls may invert surface styling when needed for contrast, but they
  should still use the shared design tokens and spacing rules from [`DESIGN.md`](./DESIGN.md).
- Hover, selection, and inline-edit geometry must not visually jump when zoom changes or
  when the canvas re-renders.
- The purple `+` affordance stays visually anchored where designed, but drag preview lines
  should dock to the relevant object perimeter when the interaction starts.

## 5. Architecture Rules That Must Not Drift

- Diagram plugins must stay decoupled and registered through
  [`src/lib/diagrams/registry.ts`](../src/lib/diagrams/registry.ts).
- Plugin modules used by the registry server-side must not carry `"use client"` or import
  client-only modules at the top level.
- New reference material for agents and developers belongs under [`reference/`](./README.md),
  not at the repository root.

## 6. Testing and Verification Expectations

### 6a. Test File Conventions

- **All tests must be written in TypeScript.** No Python, JavaScript, or other languages.
- All test files live in a single directory: **`src/test/`**.
- **Unit tests** use Vitest with the **`.test.ts`** extension. Run: `npx vitest run` (or `npm run test`).
- **E2E / browser tests** use Playwright (`@playwright/test`) with the **`.spec.ts`** extension. Run: `npm run test:e2e`.
- **Playwright config** (`playwright.config.ts`) must set `testMatch: "**/*.spec.ts"` so it never picks up unit test files.
- **Do not** create test files outside `src/test/` (no co-located tests, no `__tests__/` directories).
- **Do not** add Python, shell, or ad-hoc test scripts anywhere in the repository.

### 6b. Verification Loop

- After UI or interaction changes, run an interactive browser test against the real flow.
- Capture screenshots at meaningful checkpoints when verifying visual behavior.
- Fix every issue discovered during that verification loop before considering the task done.

Implementation detail for how to perform that testing lives in `AGENTS.md`; verification-plan
formatting lives in the dedicated plan docs.

## 7. Detail Map: Editor Interaction

The following detailed topics now live in
[`EDITOR_INTERACTION_DETAILS.md`](./EDITOR_INTERACTION_DETAILS.md):

- Selection-box geometry and recalculation
- Inline text editing overlay behavior
- Flowchart edge interaction rules
- Sequence interaction details, mapping, hover, reorder, endpoint drag, logic blocks, and
  toolbar reliability
- Canvas-to-code highlighting
- Demo-mode editor behavior
- Header/editor chrome interaction details

## 8. Detail Map: Diagram Plugins

The following detailed topics now live in
[`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md):

- Class diagram behavior
- ER diagram behavior
- State diagram behavior
- Diagram-specific mutation and parsing rules

## 9. Flowchart and Shared Canvas Editing

For flowchart edge styling, selection behavior, quick-add rules, and shared canvas overlay
behavior, read [`EDITOR_INTERACTION_DETAILS.md`](./EDITOR_INTERACTION_DETAILS.md).

## 10. Sequence Diagrams

For sequence message mapping, hover, drag-and-drop, inline editing, reorder flows, note
behavior, and logic blocks, read
[`EDITOR_INTERACTION_DETAILS.md`](./EDITOR_INTERACTION_DETAILS.md).

## 11. Class Diagrams

For class-node panels, title/note editing, relationship toolbars, namespace rules, and
class-specific mutation constraints, read
[`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md#1-class-diagrams).

## 12. ER Diagrams

For ER entity editing, attribute validation, relationship creation, and lock/isolation
behavior, read [`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md#2-er-diagrams).

## 13. State Diagrams

For state node creation, transition handling, notes, composites, singleton start/end rules,
and state-specific toolbar behavior, read
[`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md#3-state-diagrams).

## 14. Documentation Maintenance Rule

When implementation changes:

- update this file if a global invariant, support boundary, or reading rule changes
- update the relevant detail doc if the change is local to one subsystem
- prefer moving long, niche implementation notes into focused docs instead of expanding the
  mandatory entrypoint

## 15. Compatibility Pointers

Historical references to older section numbers should now be interpreted like this:

- old sequence / selection / inline-edit / canvas interaction sections -> `EDITOR_INTERACTION_DETAILS.md`
- old class / ER / state sections -> `DIAGRAM_PLUGIN_DETAILS.md`
- old sequence `+` placement notes -> `SEQUENCE_PLUS_PLACEMENT_SOLUTION.md`
