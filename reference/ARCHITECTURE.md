# LiveMaid Architecture & Conventions

This document outlines the core principles and technical decisions made for the LiveMaid project. It serves as a reference for future development to ensure consistency.

## 1. Local-First Storage Principle
LiveMaid is designed to run entirely locally without a traditional database (e.g., PostgreSQL, MongoDB). 
- **Storage Medium**: Files are saved as `.json` documents directly into the local `data/` directory.
- **Why?**: To eliminate the need for complex backend infrastructure, authentication, and external dependencies. This makes it trivial to run via Docker or a simple `npm run dev`.
- **Soft Deletion**: We implement soft deletion (`deletedAt` timestamp) rather than hard deletion to prevent accidental data loss.

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
- **Premium Feel**: The application enforces a dark mode by default (`bg-slate-950`), utilizing glassmorphism, subtle borders (`border-slate-800`), and smooth transitions (`transition-all`).
- **Micro-interactions**: Components like cards and nodes have hover states, subtle scaling, and opacity changes to feel alive and responsive.
- **No Placeholders**: We use functional, aesthetic components instead of generic placeholders.

## 5. Development Workflow
- **Event Handling Caution**: `react-zoom-pan-pinch` actively intercepts and swallows certain standard DOM events (like `onDoubleClick` when double-click-to-zoom is disabled). When building new interactive features over the canvas, prefer calculating synthetic interactions inside standard `onClick`/`onMouseDown` handlers.
- **Adding Diagram Support**: Supporting new diagram types involves examining the specific SVG DOM structure Mermaid generates for that diagram type (since IDs and class names vary wildly between flowcharts, sequence diagrams, etc.), and writing resilient Regex string-replacers for the code serializer.
- Ensure the `data/` directory is excluded from version control if needed, or handled correctly in Docker volumes.
