# Diagram Plugin Details

Deep implementation truths for diagram-specific plugins. Read the relevant section before changing parsing, toolbars, or mutation helpers.

| Diagram      | Doc                                    |
| ------------ | -------------------------------------- |
| Class        | [`class.md`](./class.md)               |
| ER           | [`er.md`](./er.md)                     |
| State        | [`state.md`](./state.md)               |
| Shared rules | [`shared-rules.md`](./shared-rules.md) |

All plugins register via `src/lib/diagrams/registry.ts`. Server-safe module rule applies to every plugin — no top-level `"use client"` or client-only imports.
