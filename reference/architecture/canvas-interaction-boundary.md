# Canvas Interaction Boundary Rule

Uniform rule for where diagram-type interaction logic lives, applied to all 7 two-way types (flowchart/graph, sequenceDiagram, classDiagram, erDiagram, stateDiagram, timeline, mindmap).

## The Rule

- **Geometry / code-parsing / hover / selection / connection _state_ → hooks or pure `src/lib/diagrams/<type>/` modules.**
- **Drag gesture state machines + render overlays → `src/components/editor/` per-type modules consumed by EditorCanvas.**

## Module Map

| Concern                                                                               | Home                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sequence geometry (visual model, trigger/block areas, line/label resolution, parsers) | `src/lib/diagrams/sequence/geometry.ts` (pure parsing/math + DOM-measuring helpers)                                            |
| Sequence code mutations (insert/move/delete messages & notes, participant entries)    | `src/lib/diagrams/sequence/mutations.ts` (pure)                                                                                |
| Sequence hover state + hit-testing                                                    | `src/hooks/useSequenceHover.ts`                                                                                                |
| Sequence selection re-resolution                                                      | `src/hooks/useSequenceSelection.ts`                                                                                            |
| Cross-diagram selection state + recalculation                                         | `src/hooks/useSelectionState.ts`                                                                                               |
| Cross-diagram click classifier (`getClickedNode`)                                     | `src/hooks/useNodeResolution.ts`                                                                                               |
| Inline editing state + entry (`handleEditClick`)                                      | `src/hooks/useInlineEditing.ts`                                                                                                |
| Canvas pointer dispatcher, ref/state composition, return assembly                     | `src/hooks/useCanvasInteraction.ts` (orchestrator only)                                                                        |
| Per-type drag-to-connect starters                                                     | `ClassConnectDrag.ts` / `ErConnectDrag.ts` / `StateConnectDrag.ts` / `SequenceInteractions.tsx` (`useSequenceConnectHandlers`) |
| Sequence drag machines (reorder, endpoint, lifeline, indicator)                       | `SequenceInteractions.tsx` (`useSequenceDragMachines`)                                                                         |
| Timeline reorder machine                                                              | `TimelineInteractions.tsx` (`useTimelineReorderMachine`)                                                                       |
| SVG layer / backdrop / transform+zoom UI                                              | `CanvasSvgLayer.tsx`, `CanvasTransform.tsx`, `canvasCoord.ts`, `canvasTypes.ts`                                                |
| Selection toolbar dispatch + hover outlines                                           | `SelectionToolbar.tsx`, `HoverOverlays.tsx`                                                                                    |
| Connect menus + preview/drop layers                                                   | `CanvasPopovers.tsx`, `CanvasDragLayers.tsx`                                                                                   |

All component modules live under `src/components/editor/`.

## Invariants

1. **One layer per operation.** The same operation (e.g. drag-to-connect) lives in the same file family for every type. No diagram-type interaction logic may be split across the hook and EditorCanvas.
2. **The orchestrator stays generic.** `useCanvasInteraction.ts` owns type-agnostic pointer plumbing only; type-specific starters/machines are injected from the editor-component layer.
3. **Pure stays pure.** Parsing/math/model logic in `src/lib/diagrams/**` must not import React and must not carry `"use client"`. DOM-measuring helpers (`querySelector`, `getBoundingClientRect`) are permitted in these modules, but they too must never import React or carry `"use client"`.
4. **DOM frame is fixed.** `canvasShellRef` > `TransformWrapper` > `TransformComponent` > `containerRef`; extractions replace JSX at identical positions with no added wrappers.
5. **Public shapes stable.** Hook/component prop surfaces change only alongside both callers in the same PR.
