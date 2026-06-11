# LiveMaid Architecture & Conventions

This document outlines the core principles and technical decisions made for the LiveMaid project. It serves as a reference for future development to ensure consistency.

## 1. Storage Principle: Local-First Today, Document-DB Ready

LiveMaid currently runs entirely locally with **no external database**, but the persistence layer is deliberately structured as a **document store** so it can migrate to MongoDB (or any document DB) without touching API routes or the frontend.

- **Storage Medium (current)**: Each diagram is a `.json` document under `data/<id>.json`; each folder under `data/folders/<id>.json`. One file == one document, keyed by a `nanoid` id.
- **Why local-first first?**: To eliminate backend infrastructure, authentication, and external dependencies for the initial product — trivial to run via Docker or `npm run dev`.
- **Document-oriented model (migration-ready)**: The data shapes (`DiagramDocument`, `Folder`) are already document-shaped — top-level records with **embedded sub-documents** (`subPages`, `comments`, `versionHistory`) and nullable reference ids (`folderId`, `parentId` as an adjacency-list tree). This maps 1:1 onto MongoDB collections, so moving to a document DB is a backend swap, not a redesign.
- **Soft Deletion**: Soft deletion (`deletedAt` timestamp) instead of hard deletion to prevent accidental data loss. In Mongo this becomes a `deletedAt: null` filter / partial index.
- **Version History**: Saved diagrams retain an append-only `versionHistory` array (capped at 100) for rollback. (Migration note: for a document-DB backend at scale this array should be promoted to its own `versions` collection to avoid unbounded document growth — see §1a.)
- **Version Metadata**: Version history entries carry lightweight UI metadata (user label, starred) without changing the storage model.

### 1a. Storage Adapter Architecture (the migration seam)

All persistence goes through a single **`StorageAdapter` interface**, never the file system directly:

- **`src/lib/api/storageTypes.ts`** — domain types (`DiagramDocument`, `Folder`, `VersionHistoryEntry`), `normalize*` hydration helpers, the `IS_DEMO_MODE` flag, and the `StorageAdapter` interface (the full persistence contract: `getDiagrams`/`getDiagram`/`saveDiagram`/`deleteDiagram` + the `Folder` equivalents + `deleteFolderCascade`).
- **`src/lib/api/storageFsAdapter.ts`** — `createFileSystemStorageAdapter()`, the only module that imports `fs`. Owns `data/` vs `demo/` selection and the demo-mode write no-ops.
- **`src/lib/api/storage.ts`** — the public façade everything imports (`@/lib/api/storage`). Re-exports the types and delegates each function to the active adapter. **Swapping backends is a one-line change here** (`createFileSystemStorageAdapter()` → `createMongoStorageAdapter()`); API routes and the frontend keep their identical imports.

**To migrate to MongoDB**: implement `createMongoStorageAdapter()` against the same interface (`replaceOne`/`findOne`/`find({deletedAt:null})`, indexes on `folderId`/`parentId`/`deletedAt`/`updatedAt`, atomic `findOneAndUpdate`, `deleteFolderCascade` as two `updateMany` in a transaction), promote `versionHistory` to a `versions` collection, and flip the one line in `storage.ts`.

> **Migration is DEFERRED** — we stay on the file-system backend for now. The full findings, the
> current-model → MongoDB mapping, the step-by-step migration, and the one real design change
> (splitting `versionHistory` into its own `versions` collection) are documented in
> [`reference/MONGODB_MIGRATION_PLAN.md`](./MONGODB_MIGRATION_PLAN.md). Execute that when we decide
> to move to MongoDB.

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
- **Decoupled Diagram Logic**: Each diagram type is isolated into its own file (e.g., `src/lib/diagrams/flowchart.tsx`) and exports a `DiagramPlugin` interface. This plugin dictates diagram-specific behavior, default code, and renders its own interactive toolbars on top of the canvas. **Currently implemented two-way plugins**: `flowchart.tsx`, `sequence.tsx`, `classDiagram.tsx`, `erDiagram.tsx`, and `stateDiagram.tsx`, all registered in `src/lib/diagrams/registry.ts`. Other Mermaid diagram types still render correctly but remain visual-only on the canvas. **Plugin module rule**: plugin files must NOT carry the `"use client"` directive — the registry is imported server-side by `POST /api/diagrams` to read `defaultCode`, and a client-module export reads back as `undefined` there (see `reference/DIAGRAM_PLUGIN_DETAILS.md`).
- **Parallel Agent Workflows**: Because diagram logic is decoupled, multiple AI agents or human developers can work on _different diagram types in parallel_ without causing merge conflicts in a central file. A new diagram type only needs its own `<type>.tsx` plugin plus an entry in `src/lib/diagrams/registry.ts` (e.g. a future `mindmap.tsx` or `gantt.tsx`).
