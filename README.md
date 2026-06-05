# LiveMaid 🧜‍♀️

**The WYSIWYG Mermaid Editor**

LiveMaid is a modern, local web application designed to make creating, editing, and managing [Mermaid](https://mermaid.js.org/) diagrams a breeze. Built with Next.js and React, it provides a seamless visual workspace for developers, architects, and anyone who needs to quickly generate diagrams from code.

## 🎯 Purpose

Writing Mermaid code can sometimes be tedious without immediate visual feedback. The purpose of LiveMaid is to provide a local, fast, and intuitive environment where you can write Mermaid syntax and instantly see the rendered diagrams. It acts as a personal diagram management dashboard, allowing you to organize all your charts, flowcharts, and sequence diagrams in one place without relying on external cloud services.

## ✨ Features

* **Live WYSIWYG Editor:** Instantly preview your Mermaid diagrams as you type.
* **Diagram Management:** Easily create, rename, and delete diagrams from a centralized dashboard.
* **Powered by Monaco:** Enjoy a rich coding experience with the integrated Monaco Editor.
* **Dark Mode Support:** Toggle between light and dark themes for comfortable viewing anytime.
* **Modern Stack:** Built on top of Next.js, React 19, and styled with Tailwind CSS & shadcn/ui.
* **Demo Mode:** Run a read-only public-facing instance pre-loaded with sample diagrams — changes are never persisted.

## 🚀 Getting Started

Follow these instructions to set up the project locally for development.

### Prerequisites

* Node.js (v18 or higher recommended)
* npm (or yarn, pnpm, bun)

### Installation

1. Ensure you are in the project root directory:
   ```bash
   cd livemaid
   ```

2. Install the dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

### Running the Development Server

Start the local development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

The application auto-updates as you edit the files in the `src/` directory.

## 🤝 Contribution Guidelines

We follow a strict **Feature Branch Workflow** with **Squash and Merge**.

1. **Create a Feature Branch**: When starting a new epic or feature, branch off from `main` (e.g., `git checkout -b feature/your-epic-name`).
2. **Develop & Commit**: Make your changes and use Conventional Commits (e.g., `feat: ...`, `fix: ...`).
3. **Raise a Pull Request**: Once complete, raise a Pull Request targeting `main`.
4. **Squash and Merge**: Merge the PR using the **"Squash and merge"** option. This keeps the `main` history perfectly clean with one commit per epic.
5. **Delete the Branch**: After merging, delete the feature branch. Do not reuse it. Future changes require branching off `main` again.

*(Note: PRs currently do not require a reviewer, but mandatory reviews will be enforced once there is more than one contributor).*

## 🔄 CI/CD Flow

This repository follows the flow:

**PR Raised → PR Check → PR Deployment → Merge → Release → Sandbox Deployment**

### 1) PR Raised
- Open a pull request targeting `main`.

### 2) PR Check
- Workflow: `ci/pr-checks` (`.github/workflows/pr-checks.yml`)
- Trigger: `pull_request` on `main`
- Action: installs dependencies and runs `npm run build`.

### 3) PR Deployment (Preview Environment)
- Workflow: `cd/railway-pr-preview` (`.github/workflows/railway-deploy-pr-review.yml`)
- Trigger: successful completion of `ci/pr-checks` for pull requests (`workflow_run`)
- Action: creates Railway preview environment `pr-<PR_NUMBER>` when missing, then deploys the PR branch source to that preview environment.
- Cleanup: on PR close/merge, the same workflow deletes `pr-<PR_NUMBER>`.

### 4) Merge
- Merge PR into `main` (recommended: squash and merge).

### 5) Release
- Workflow: `ci/release` (`.github/workflows/docker-publish.yml`)
- Trigger: `push` to `main`
- Action: builds and publishes Docker image to GHCR, then creates a GitHub Release (`v1.0.<run_number>`).

### 6) Sandbox Deployment
- Workflow: `cd/railway-sandbox` (`.github/workflows/railway-deploy-sandbox.yml`)
- Trigger: successful completion of `ci/release` (`workflow_run`)
- Action: deploys latest release to Railway sandbox service.

## 🐳 Deployment (Docker)

LiveMaid is containerized and available on the GitHub Container Registry. Since it uses local file storage, you can easily deploy it on any server (like Ubuntu) using Docker Compose while retaining your data.

### Option 1: Manual Docker Compose

1. Create a `docker-compose.yml` file on your server:
   ```yaml
   version: '3.8'

   services:
     livemaid:
       image: ghcr.io/peter6055/livemaid:latest
       container_name: livemaid
       ports:
         - "3000:3000"
       volumes:
         # Maps local ./data folder to container for persistent diagram storage
         - ./data:/app/data
       environment:
         - NODE_ENV=production
       restart: unless-stopped
   ```

2. Start the container:
   ```bash
   docker-compose up -d
   ```

Your diagrams will be saved permanently in the `./data` folder on your server!

### Option 2: Demo Mode

Demo mode lets you run a **public, read-only instance** of LiveMaid pre-loaded with sample diagrams. Visitors can freely explore and edit diagrams in-browser, but nothing is ever persisted to disk.

**How it works:**
- Diagrams are read from the `./demo/` folder instead of `./data/`.
- All write operations (create, save, delete) are silently disabled on both the server and the client.
- A persistent amber banner is displayed on every page informing users they are in demo mode.

**Setup:**

1. Populate the `./demo/` folder with sample diagram JSON files (same format as `./data/`).

2. Run the demo service defined in the included `docker-compose.yml`:
   ```bash
   docker-compose up -d livemaid-demo
   ```
   This starts the demo instance on port `3001` with `DEMO_MODE=true` and mounts `./demo` as read-only.

   Alternatively, pass the environment variables yourself:
   ```yaml
   services:
     livemaid-demo:
       image: ghcr.io/peter6055/livemaid:latest
       ports:
         - "3001:3000"
       volumes:
         - ./demo:/app/demo:ro
       environment:
         - NODE_ENV=production
         - DEMO_MODE=true
         - NEXT_PUBLIC_DEMO_MODE=true
       restart: unless-stopped
   ```

> **Note:** Both `DEMO_MODE` (server-side) and `NEXT_PUBLIC_DEMO_MODE` (client-side) must be set to `"true"` for the full demo experience. `NEXT_PUBLIC_DEMO_MODE` controls the visible banner and disabled UI buttons; `DEMO_MODE` controls the server-side storage path and write guards.

## 🛠️ Tech Stack

* [Next.js](https://nextjs.org/)
* [React](https://react.dev/)
* [Mermaid.js](https://mermaid.js.org/)
* [Monaco Editor](https://microsoft.github.io/monaco-editor/)
* [Tailwind CSS](https://tailwindcss.com/)
* [shadcn/ui](https://ui.shadcn.com/)

## 💖 Support the Community

If you plan to use this editor for commercial purposes or in an enterprise environment, we highly encourage you to support the Mermaid community by purchasing a [Mermaid Chart / Mermaid.ai](https://www.mermaidchart.com/) subscription. Your support helps sustain the continued development of the incredible diagramming tool that powers this application!
