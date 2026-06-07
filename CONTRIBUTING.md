# Contributing to LiveMaid

Thank you for your interest in contributing! This document covers everything you need to get the project running locally, understand the workflow, and submit a pull request.

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

## 🤝 Contribution Workflow

We follow a strict **Feature Branch Workflow** with **Squash and Merge**.

1. **Create a Feature Branch**: When starting a new epic or feature, branch off from `main` (e.g., `git checkout -b feature/your-epic-name`).
2. **Develop & Commit**: Make your changes and use Conventional Commits (e.g., `feat: ...`, `fix: ...`).
3. **Raise a Pull Request**: Once complete, raise a Pull Request targeting `main`. The **PR title must follow Conventional Commits** (see below) — because we squash and merge, the PR title becomes the commit message on `main`.
4. **Squash and Merge**: Merge the PR using the **"Squash and merge"** option. This keeps the `main` history perfectly clean with one commit per epic.
5. **Delete the Branch**: After merging, delete the feature branch. Do not reuse it. Future changes require branching off `main` again.

_(Note: PRs currently do not require a reviewer, but mandatory reviews will be enforced once there is more than one contributor)._

## ✏️ Pull Request Titles

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
- Action: installs dependencies and runs type checking, linting, format check, and build.
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
