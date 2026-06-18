# Editor Interaction Details

This document holds the detailed implementation truths for shared canvas interaction behavior.
Read it when changing selection, hover, inline editing, drag interactions, sequence-diagram
interaction flows, or other overlay logic.

## 1. Shared Canvas & Selection

- `react-zoom-pan-pinch` is the pan/zoom engine. Keep `limitToBounds={false}`.
- The editor disables panning while inline editing or drag interactions are active.
- `getClickedNode` is the central DOM-to-selection resolver. Mermaid DOM structures differ by
  diagram type, so selection work must go through the shared resolver path.
- Mermaid adds dynamic SVG prefixes to ids. Selection logic must normalize ids before mapping
  back to source code.
- Selection outlines are measured from the rendered DOM and then revalidated after Mermaid
  re-renders. Geometry cannot be treated as stable across recompiles.
- `react-zoom-pan-pinch` and Mermaid `foreignObject` content may swallow or reorder events.
  Selection and edit entry must stay on centralized handlers, with document-capture fallback
  when needed.

## 2. Overlay Positioning

- Floating overlays that live in viewport space must be measured against the static shell
  container, not the transformed canvas inner element.
- Overlay UI must stop `mousedown` and `click` propagation so it does not trigger pan/zoom or
  canvas deselection underneath.
- While inline editing is active, the underlying SVG text must be hidden or masked to avoid
  double-rendered text.
- Inline editors should visually inherit the underlying text area's typography, alignment, and
  bounds closely enough to avoid visible jumps.

## 3. Quick Add and Drag-to-Connect

- The purple `+` affordance stays visually attached to the selected object.
- Once a connect drag starts, the preview line should visually dock to the selected object's
  nearest perimeter edge rather than the floating `+` button itself.
- Connect-drag overlays should be isolated from pan/zoom with their own drag listeners and
  render above the transformed canvas when the interaction requires viewport-relative geometry.
- Flowchart drag-drop shape pickers must use semantic theme tokens (`bg-popover`,
  `text-popover-foreground`, `border-border`, `bg-background`, `hover:bg-accent`) so they remain
  readable in light and dark mode.
- State drag-to-connect shape pickers must close as soon as the canvas moves or a pan/zoom
  gesture starts, and disabled Start/End tiles must expose a custom hover/focus tooltip explaining
  the singleton rule.

## 4. Flowchart Interaction

- Flowchart nodes and edges support two-way editing through code mutation, not a separate graph
  model.
- Parallel edges must map by Mermaid's stable edge identifiers, not array position.
- Unlabeled edges need geometry from the visual path rather than an empty edge-label box.
- Edge toolbar mutations should preserve Mermaid compatibility when switching among connector,
  stroke, color, and animation states.

## 5. Sequence Interaction

Sequence editing is unusually DOM-sensitive. When touching sequence behavior, preserve these
truths:

- Message selection, note selection, and logic-block interaction are geometry-driven and must
  tolerate Mermaid reflow.
- Message mapping must pair each label element to its owning message line via
  `findOwningLineForSequenceLabel` (label top vs line center-Y scoring), not raw `.messageText`
  DOM order, because multiline messages render multiple text nodes (foreignObject + byTspan
  fallbacks).
