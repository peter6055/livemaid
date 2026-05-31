# LiveMaid Features & Implementation Truths

This document serves as the source of truth for the implemented features and architectural decisions in LiveMaid.
**ALL AGENTS MUST READ THIS DOCUMENT before making changes to ensure existing features are not accidentally broken.**

## 1. Diagram Types & Two-Way Sync
- **Supported Two-Way Sync**: `flowchart` (and `graph`) and `sequenceDiagram`. These diagrams allow visual editing (e.g., double-clicking text, adding nodes via buttons) which automatically updates the underlying Mermaid code.
- **Visual-Only (One-Way Sync)**: All other Mermaid diagram types. These render correctly but are read-only on the canvas. Users must edit the code directly to change them.
- **Implementation**: The `determineDiagramType` function in `src/lib/diagrams/utils.ts` determines the type. Features like the Quick Add Node button rely on this type to know what code to append.

## 2. Pan & Zoom Engine (`react-zoom-pan-pinch`)
- **Infinite Canvas (Mouse Dragging)**: We use `react-zoom-pan-pinch`. We explicitly set `limitToBounds={false}`. This is **CRITICAL** because without it, the library locks panning when the diagram fits entirely within the view, breaking the ability to drag the canvas with the mouse.
- **Wheel Config**: `wheel={{ wheelDisabled: true, step: 0.05 }}` is used. We rely on trackpad scrolling or manual buttons for zoom to avoid accidental scroll-zooming.
- **Zoom Constraints**: We set `minScale={0.5}` and `maxScale={50}`. The `minScale` limit prevents diagrams from zooming out into tiny, unreadable, or lost shapes.
- **Interaction Locks**: `panning={{ disabled: isInlineEditing }}` is set to prevent the canvas from moving while the user is typing in the inline editor.

## 3. Interactive Node Selection & Editing
- **Node Resolution (`getClickedNode`)**: When a user clicks the canvas, we traverse up the DOM tree from the `e.target` to find a container with the `.node` or `.cluster` class. 
- **ID Normalization**: Mermaid injects dynamic prefixes (e.g. `flowchart-mermaid-svg-1234-`). The `getClickedNode` function cleans this raw SVG ID into a clean ID (e.g., `A`) that matches the actual Mermaid code. Both `rawSvgId` and `cleanId` are returned.
- **Selection Box**: We calculate the bounding box of the `.label`, `foreignObject`, or `text` inside the node and apply the current zoom `scale` to render a perfectly aligned selection outline.
- **Layout Alignment Observers**:
  - **compilation tracking**: Since Mermaid compilation is asynchronous, we hook selection recalculation directly to changes in both `code` and `svgContent` (the compiled output in the DOM) using a 50ms layout timeout.
  - **ResizeObserver**: To ensure that the selection box and text edit overlays remain glued to the target node during screen resizing or split-panel dragging, we mount a `ResizeObserver` observing both `containerRef.current` and `.mermaid-container`.
- **Dynamic Style Highlights**: The floating style bar queries the raw Mermaid styling code using a static regex scraper (`getStyleFromCode`) alongside native `window.getComputedStyle(element)` queries to dynamically toggle active outlines on preset background/border/text colors and bold/italic font states.
- **Node Styling Reset**: Clicking the Reset Style button in the `NodeManipulationToolbar` completely purges all `style <nodeId>` lines from the raw Mermaid source. This completely reverts custom background color, border color, text color, font weight, and italic traits, immediately forcing the node to adhere back to the active diagram theme.
- **Physical Size Zoom Locking**: The floating styling bar (`NodeManipulationToolbar`), inline formatting toolbar, inline textarea overlay, and Quick Add (+ Button) employ real-time, zero-lag DOM-level scale-locking (via attributes `data-scale-lock` and `data-base-transform`) inside react-zoom-pan-pinch's `onTransformed` and `onInit` callbacks. This completely bypasses React render delay and Safari's CSS variable transition limitations, guaranteeing a perfectly locked physical sizing.
- **Decoupled Selection Outlines**: The selection box container does NOT receive scale transforms (leaving its width, height, left, and top coordinates perfectly matching the node in SVG coordinates), while its border and shadow thicknesses are separately scale-locked using `data-scale-lock-border` and `data-scale-lock-shadow`. This prevents selection box distortion or misalignment at any zoom depth.
- **Auto-Deselection on Zoom**: To ensure a clean, distraction-free workspace and prevent layout scaling clutter during navigation, zooming in, zooming out, resetting transform, or starting a trackpad pinch-zoom gesture automatically deselects any currently active selection. This instantly closes the `NodeManipulationToolbar` and floating controls, immediately focusing interaction back on the canvas.

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

## 7. Modular Architecture
- The editor logic is split into several modular components in `src/components/editor/`: `EditorHeader`, `EditorCodePanel`, `EditorCanvas`, `NodeManipulationToolbar`, and `InlineTextEditor`.
- State logic is handled by `useEditorState` and `useCanvasInteraction` custom hooks.
- Extracted constants and utilities live in `src/lib/diagrams/`.

