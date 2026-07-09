# LiveMaid Architecture & Conventions

High-level system reference. For focused topics, read the split docs below.

## Quick Links

| Topic                        | Doc                                                    |
| ---------------------------- | ------------------------------------------------------ |
| Storage & adapter seam       | [`storage.md`](./storage.md)                           |
| Split-screen editor model    | [`editor-split.md`](./editor-split.md)                 |
| Tech stack & aesthetics      | [`tech-stack.md`](./tech-stack.md)                     |
| Development workflow         | [`development-workflow.md`](./development-workflow.md) |
| Diagram plugins              | [`plugins.md`](./plugins.md)                           |
| MongoDB migration (deferred) | [`mongodb-migration.md`](./mongodb-migration.md)       |

## Summary

LiveMaid is a local-first Next.js WYSIWYG Mermaid editor:

- **Persistence**: JSON documents on disk via `StorageAdapter` (`src/lib/api/storage.ts`). MongoDB-ready but deferred.
- **Editor**: Monaco (source of truth) + Mermaid SVG canvas with React overlays (`react-zoom-pan-pinch`).
- **Diagrams**: Composition/plugin architecture — `flowchart`, `sequence`, `classDiagram`, `erDiagram`, `stateDiagram`, and `mindmap` registered in `src/lib/diagrams/registry.ts`. Other Mermaid types are code-only render/preview.
- **Stack**: Next.js App Router, Tailwind v4, shadcn/ui, lucide-react, next-themes (system default).
- **Theme**: App shell follows OS theme; Mermaid canvas stays white. Full tokens in [`standards/design.md`](../standards/design.md).

## Plugin Module Rule

Plugin files must NOT carry `"use client"` — the registry is imported server-side by `POST /api/diagrams` for `defaultCode`. Details: [`plugins.md`](./plugins.md), [`features/diagrams/overview.md`](../features/diagrams/overview.md).