- Multiline sequence-message selection must union ALL visible rendered label rows for the
  owning message (including Mermaid's separate wrapped/byTspan `.messageText` nodes), and a
  click routed through the hover/reorder overlay with an explicit message index must honor
  that index directly rather than falling back to Y-position guessing.
- Hover and selection geometry for sequence messages must stay pixel-identical, differing only
  in emphasis, not in box size or position.
- Hover listeners must remain attached through React-managed props on the live canvas
  container, not brittle `addEventListener` effects on stale DOM nodes.
- Full message bands, not just the thin arrow line, are intentionally interactive.
- Reorder, endpoint reassignment, and connection-drag indicators run in shell/viewport
  coordinates so pan/zoom does not skew hit-testing.
- Sequence message endpoint drag handles are rendered as a **viewport-space overlay** (inside the
  TransformWrapper render function but outside TransformComponent), so their screen size stays
  fixed regardless of zoom level. Canvas coordinates from `getSequenceMessageEndpointGeometry`
  are converted to viewport coordinates via:
  ```
  vpX = pt.x * state.scale + containerRect.left - container.scrollLeft - shellRect.left
  vpY = pt.y * state.scale + containerRect.top  - container.scrollTop  - shellRect.top
  ```
  This avoids `data-scale-lock` scaling entirely, preventing handles from becoming oversized at
  extreme zoom-out or undersized at extreme zoom-in. Handle dimensions are plain CSS (`width`/`height`)
  without any zoom compensation.
- Logic-block overlays depend on DOM measurement and must tolerate cold-load timing delays
  before the transformed container is ready.
- Toolbar hit areas, hover suppression, and stacking order must keep floating sequence UI from
  reselecting or highlighting content behind it.

### 5.1 Multi-line message hover and selection (`fix/issue-71-sequence-duplicate-selection`)

**Problems addressed**

- **#71 — duplicate selection overlays:** clicking a wrapped label row on a multiline message
  could resolve the wrong message index, producing a second selection box offset from the
  clicked label.
- **#59 — hover flicker / intermittent purple highlight:** purple text+line hover sometimes
  vanished while the React hover outline remained, especially after selecting another message
  or when moving within a multiline label.
- **SVG DOM wipe on re-render:** selection and hover overlay state updates re-rendered
  `EditorCanvas`. The mermaid container used `dangerouslySetInnerHTML`, which replaced the SVG
  subtree even when `svgContent` was unchanged, destroying `classList` hover mutations while
  React hover state (`hoveredSequenceMessageIndex`, `hoveredSequenceMessageBox`) stayed set.

**Approach**

| Layer                 | Mechanism                                                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable SVG host       | `StableMermaidHtml` writes `innerHTML` only when the `svgContent` string changes, so overlay-driven re-renders do not reset Mermaid DOM.                                                                                                                                                      |
| Canonical index       | DOM message-line index (`SEQ_MSG_${domIndex}`) everywhere — hit overlays, selection, reorder. Clicks via `startSeqReorderDrag` pass `explicitIndex`; `triggerHoveredSequenceMessageSelection(false, index)` must not fall back to Y guessing.                                                 |
| Label ↔ line pairing  | `getVisibleSequenceMessageTexts` + `getSequenceMessageLabelRoots` + `findOwningLineForSequenceLabel`; `buildSequenceMessageVisualModel` unions all label rows per line for selection/hover geometry.                                                                                          |
| Single hover owner    | `setHoveredSequenceMessage(index)` is the only state entry point. It calls `applySequenceMessageHoverClasses(index)` synchronously to stamp/remove `sequence-msg-hover-highlight-*` on live SVG nodes.                                                                                        |
| Hit overlays          | Precomputed `sequenceMessageTriggerAreas` (RAF retry on cold load) render stable `pointer-events-auto` divs (`data-seq-msg-index`, z-21) with `onPointerEnter` / `onPointerMove` / `onPointerLeave`. Reorder mousedown is merged into these overlays (no separate mount-on-hover grab layer). |
| Hover outline         | React div with `data-seq-msg-hover-outline` (not `data-scale-lock-border`). Shown when `hoveredSequenceMessageIndex !== null` and `selectedNodeId !== SEQ_MSG_${hoveredIndex}`.                                                                                                               |
| Floating-UI guard     | `isSequenceMessageHoverSuppressedByFloatingUi` walks `elementsFromPoint` top-down; hit overlay / hover outline own the stack; skips `pointer-events: none` elements before checking toolbar / selection chrome.                                                                               |
| Re-apply after layout | `useLayoutEffect` + `requestAnimationFrame` re-call `applySequenceMessageHoverClasses` when hover index, selection, `svgContent`, or trigger areas change — catches late DOM updates after selection.                                                                                         |
| Pointer re-sync       | `lastSequencePointerRef` + `syncSequenceMessageHoverAtPoint` on `selectedNodeId` / trigger-area / `svgContent` changes; `handleMouseUp` re-resolves hover instead of blind clear.                                                                                                             |

**Key files**

- `src/components/editor/StableMermaidHtml.tsx`
- `src/hooks/useCanvasInteraction.ts` — `applySequenceMessageHoverClasses`, `setHoveredSequenceMessage`, `buildSequenceMessageVisualModel`
- `src/components/editor/EditorCanvas.tsx` — hit overlays, hover outline, `StableMermaidHtml` host
- `src/app/globals.css` — `sequence-msg-hover-highlight-*` (no native `:hover` on unselected messages)

**Agent / dev-server testing**

- Only one Next.js dev instance is allowed per repo clone. Do **not** kill the user's dev server
  on port 3005.
- Automated browser tests should use `npm run dev:agent` (port **3434**, see `package.json`) or
  Playwright's configured `webServer` so agent runs do not stop the human dev server.

**Branch, commits, and PR** (pushed to `origin/fix/issue-71-sequence-duplicate-selection`)

| Commit    | Message                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `74e27e3` | `fix(editor): fix duplicate selection overlays on multi-line sequence messages`     |
| `083e396` | `fix(sequence): use message lines as canonical index for multi-line label geometry` |
| `8da1e59` | `fix(sequence): replace nearest-line mapping with owning-line-below-label resolver` |
| `7380364` | `fix(sequence): apply hover highlight to all multi-line label elements`             |
| `807cdd8` | `fix(sequence): prevent click-jumping and remove CSS hover flicker`                 |
| `f3c2714` | `fix(sequence): use labelTop not labelCenterY in findOwningLineForSequenceLabel`    |
| `69e15c4` | `fix(sequence): align multiline message selection box with clicked label`           |
| `1eb9b60` | `fix(sequence): stabilize message hover highlight after selection`                  |

Draft PR: [#74 — fix(sequence): stabilize multi-line message selection and hover](https://github.com/peter6055/livemaid/pull/74)

## 6. Canvas-to-Code Highlighting

- Canvas selection highlights the corresponding Monaco source range.
- Mapping helpers must return "no confident match" rather than guessing.
- The code highlight must clear cleanly on deselection.

## 7. Demo Mode & Editor Chrome

- Demo mode is runtime-driven and must stay read-only from both server and client mutation
  paths.
- Header/editor chrome behavior must preserve diagram-name editing, history/export controls,
  and status surfaces without fighting the shared save pipeline.
- Duplicating a diagram from the editor header creates the copy and opens the copied diagram in a
  separate browser window/tab, leaving the source editor open in its current window. The source
  editor opens `/editor/:id/duplicate` immediately and passes the current in-memory code through
  same-origin storage so the new tab performs creation and redirects itself.

## 8. When to Read Further

- For sequence lifeline `+` placement specifics, read
  [`SEQUENCE_PLUS_PLACEMENT_SOLUTION.md`](./SEQUENCE_PLUS_PLACEMENT_SOLUTION.md).
- For class, ER, and state plugin-specific behavior, read
  [`DIAGRAM_PLUGIN_DETAILS.md`](./DIAGRAM_PLUGIN_DETAILS.md).
