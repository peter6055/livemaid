---
sidebar_position: 1
slug: /
---

# Introduction

LiveMaid is a local, fast, and intuitive environment where you can write [Mermaid](https://mermaid.js.org/) syntax and instantly see the rendered diagrams. It acts as a personal diagram management dashboard, allowing you to organize all your charts, flowcharts, and sequence diagrams in one place without relying on external cloud services.

:::warning

This project began as a side project and is not production-grade. You may encounter bugs or incomplete behavior.

:::

## Features

- **Live WYSIWYG Editor:** Write Mermaid code and see the rendered diagram update in real time.
- **Two-Way Visual Editing:** Click nodes, edges, and participants directly on the canvas to rename labels, change shapes/styles, reorder, or delete — all changes write back to the code instantly.
- **Capability-Aware Creation:** Start from guided templates, create an intentional blank workspace, or create code-only Mermaid diagram types from the New Diagram flow.
- **Blank Diagram State:** Empty diagrams open as a friendly blank workspace with starter-template actions instead of a Mermaid syntax error.
- **Diagram Management:** Create, rename, delete, star, and organize diagrams from a centralized dashboard, with folder support and All Files / Recent / Starred quick views.
- **Dashboard Workflow:** Open diagrams from the dashboard in a new browser tab so the file browser stays available.
- **Powered by Monaco:** Enjoy a rich code-editing experience with Mermaid syntax highlighting, powered by the Monaco Editor.
- **Dark Mode Support:** Toggle between light and dark themes for comfortable viewing anytime.
- **Modern Stack:** Built on Next.js, React 19, and styled with Tailwind CSS & shadcn/ui.
- **Demo Mode:** Run a read-only public-facing instance pre-loaded with sample diagrams — changes are never persisted.

## Requirements

For local development, LiveMaid requires:

- Node.js 20 or newer
- npm 10 or newer

For Docker deployment, use Docker Engine with Docker Compose support. The published container image runs the production app on Node.js 20.

## Tech Stack

LiveMaid is built on the following technologies:

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Mermaid.js](https://mermaid.js.org/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)

## Getting help

- Browse the docs using the sidebar.
- Report issues on [GitHub](https://github.com/peter6055/livemaid/issues).
- Read the [license summary](./project/license.md) and the full [`LICENSE`](https://github.com/peter6055/livemaid/blob/main/LICENSE) before using, modifying, redistributing, or offering LiveMaid as a service.
