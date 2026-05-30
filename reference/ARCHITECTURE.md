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
- **Right Pane (Visual Canvas)**: React Flow (`reactflow`). This provides the infinite, pannable, zoomable canvas.
- **Parser/Serializer**: 
  - A custom parser translates Mermaid syntax (`A --> B`) into React Flow nodes and edges.
  - A custom serializer takes visual interactions (like connecting two nodes) and appends the equivalent Mermaid syntax to the code editor.
- **Auto-Layout**: `dagre` is used to automatically position React Flow nodes. This removes the burden of "free dragging" from the user, as Mermaid natively handles layout automatically.

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
- When adding new diagram types (e.g., Sequence Diagrams), start by supporting "Live Preview" (Code -> Visual) first, as bidirectional visual editing (Visual -> Code) requires complex custom React Flow nodes for each specific Mermaid syntax.
- Ensure the `data/` directory is excluded from version control if needed, or handled correctly in Docker volumes.
