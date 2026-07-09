# Contributing to LiveMaid

Thank you for your interest in contributing! This document covers everything you need to get the project running locally, understand the workflow, submit a pull request, and understand the project's licensing and contribution policy.

## Table of Contents

- [📜 Licensing & Contribution Policy](#-licensing--contribution-policy)
  - [Private Modifications](#private-modifications)
  - [Contributing Back Upstream](#contributing-back-upstream)
  - [Licensing of Contributions](#licensing-of-contributions)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Development Server](#running-the-development-server)
- [🤝 Contribution Workflow](#-contribution-workflow)
- [✏️ Pull Request Titles](#️-pull-request-titles)
- [🔄 CI/CD Flow](#-cicd-flow)
  - [1) PR Raised](#1-pr-raised)
  - [2) PR Check](#2-pr-check)
  - [3) PR Preview Environment (Railway)](#3-pr-preview-environment-railway)
  - [4) Merge](#4-merge)
  - [5) Release](#5-release)
    - [Automatic versioning from the PR title](#automatic-versioning-from-the-pr-title)
  - [6) Sandbox Deployment](#6-sandbox-deployment)

## 📜 Licensing & Contribution Policy

LiveMaid is distributed under the [LiveMaid Source Available License 1.0 (LSAL-1.0)](LICENSE). It is **source-available** software, not OSI open-source software. Please read the LICENSE file before contributing.

### Private Modifications

You are **free to make private or internal modifications** to LiveMaid without any obligation to upstream or share those changes. The license explicitly allows private modifications. You do not need to open a PR for changes you keep private.

### Contributing Back Upstream

Contributing back to this project is **optional but very welcome**. If you choose to contribute:

- Submit changes via **Pull Request (PR) to this repository**, targeting the `main` branch.
- PRs are subject to the contribution workflow and CI checks described below.
- By submitting a PR you confirm that you have the right to contribute the code under the project's license (see [Licensing of Contributions](#licensing-of-contributions) below).

### Licensing of Contributions

By submitting a Pull Request, you confirm that:

- You have the right to contribute the submitted code.
- Your contribution may be distributed under the [LSAL-1.0](LICENSE) license governing this repository.
- You are not required to assign copyright — you retain ownership of your contribution — but you grant the project the right to use it under LSAL-1.0.

## 🚀 Getting Started

Follow these instructions to set up the project locally for development.

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer

### Installation

Ensure you are in the project root directory:

```bash
cd livemaid
```

Install the dependencies:

```bash
npm install
```

### Running the Development Server

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:3434](http://localhost:3434) with your browser to see the dashboard.

The application auto-updates as you edit the files in the `src/` directory.

## 🤝 Contribution Workflow

We follow a strict **Feature Branch Workflow** with **Squash and Merge**.

1. **Create a Feature Branch**: When starting a new epic or feature, branch off from `main` (e.g., `git checkout -b feature/your-epic-name`).
2. **Develop & Commit**: Make your changes and use Conventional Commits (e.g., `feat: ...`, `fix: ...`).
3. **Raise a Pull Request**: Once complete, raise a Pull Request targeting `main`. The **PR title must follow Conventional Commits** (see below) — because we squash and merge, the PR title becomes the commit message on `main`.
4. **Squash and Merge**: Merge the PR using the **"Squash and merge"** option. This keeps the `main` history perfectly clean with one commit per epic.

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

This repository follows the pipeline below — from raising a PR through to the sandbox deployment:

```mermaid
flowchart TD
    A([PR raised → main]) --> B[ci/pr-checks<br/>typecheck · lint · format · build]
    A --> C[ci/pr-title<br/>validate Conventional Commit title]
    A --> P[Railway bot<br/>ephemeral PR preview environment]
    P -. on PR close/merge .-> Q[Railway bot<br/>tear down preview environment]
    B --> D{All checks green?}
    C --> D
    D -->|No| A
    D -->|Yes| E[Squash &amp; merge to main]
    E --> F[ci/release<br/>compute SemVer from PR title]
    F --> G{Release-worthy<br/>type?}
    G -->|No: docs / chore / …| H([No release])
    G -->|Yes: feat / fix / perf / breaking| I[Build &amp; push Docker image to GHCR<br/>tag vX.Y.Z · GitHub Release · changelog]
    I --> J[cd/railway-sandbox<br/>deploy to Railway sandbox]
```

### 1) PR Raised

- Open a pull request targeting `main`.

### 2) PR Check

Every PR must pass the following required checks before it can be merged:

| Check                              | Workflow / Job                          | What it enforces                                                                                                                           |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Type check**                     | `ci/pr-checks` → _Lint, format & types_ | TypeScript compiles with no type errors.                                                                                                   |
| **Lint**                           | `ci/pr-checks` → _Lint, format & types_ | ESLint reports no errors.                                                                                                                  |
| **Format check**                   | `ci/pr-checks` → _Lint, format & types_ | The tree is Prettier-formatted (run `npm run format` to fix drift).                                                                        |
| **Build**                          | `ci/pr-checks` → _Build_                | The production build succeeds.                                                                                                             |
| **PR title (Conventional Commit)** | `ci/pr-title`                           | PR title follows Conventional Commits via [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request). |

> 💡 Run `npm run prepush` locally before pushing to run all four checks (typecheck, lint, format check, build) and catch failures early.

### 3) PR Preview Environment (Railway)

- Handled by: the **Railway GitHub bot** (Railway's native PR Environments), not a workflow in this repo.
- Trigger: opening / updating a pull request.
- Action: Railway automatically spins up an ephemeral preview environment for the PR, redeploys it on each push, and **destroys it when the PR is closed or merged**. The bot posts the preview URL and deployment status directly on the PR.

> ℹ️ Because this is managed by Railway's GitHub integration, there is nothing to maintain in `.github/workflows/`. Enable or disable it from the Railway project settings (PR environments).

### 4) Merge

- Merge PR into `main` (squash and merge).

### 5) Release

- Workflow: `ci/release` (`.github/workflows/docker-publish.yml`)
- Trigger: `push` to `main`
- Action: derives the next [SemVer](https://semver.org/) version from the squashed merge commit (the PR title), builds and publishes the Docker image to GHCR, then creates a GitHub Release tagged `vX.Y.Z`.

#### Automatic versioning from the PR title

Because we **squash and merge**, the PR title — already validated by `ci/pr-title` to be a Conventional Commit — becomes the single commit message on `main`. The `ci/release` workflow reads that commit's `type` and bumps the version accordingly, then tags, releases, and generates a changelog automatically. No manual version bumping required.

| PR title prefix                                                               | SemVer bump           | Example: `1.4.2` → |
| ----------------------------------------------------------------------------- | --------------------- | ------------------ |
| `fix:`, `perf:`                                                               | **patch**             | `1.4.3`            |
| `feat:`                                                                       | **minor**             | `1.5.0`            |
| `feat!:` / `<type>!:` / `BREAKING CHANGE`                                     | **major**             | `2.0.0`            |
| `docs:`, `chore:`, `ci:`, `style:`, `refactor:`, `test:`, `build:`, `revert:` | **none** (no release) | `1.4.2`            |

```mermaid
flowchart LR
    A[PR opened] --> B[ci/pr-title validates<br/>Conventional title]
    B --> C[Squash & merge to main]
    C --> D[ci/release reads<br/>merge commit message]
    D --> E{Determine bump<br/>from type}
    E -->|feat| F[minor]
    E -->|fix / perf| G[patch]
    E -->|BREAKING| H[major]
    E -->|docs / chore / ...| N[no release]
    F --> I[Tag vX.Y.Z +<br/>GitHub Release + changelog]
    G --> I
    H --> I
```

The new version is computed from the latest existing `vX.Y.Z` git tag (defaulting to `v0.0.0` when none exist), so releases stay continuous across merges.

### 6) Sandbox Deployment

- Workflow: `cd/railway-sandbox` (`.github/workflows/railway-deploy-sandbox.yml`)
- Trigger: successful completion of `ci/release` (`workflow_run`)
- Action: deploys latest release to Railway sandbox service.
