# LiveMaid 🧜‍♀️

**The WYSIWYG Mermaid Editor**

LiveMaid is a modern, local web application designed to make creating, editing, and managing [Mermaid](https://mermaid.js.org/) diagrams a breeze. Built with Next.js and React, it provides a seamless visual workspace for developers, architects, and anyone who needs to quickly generate diagrams from code.

## 🎯 Purpose

Writing Mermaid code can sometimes be tedious without immediate visual feedback. The purpose of LiveMaid is to provide a local, fast, and intuitive environment where you can write Mermaid syntax and instantly see the rendered diagrams. It acts as a personal diagram management dashboard, allowing you to organize all your charts, flowcharts, and sequence diagrams in one place without relying on external cloud services.

## ✨ Features

- **Live WYSIWYG Editor:** Instantly preview your Mermaid diagrams as you type.
- **Diagram Management:** Easily create, rename, and delete diagrams from a centralized dashboard.
- **Powered by Monaco:** Enjoy a rich coding experience with the integrated Monaco Editor.
- **Dark Mode Support:** Toggle between light and dark themes for comfortable viewing anytime.
- **Modern Stack:** Built on top of Next.js, React 19, and styled with Tailwind CSS & shadcn/ui.
- **Demo Mode:** Run a read-only public-facing instance pre-loaded with sample diagrams — changes are never persisted.

## 🚀 Getting Started

Follow these instructions to set up the project locally for development.

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (or yarn, pnpm, bun)

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
3. **Raise a Pull Request**: Once complete, raise a Pull Request targeting `main`. The **PR title must follow Conventional Commits** (see below) — because we squash and merge, the PR title becomes the commit message on `main`.
4. **Squash and Merge**: Merge the PR using the **"Squash and merge"** option. This keeps the `main` history perfectly clean with one commit per epic.
5. **Delete the Branch**: After merging, delete the feature branch. Do not reuse it. Future changes require branching off `main` again.

_(Note: PRs currently do not require a reviewer, but mandatory reviews will be enforced once there is more than one contributor)._

### Pull Request Titles

PR titles are validated automatically by the `ci/pr-title` workflow and must follow the [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>(optional scope): <description>`.

- **Allowed types:** `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`.
- **Be concise and descriptive**, using the imperative mood and starting the description with a lowercase letter.
- **Reference issues** when applicable.

Examples:

- ✅ `feat: implement user profile view (closes #123)`
- ✅ `fix: resolve null pointer error in authentication module`
- ✅ `docs: update usage examples for API endpoints`
- ❌ `fix bug` (missing type, not descriptive)
- ❌ `feat: Add CSV export` (description should not start with an uppercase letter)

## 🔄 CI/CD Flow

This repository follows the flow:

**PR Raised → PR Check → Merge → Release → Sandbox Deployment**

### 1) PR Raised

- Open a pull request targeting `main`.

### 2) PR Check

- Workflow: `ci/pr-checks` (`.github/workflows/pr-checks.yml`)
- Trigger: `pull_request` on `main`
- Action: installs dependencies and runs `npm run build`.
- Workflow: `ci/pr-title` (`.github/workflows/pr-title.yml`)
- Trigger: `pull_request_target` (opened / edited / synchronize / reopened)
- Action: validates the PR title follows Conventional Commits via [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request).

### 3) Merge

- Merge PR into `main` (recommended: squash and merge).

### 4) Release

- Workflow: `ci/release` (`.github/workflows/docker-publish.yml`)
- Trigger: `push` to `main`
- Action: builds and publishes Docker image to GHCR, then creates a GitHub Release (`v1.0.<run_number>`).

### 5) Sandbox Deployment

- Workflow: `cd/railway-sandbox` (`.github/workflows/railway-deploy-sandbox.yml`)
- Trigger: successful completion of `ci/release` (`workflow_run`)
- Action: deploys latest release to Railway sandbox service.

## 🐳 Deployment (Docker)

LiveMaid is containerized and available on the GitHub Container Registry. Since it uses local file storage, you can easily deploy it on any server (like Ubuntu) using Docker Compose while retaining your data.

### Manual Docker Compose

1. Create a `docker-compose.yml` file on your server:

   ```yaml
   version: "3.8"

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

### Demo Mode

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

   Alternatively, pass the environment variable yourself:

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
       restart: unless-stopped
   ```

> **Note:** Only `DEMO_MODE=true` is required. It is read at **runtime** (the
> dashboard and editor pages opt out of static prerendering via `connection()`),
> so it works on platforms like Railway that inject env vars at container start.
> `DEMO_MODE` controls everything: the server-side storage path, the write
> guards, and — passed down as a prop to the client — the demo banner, the
> disabled write buttons, and the read-only labels.

## 🛠️ Tech Stack

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Mermaid.js](https://mermaid.js.org/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)

## 💖 Support the Community

If you plan to use this editor for commercial purposes or in an enterprise environment, we highly encourage you to support the Mermaid community by purchasing a [Mermaid Chart / Mermaid.ai](https://www.mermaidchart.com/) subscription. Your support helps sustain the continued development of the incredible diagramming tool that powers this application!
