# Features & Implementation Truths

Mandatory compact entrypoint for editor and feature work. Read this first, then only the linked docs for your subsystem.

## Reading Order

Always read before modifying editor behavior:

1. This file — global invariants and reading map.
2. [`architecture/overview.md`](../architecture/overview.md) — system structure.
3. [`standards/design.md`](../standards/design.md) — UI behavior and theming.

Then read the relevant deep-dive:

| If you are changing…                                                         | Read next                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Canvas selection, pan/zoom, overlays, hover, inline editing, drag-to-connect | [`editor/overview.md`](./editor/overview.md), [`editor/quick-add.md`](./editor/quick-add.md) |
| Flowchart edge/node interaction                                              | [`editor/flowchart.md`](./editor/flowchart.md)                                               |
| Sequence messages, hover, reorder, logic blocks                              | [`editor/sequence.md`](./editor/sequence.md)                                                 |
| Sequence lifeline `+` placement                                              | [`editor/sequence-plus-placement.md`](./editor/sequence-plus-placement.md)                   |
| Class / ER / state plugin behavior                                           | [`diagrams/overview.md`](./diagrams/overview.md) + type-specific doc                         |
| Verification plan writing                                                    | [`plans/verification-plan.md`](../plans/verification-plan.md)                                |
| Regression plan writing                                                      | [`plans/regression-plan.md`](../plans/regression-plan.md)                                    |

## Support Matrix

- Two-way canvas editing: `flowchart`/`graph`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram` / `stateDiagram-v2`, and `mindmap`.
- Other Mermaid types are code-only render/preview; code is the only editing surface.
- Diagram type detection: `determineDiagramType` in `src/lib/diagrams/utils.ts`.
- Registered two-way plugins in `src/lib/diagrams/registry.ts`: `flowchart`, `sequence`, `classDiagram`, `erDiagram`, `stateDiagram`, `mindmap`.

## Global Editor Invariants

- Monaco code is the single source of truth. Canvas actions mutate Mermaid code, then re-render.
- `react-zoom-pan-pinch` drives the canvas. `limitToBounds={false}` is required.
- Suspend pan/zoom during inline editing and drag interactions.
- Keep selection, edit entry, and deselection centralized — do not scatter across local handlers.
- Overlay UI must stop pointer propagation so the canvas does not pan/zoom/deselect underneath.
- Static viewport overlays position relative to the non-transformed shell container.
- Canvas mutations route through the shared code-change path (undo/redo, autosave, re-render).
- On invalid syntax, preserve the last valid canvas render.

## Visual & Interaction Truths

- App shell follows the active runtime theme; Mermaid canvas stays white for readability.
- Floating canvas controls may invert surface styling for contrast but use shared design tokens.
- Hover, selection, and inline-edit geometry must not jump on zoom or re-render.
- Purple `+` stays visually anchored; drag preview lines dock to object perimeter when dragging.

## Architecture Rules

- Diagram plugins stay decoupled via `src/lib/diagrams/registry.ts`.
- Plugin modules imported server-side must not carry `"use client"` or client-only top-level imports.
- New reference docs belong under `reference/`, organized by subfolder (see [`README.md`](../README.md)).

## Testing Conventions

- All tests in TypeScript under `src/test/`.
- Unit tests: Vitest, `*.test.ts`, run `npm run test`.
- E2E: Playwright, `*.spec.ts`, run `npm run test:e2e`.
- Do not co-locate tests or add `__tests__/` directories.
- After UI changes, run interactive browser verification (see [`standards/testing.md`](../standards/testing.md)).

## Documentation Maintenance

- Update this file when global invariants, support boundaries, or reading rules change.
- Update subsystem docs for localized changes.
- Prefer focused docs over expanding this entrypoint.
