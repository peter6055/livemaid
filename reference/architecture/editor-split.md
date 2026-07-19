# Editor Split-Screen Architecture

## 2. Editor Architecture: The Split-Screen WYSIWYG

The editor interface uses a resizable split-screen layout (`react-resizable-panels`).

- **Left Pane (Source of Truth)**: Monaco Editor (`@monaco-editor/react`). The text code is the ultimate source of truth for the diagram state.
- **Right Pane (Visual Canvas)**: Native Mermaid SVG rendering + `react-zoom-pan-pinch`. This provides an infinite, pannable, and zoomable canvas containing the raw SVG.
- **Bidirectional Editing via SVG Overlays**:
  - Instead of utilizing heavy canvas libraries like React Flow, we inject the raw Mermaid SVG (`mermaid.render()`) directly into the DOM.
  - We listen to click events on the SVG elements, map the `e.target` to its corresponding Mermaid node/edge ID, and dynamically render React UI overlays (selection bounding boxes, quick-add handles, inline text editors) seamlessly on top of the exact SVG coordinates.
  - When visual edits occur (e.g., typing in the inline editor or clicking the `+` button), a regex-based custom parser/serializer updates the raw code in the Monaco Editor, which triggers a re-render of the SVG.
- **Auto-Layout**: Handled natively by Mermaid.js under the hood. No manual position dragging is required by the user.
