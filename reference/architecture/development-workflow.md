# Development Workflow

## 5. Development Workflow

- **Event Handling Caution**: `react-zoom-pan-pinch` + Mermaid SVG/`foreignObject` can swallow or bypass expected React bubbling paths (especially for single-click on labels). Critical selection/edit transitions must be routed through one centralized handler (`handleSvgClick`) and may require a document-level capture fallback (`mousedown`, capture phase) that forwards a synthetic event including `detail`.
- **Double-Click Truth**: Do not rely on native `onDoubleClick` alone for canvas edit entry. Keep a click-detail (`e.detail >= 2`) path in the centralized handler so double-click-to-edit remains reliable even when native dblclick propagation is inconsistent.
- **Adding Diagram Support**: Supporting new diagram types involves examining the specific SVG DOM structure Mermaid generates for that diagram type (since IDs and class names vary wildly between flowcharts, sequence diagrams, etc.), and writing resilient Regex string-replacers for the code serializer.
- Ensure the `data/` directory is excluded from version control if needed, or handled correctly in Docker volumes.
