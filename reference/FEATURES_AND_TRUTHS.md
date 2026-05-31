# LiveMaid Features & Implementation Truths

This document serves as the source of truth for the implemented features and architectural decisions in LiveMaid.
**ALL AGENTS MUST READ THIS DOCUMENT before making changes to ensure existing features are not accidentally broken.**

## 1. Diagram Types & Two-Way Sync
- **Supported Two-Way Sync**: `flowchart` (and `graph`) and `sequenceDiagram`. These diagrams allow visual editing (e.g., double-clicking text, adding nodes via buttons) which automatically updates the underlying Mermaid code.
- **Visual-Only (One-Way Sync)**: All other Mermaid diagram types. These render correctly but are read-only on the canvas. Users must edit the code directly to change them.
- **Implementation**: The `determineDiagramType` function in `src/lib/diagrams/utils.ts` determines the type. Features like the Quick Add Node button rely on this type to know what code to append.

## 2. Pan & Zoom Engine (`react-zoom-pan-pinch`)
- **Infinite Canvas (Mouse Dragging)**: We use `react-zoom-pan-pinch`. We explicitly set `limitToBounds={false}`. This is **CRITICAL** because without it, the library locks panning when the diagram fits entirely within the view, breaking the ability to drag the canvas with the mouse.
- **Wheel Config**: `wheel={{ wheelDisabled: true, step: 0.05 }}` is used on the main editor canvas to prevent accidental wheel-zoom while editing.
- **Trackpad Interaction**: Trackpad panning remains enabled (`trackPadPanning={{ disabled: false }}`), and zoom is performed through the zoom controls and pinch gestures.
- **Trackpad Swipe Navigation Guard**: The app globally applies `overscroll-behavior-x: none` on `html` and `body` to block browser-level horizontal swipe navigation (back/forward page changes) while using trackpad gestures.
- **Zoom Constraints**: We set `minScale={0.5}` and `maxScale={50}`. The `minScale` limit prevents diagrams from zooming out into tiny, unreadable, or lost shapes.
- **Interaction Locks**: `panning={{ disabled: isInlineEditing || dragState?.isDragging }}` is set to prevent the canvas from moving while the user is typing in the inline editor or dragging sequence elements.

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
- **High-Contrast Text Highlight Selection**: To guarantee that selected/highlighted text remains visible in all OS/browser color themes (preventing dark-mode overrides from rendering selected text invisible), the overlay input explicitly enforces high-specificity indigo selection styles: `selection:bg-indigo-600 selection:text-white`.
- **Spacious Width Boundaries**: To prevent premature wrapping and make long typed words fully legible, the overlay textarea calculates its unscaled target width as `Math.min(Math.max(textBox.width + 200, 350), 700)`.
- **Drift-Free Viewport Coordinate Bounds**: Hover elements, overlays, and context menus (like `shapePicker`) that render in the static viewport space must calculate coordinates by subtracting `.getBoundingClientRect()` of the closest static container (`.relative.overflow-hidden`) rather than the zoomed/panned inner canvas (`containerRef.current`). This guarantees 1:1 screen-to-cursor matching with absolute precision under any zoom or pan level.

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
  - **Bidirectional Style Coercion for Thick & Unsupported Connectors**: Mermaid does not natively support thick variants for cross (`--x`) or circle (`--o`) arrowheads. To prevent compilation/syntax errors:
    - **Stroke to Thick**: If the user selects "Thick Line" from the stroke dropdown while an unsupported arrowhead style (Cross, Double Cross, Circle, Double Circle) is active, the arrow style is automatically coerced to its standard thick-supported counterpart (`arrow` or `double_arrow`), allowing the stroke change to succeed.
    - **Arrow Style to Cross/Circle**: If the user selects an unsupported arrowhead style (Cross, Double Cross, Circle, Double Circle) while the line is currently a "Thick Line", the stroke style is automatically coerced to "Solid Line", allowing the arrowhead style change to succeed.
  - **Line Color**: Toggles the active outline on preset stroke colors.
  - **Zap/Flow Animation**: Configures real-time animated flow effects across the path using Mermaid's native v11+ property-based edge animation syntax. When enabled, a deterministic edge ID (e.g. `e_A_B_0@`) is prepended to the connector on the targeted edge line, and a corresponding property declaration `e_A_B_0@{ animate: true }` is cleanly appended to the end of the diagram. When animation is toggled off and the edge uses our deterministic ID pattern, both the property declaration and the prepended ID prefix are automatically removed, restoring the clean diagram syntax. Manual/custom user-defined edge IDs are fully preserved during animation toggling.
  - **Edit Label Text**: Centers the glassmorphic `<textarea>` overlay directly over the edge label for inline editing.
  - **Delete Edge**: Deletes the connection from the raw Mermaid source. To prevent accidental node deletion, the source and target nodes are preserved as standalone parentless/orphan nodes in the flowchart if they are not defined or referenced elsewhere in the diagram code.
