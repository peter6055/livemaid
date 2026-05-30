# LiveMaid Features & Implementation Truths

This document serves as the source of truth for the implemented features and architectural decisions in LiveMaid.
**ALL AGENTS MUST READ THIS DOCUMENT before making changes to ensure existing features are not accidentally broken.**

## 1. Diagram Types & Two-Way Sync
- **Supported Two-Way Sync**: `flowchart` (and `graph`) and `sequenceDiagram`. These diagrams allow visual editing (e.g., double-clicking text, adding nodes via buttons) which automatically updates the underlying Mermaid code.
- **Visual-Only (One-Way Sync)**: All other Mermaid diagram types. These render correctly but are read-only on the canvas. Users must edit the code directly to change them.
- **Implementation**: The `determineDiagramType` function in `src/components/LiveMaidEditor.tsx` determines the type. Features like the Quick Add Node button rely on this type to know what code to append.

## 2. Pan & Zoom Engine (`react-zoom-pan-pinch`)
- **Infinite Canvas (Mouse Dragging)**: We use `react-zoom-pan-pinch`. We explicitly set `limitToBounds={false}`. This is **CRITICAL** because without it, the library locks panning when the diagram fits entirely within the view, breaking the ability to drag the canvas with the mouse.
- **Wheel Config**: `wheel={{ wheelDisabled: true, step: 0.05 }}` is used. We rely on trackpad scrolling or manual buttons for zoom to avoid accidental scroll-zooming.
- **Interaction Locks**: `panning={{ disabled: isInlineEditing }}` is set to prevent the canvas from moving while the user is typing in the inline editor.

## 3. Interactive Node Selection & Editing
- **Node Resolution (`getClickedNode`)**: When a user clicks the canvas, we traverse up the DOM tree from the `e.target` to find a container with the `.node` or `.cluster` class. 
- **ID Normalization**: Mermaid injects dynamic prefixes (e.g. `flowchart-mermaid-svg-1234-`). The `getClickedNode` function cleans this raw SVG ID into a clean ID (e.g., `A`) that matches the actual Mermaid code. Both `rawSvgId` and `cleanId` are returned.
- **Selection Box**: We calculate the bounding box of the `.label`, `foreignObject`, or `text` inside the node and apply the current zoom `scale` to render a perfectly aligned selection outline.

## 4. Inline Text Editing (The Overlay)
- **Overlay Positioning**: When a user double-clicks a node, an absolute-positioned `<textarea>` is rendered on top of the diagram. It calculates its exact position and size based on the SVG element's bounding box.
- **Hiding Original Text**: To avoid double text (seeing the SVG text behind the textarea), we inject a dynamic `<style>` tag that sets `opacity: 0 !important` on the specific `#${selectedSvgId} .label, text, foreignObject` while editing is active.
- **Event Propagation (CRITICAL)**: All overlay UI elements (toolbar, textarea) MUST have `onMouseDown={(e) => e.stopPropagation()}` and `onClick={(e) => e.stopPropagation()}`. If this is missed, clicking the overlay will trigger the canvas pan/zoom handlers underneath and steal focus or cause jitter.

## 5. Quick Add Node (+ Button)
- **Visibility**: Appears below the selection box when a node is selected (and inline editing is not active).
- **Code Generation (`handleAddNodeFromSelected`)**: 
  - For flowcharts: Appends `\n {selectedNodeId} --> NewNode{i}[New Node]`. It auto-increments the `i` to avoid ID collisions.
  - For sequence diagrams: Appends `\n {selectedNodeId}->>NewActor: New Message`.

## 6. Theme Management
- We manually inject or update the Mermaid configuration block (`--- \n config: \n theme: 'dark' \n ---`) at the top of the raw Mermaid code string to control themes. This ensures the theme is persisted directly in the diagram code itself.