## 8. Dashboard & Card Preview Skeletons
- **High-Fidelity Dashboard Skeleton Loaders**: Replacing standard loading spinners, the dashboard uses a premium animated CSS grid of 6 skeleton cards that match `DiagramCard` proportions and layouts.
- **Asynchronous Card Preview Skeletons**: Diagram cards employ an `isCompiling` state during asynchronous Mermaid SVG compilation. While compiling, a high-fidelity animated flowchart preview skeleton—complete with rounded start nodes, a rotated decision diamond, an end rectangle, and connectors/arrows—is rendered to represent the loading diagram.
- **White Background Previews**: All diagram card previews and skeleton loaders utilize high-contrast `bg-white` canvas containers to ensure high legibility and clear contrast in both light and dark modes.

## 9. Flowchart Edge/Connector Styling & Label Editing
- **Interactive Edge Selection**: Users can click directly on a flowchart link (edge path) or its text label. The editor identifies the adjacent `.edgeLabel` node, snaps the coordinates to the label, and assigns it a queryable dynamic ID (`edge-label-${cleanId}`).
- **Strict Parallel Edge Isolation (Hover & Selection)**: Mermaid v11+ automatically injects a unique, canonical `data-id` attribute containing the exact path ID (e.g. `L_src_dst_index`) on the `<g class="label">` container inside *every* `.edgeLabel` container (both labeled and unlabeled). We map hover highlight and click selection strictly using these canonical IDs instead of array index fallbacks (`edgeLabels.indexOf`). This completely eliminates index-drift, ensuring that hover isolation and selection are strictly isolated to individual parallel edge occurrences without parallel leakage or mapping drift.
- **Unlabeled Edge Bounding Box Snapping**: If an edge has no label, its `.edgeLabel` container exists but contains empty text and has zero width/height. To prevent the selection overlay from collapsing or flying to `(0, 0)`, coordinates for unlabeled edges are measured directly from the visual `<path.flowchart-link>` bounding box rather than snapping to the empty label container.
- **Edge Manipulation Toolbar**: When an edge is selected, a dedicated scale-locked floating toolbar appears on the canvas. It provides quick controls for:
  - **Arrow Style**: Configures the connector arrowhead (plain, arrow, double arrow, cross, double cross, circle, double circle).
  - **Stroke Style**: Configures the link dash pattern and weight (solid, dashed, thick).
  - **Line Color**: Toggles the active outline on preset stroke colors.
  - **Zap/Flow Animation**: Configures real-time animated flow effects across the path.
  - **Edit Label Text**: Centers the glassmorphic `<textarea>` overlay directly over the edge label for inline editing.
  - **Delete Edge**: Deletes the connection from the raw Mermaid source. To prevent accidental node deletion, the source and target nodes are preserved as standalone parentless/orphan nodes in the flowchart if they are not defined or referenced elsewhere in the diagram code.
- **Global Edge Curve Config**: Located in the main flowchart top bar toolbar, this allows toggling the global flowchart interpolation/routing curve style (orthogonal step, curve basis, linear straight) for all links in the flowchart, persisting directly inside the diagram config frontmatter block.
- **Two-Way Label Sync**: Double-clicking an edge label, or clicking the pencil button, triggers the dynamic `<InlineTextEditor>` at the exact coordinates of the label. Submitting the text (by pressing Enter or blurring) serializes the edge label back to the Mermaid code in the standard format (e.g. `A -->|New Label| B`) and instantly re-renders the diagram on the canvas.
- **Link Style Preservation & RebuildLinkStyles Bypass**: Styling updates like Line Color and Zap/Flow Animation append `linkStyle` rules to the end of the Mermaid code. Because style modifications do not alter the link structure (no lines added or removed), `rebuildLinkStyles` is bypassed for these operations, passing `updatedCode` directly to `handleCodeChange`. This prevents custom style rules from being lost during compilation rendering.
- **Centralized Connector Matching Pattern**: Standardized and ordered all Mermaid link connectors from longest/most-specific to shortest/least-specific in `CONNECTOR_PATTERN` in `src/lib/diagrams/utils.ts`. This resolves regex prefix conflicts (where shorter subset connectors like `-->` falsely matched inside longer superset connectors like `<-->` or `x--x`), ensuring robust arrow type editing, stroke styling, label updating, and styled edge deletion without corrupting the Mermaid syntax.
- **Preset Color Selection Cleanups**: Removed the redundant `'White'` and `'Black'` presets from `PRESET_COLORS` in `src/lib/diagrams/constants.ts` to provide a premium, tailored preset palette for flowchart elements.

## 10. Global Keyboard Shortcuts
- **Keyboard-Driven Canvas Deletion**: When a diagram node or flowchart edge/line is selected, users can press `Backspace` or `Delete` on their keyboard to instantly delete it from the diagram canvas and Mermaid code.
- **Form/Input and Code Isolation**: The keydown event listener is completely disabled when any input, textarea, contenteditable container, or the Monaco Editor has focus. This prevents elements from being accidentally deleted while typing comments or updating diagram text code.
- **Canvas Focus Blur**: To ensure that selecting canvas elements (which are SVG elements and not focusable by default) immediately enables deletion shortcuts without being blocked by active Monaco editor focus, clicking any canvas element or empty space (inside `handleSvgClick`) programmatically blurs the active text input or editor via `document.activeElement.blur()`. This shifts browser focus away from Monaco/inputs to the document body, activating the deletion listeners safely.




