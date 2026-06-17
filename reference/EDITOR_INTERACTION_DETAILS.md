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
- Message mapping must use the nearest rendered message line, not raw `.messageText` index,
  because multiline messages render multiple text nodes.
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