- **Global Edge Curve Config**: Located in the main flowchart top bar toolbar, this allows toggling the global flowchart interpolation/routing curve style (orthogonal step, curve basis, linear straight) for all links in the flowchart, persisting directly inside the diagram config frontmatter block.
- **Two-Way Label Sync**: Double-clicking an edge label, or clicking the pencil button, triggers the dynamic `<InlineTextEditor>` at the exact coordinates of the label. Submitting the text (by pressing Enter or blurring) serializes the edge label back to the Mermaid code in the standard format (e.g. `A -->|New Label| B`) and instantly re-renders the diagram on the canvas.
- **Link Style Preservation & RebuildLinkStyles Bypass**: Styling updates like Line Color and Zap/Flow Animation append `linkStyle` rules to the end of the Mermaid code. Because style modifications do not alter the link structure (no lines added or removed), `rebuildLinkStyles` is bypassed for these operations, passing `updatedCode` directly to `handleCodeChange`. This prevents custom style rules from being lost during compilation rendering.
- **Centralized Connector Matching Pattern**: Standardized and ordered all Mermaid link connectors from longest/most-specific to shortest/least-specific in `CONNECTOR_PATTERN` in `src/lib/diagrams/utils.ts`. This resolves regex prefix conflicts (where shorter subset connectors like `-->` falsely matched inside longer superset connectors like `<-->` or `x--x`). Furthermore, to handle word boundary (`\b`) transitions seamlessly on connectors ending in word characters (such as `--x` or `--o` directly connected to a destination node), we use an elegant lookbehind pattern `(?:\\b|(?<=[xoXO]))${dst}\\b`. This ensures robust arrow type editing, stroke styling, label updating, and styled edge deletion without corrupting the Mermaid syntax.
- **Preset Color Selection Cleanups**: Removed the redundant `'White'` and `'Black'` presets from `PRESET_COLORS` in `src/lib/diagrams/constants.ts` to provide a premium, tailored preset palette for flowchart elements.

## 12. Version History & Rollback
- **Snapshot Source of Truth**: Each diagram document persists a `versionHistory` array in its local JSON file. The editor records the previously saved Mermaid code whenever a real code change is committed through the save path.
- **User Metadata**: History entries can be renamed inline and starred as pinned favorites. These fields live on the same version record and are persisted back through the diagram update route.
- **Rollback Behavior**: Restoring a version replaces the current code with the selected snapshot and then saves it through the same document update path, which preserves the rollback as a new history entry.
- **Read-Only Preview Workspace**: Opening history now creates a split workspace where the right panel lists snapshots and the left side renders the selected snapshot diagram in a read-only preview canvas. The preview supports pan/zoom/reset controls and is visually marked as non-editable.
- **Preview Interaction Parity**: The history preview canvas mirrors the main canvas interaction model for navigation (`wheelDisabled: true`, `trackPadPanning: enabled`, `limitToBounds: false`) so trackpad panning behaves consistently across both views.
- **Canvas Background Policy**: Diagram render surfaces stay white in both light and dark themes (main editor canvas and history preview canvas) to preserve Mermaid readability and contrast.
- **Pop-out Backdrop Policy**: Pop-out surfaces (dialogs and overlays) use a stronger dimming backdrop in dark mode to preserve depth separation and visual focus (`dark:bg-black/70`).
- **Retention**: Version history is capped at the most recent 100 snapshots so local JSON documents remain predictable while still preserving long-running edit history.

## 11. Testing & Browser Interaction Best Practices
- **Temporary Test Diagrams**: To prevent binding failures, corrupted workspace states, or broken diagrams during interactive browser testing, you MUST always create a new, temporary diagram/flowchart at the start of your test session.
- **Cleanup**: Once your browser testing is completed and verified, you MUST delete or purge the temporary diagram/flowchart to restore the workspace to its clean, original state.


## 10. Global Keyboard Shortcuts
- **Keyboard-Driven Canvas Deletion**: When a diagram node or flowchart edge/line is selected, users can press `Backspace` or `Delete` on their keyboard to instantly delete it from the diagram canvas and Mermaid code.
- **Form/Input and Code Isolation**: The keydown event listener is completely disabled when any input, textarea, contenteditable container, or the Monaco Editor has focus. This prevents elements from being accidentally deleted while typing comments or updating diagram text code.
- **Canvas Focus Blur**: To ensure that selecting canvas elements (which are SVG elements and not focusable by default) immediately enables deletion shortcuts without being blocked by active Monaco editor focus, clicking any canvas element or empty space (inside `handleSvgClick`) programmatically blurs the active text input or editor via `document.activeElement.blur()`. This shifts browser focus away from Monaco/inputs to the document body, activating the deletion listeners safely.

## 13. Exit Confirmation
- **Leave Editor Notice Dialog**: Internal navigation away from the current editor route uses a confirmation dialog before routing, requiring explicit user confirmation (`Leave Editor`) or cancellation (`Stay`).
- **Browser Exit Prompt**: Refreshing or closing the tab while in the editor triggers the browser-native `beforeunload` confirmation prompt.
- **Browser Back Button Guard**: Pressing the browser back button inside the editor is intercepted and routed through the same leave-editor confirmation dialog before navigation is allowed.




