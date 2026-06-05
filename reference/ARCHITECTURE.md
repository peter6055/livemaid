# LiveMaid Architecture & Conventions

This document outlines the core principles and technical decisions made for the LiveMaid project. It serves as a reference for future development to ensure consistency.

## 1. Local-First Storage Principle
LiveMaid is designed to run entirely locally without a traditional database (e.g., PostgreSQL, MongoDB). 
- **Storage Medium**: Files are saved as `.json` documents directly into the local `data/` directory.
- **Why?**: To eliminate the need for complex backend infrastructure, authentication, and external dependencies. This makes it trivial to run via Docker or a simple `npm run dev`.
- **Soft Deletion**: We implement soft deletion (`deletedAt` timestamp) rather than hard deletion to prevent accidental data loss.
- **Version History**: Saved diagram documents retain an append-only `versionHistory` array so users can roll back to a previous save without leaving the local-file storage model.
- **Version Metadata**: Version history entries can carry lightweight UI metadata such as a user-defined label and starred state without changing the storage model.

## 2. Editor Architecture: The Split-Screen WYSIWYG
The editor interface uses a resizable split-screen layout (`react-resizable-panels`).
- **Left Pane (Source of Truth)**: Monaco Editor (`@monaco-editor/react`). The text code is the ultimate source of truth for the diagram state.
- **Right Pane (Visual Canvas)**: Native Mermaid SVG rendering + `react-zoom-pan-pinch`. This provides an infinite, pannable, and zoomable canvas containing the raw SVG.
- **Bidirectional Editing via SVG Overlays**: 
  - Instead of utilizing heavy canvas libraries like React Flow, we inject the raw Mermaid SVG (`mermaid.render()`) directly into the DOM.
  - We listen to click events on the SVG elements, map the `e.target` to its corresponding Mermaid node/edge ID, and dynamically render React UI overlays (selection bounding boxes, quick-add handles, inline text editors) seamlessly on top of the exact SVG coordinates.
  - When visual edits occur (e.g., typing in the inline editor or clicking the `+` button), a regex-based custom parser/serializer updates the raw code in the Monaco Editor, which triggers a re-render of the SVG.
- **Auto-Layout**: Handled natively by Mermaid.js under the hood. No manual position dragging is required by the user.

## 3. Tech Stack
- **Framework**: Next.js App Router (using API routes to interface with the local file system).
- **Styling**: Tailwind CSS v4.
- **Components**: `shadcn/ui` (accessible, customizable, and unstyled base components).
- **Icons**: `lucide-react`.

## 4. UI/UX Aesthetics
- **Premium Feel**: The application is designed dark-first using deep slates for surfaces, glassmorphism, subtle borders, and smooth transitions (`transition-all`). The actual runtime theme follows the user's OS preference: `next-themes` is configured with `defaultTheme="system"` + `enableSystem` (see `src/app/layout.tsx`), so the app renders dark when the OS is dark and light when the OS is light. The visual canvas surface stays white in both themes for Mermaid readability.
- **Micro-interactions**: Components like cards and nodes have hover states, subtle scaling, and opacity changes to feel alive and responsive.
- **No Placeholders**: We use functional, aesthetic components instead of generic placeholders.
- **Full Design Specification**: Complete color tokens, typography scale, component styles, and interaction guidelines are in `reference/DESIGN.md`. Always consult it before adding new UI surfaces.

## 5. Development Workflow
- **Event Handling Caution**: `react-zoom-pan-pinch` + Mermaid SVG/`foreignObject` can swallow or bypass expected React bubbling paths (especially for single-click on labels). Critical selection/edit transitions must be routed through one centralized handler (`handleSvgClick`) and may require a document-level capture fallback (`mousedown`, capture phase) that forwards a synthetic event including `detail`.
- **Double-Click Truth**: Do not rely on native `onDoubleClick` alone for canvas edit entry. Keep a click-detail (`e.detail >= 2`) path in the centralized handler so double-click-to-edit remains reliable even when native dblclick propagation is inconsistent.
- **Adding Diagram Support**: Supporting new diagram types involves examining the specific SVG DOM structure Mermaid generates for that diagram type (since IDs and class names vary wildly between flowcharts, sequence diagrams, etc.), and writing resilient Regex string-replacers for the code serializer.
- Ensure the `data/` directory is excluded from version control if needed, or handled correctly in Docker volumes.

## 6. Diagram Plugin Architecture & Parallel Development
LiveMaid avoids using centralized object-oriented inheritance (e.g., `class DiagramBase`) for diagram behaviors. Instead, we use a **Composition / Plugin Architecture** built on functional React components.

- **Centralized Shared Behavior**: Core canvas logic (infinite pan/zoom, coordinate mapping, and two-way sync synchronization) is centralized in `LiveMaidEditor` and shared custom hooks (`useEditorState`, `useCanvasInteraction`).
- **Decoupled Diagram Logic**: Each diagram type is isolated into its own file (e.g., `src/lib/diagrams/flowchart.tsx`) and exports a `DiagramPlugin` interface. This plugin dictates diagram-specific behavior, default code, and renders its own interactive toolbars on top of the canvas. **Currently implemented plugins**: `flowchart.tsx` and `sequence.tsx`, both registered in `src/lib/diagrams/registry.ts`. All other Mermaid diagram types render correctly but are visual-only (one-way sync).
- **Parallel Agent Workflows**: Because diagram logic is decoupled, multiple AI agents or human developers can work on *different diagram types in parallel* without causing merge conflicts in a central file. A new diagram type only needs its own `<type>.tsx` plugin plus an entry in `src/lib/diagrams/registry.ts` (e.g. a future `mindmap.tsx` or `gantt.tsx`).
