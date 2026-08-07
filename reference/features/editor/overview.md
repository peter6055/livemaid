# Canvas Selection & Overlays

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
- Flowchart inline editors mirror Mermaid's `foreignObject` text layout: `display: table`,
  `white-space: break-spaces`, and the same font stack so line breaks match what Mermaid will
  render on commit.
