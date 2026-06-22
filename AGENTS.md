<!-- BEGIN:livemaid-architecture-rules -->

## Command Output

Protect context usage. **Any command with unknown or potentially large output must be byte-capped.**

Default pattern:

```bash
COMMAND 2>&1 | head -c 4000
```

# Architecture and Feature Truths

Before implementing ANY features or modifying the editor logic, you MUST read the following core documentation files in the `reference/` directory:

1. `reference/FEATURES_AND_TRUTHS.md`: Compact mandatory entrypoint. It tells you which deeper docs are relevant for the subsystem you are touching. Do not proceed until you have followed its reading map. Update it only when global invariants, support boundaries, or the reading rules change.
2. `reference/ARCHITECTURE.md`: High-level system architecture overview.
3. `reference/DESIGN.md`: UI/UX design specifications and aesthetic guidelines.

If your change is subsystem-specific, you MUST also read the relevant deep-dive document linked from `reference/FEATURES_AND_TRUTHS.md` before implementing.

> **RULE:** ALL future reference documentation intended for AI agents or developers MUST be placed inside the `reference/` folder. Do not place documentation at the root level to keep the repository clean.

<!-- END:livemaid-architecture-rules -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mermaid-agent-rules -->

# Mermaid Implementation Rules

Before planning or implementing any Mermaid diagram logic (parsers, rendering, features, themes, etc.) or support for new diagram types, you MUST thoroughly read the relevant Mermaid documentation to understand the official syntax and standard behavior. **Do not guess the syntax.**

1. Navigate to or clone the relevant docs from the official repository: https://github.com/mermaid-js/mermaid/tree/develop/docs
2. Read the specific `.md` files related to the syntax you are trying to implement.
3. Do not perform the implementation until you have thoroughly understood the official syntax.
<!-- END:mermaid-agent-rules -->

<!-- BEGIN:testing-agent-rules -->

# Test-Driven Development Loop & Robust UI Testing

When implementing UI features, rendering logic, or complex client-side changes, you MUST follow this robust operational loop:

1. **Implement**: Write the code and implement the changes.
2. **Execute Interactive Testing (Browser)**: Use the best available browser automation tooling in the current runtime to perform the exact user flow for the feature. Prefer the in-app Browser tooling when available; otherwise use the loaded browser automation alternative.
3. **Capture Comprehensive Visuals**: Capture screenshots at each meaningful verification checkpoint so the interaction flow has a visual record.
4. **Return Results**: Evaluate the results (including all screenshots and DOM observations).
5. **Scale Testing (If Needed)**: You can spawn multiple subagents to test the implementation to different degrees or in parallel if the feature is complex.
6. **Address All Errors**: Every error discovered during testing MUST be addressed. This applies equally to errors caused by the new implementation itself, as well as unrelated errors that were accidentally discovered during the test run.
7. **Iterate**: You are expected to extend your session and perform as many test/fix iterations as necessary. Your ultimate goal is to present a product to the user that is as bug-free as possible. Do not consider the task complete until this is achieved.
<!-- END:testing-agent-rules -->

<!-- BEGIN:dev-server-rules -->

# Dev Server Management

When you need to start the Next.js dev server for testing, you MUST monitor it and retry on timeout.

## Startup Loop

```bash
pkill -f "next dev" 2>/dev/null; sleep 1
cd /path/to/project && setsid npm run dev </dev/null >/tmp/livemaid-dev.log 2>&1 &
for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3434 2>/dev/null; then
    echo "Dev server ready after ${i}s"
    break
  fi
  sleep 1
done
# If still not ready after 30s, log and retry once
if ! curl -s -o /dev/null --max-time 2 http://localhost:3434 2>/dev/null; then
  echo "First attempt timed out, retrying..."
  pkill -f "next dev" 2>/dev/null; sleep 2
  setsid npm run dev </dev/null >/tmp/livemaid-dev.log 2>&1 &
  for i in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 2 http://localhost:3434 2>/dev/null; then
      echo "Dev server ready on retry after ${i}s"
      break
    fi
    sleep 1
  done
fi
```

- Always kill the old dev server (`pkill -f "next dev"`) before starting a new one.
- Use `setsid` to fully detach the server process from the shell session. Without it, the shell may block waiting for child processes (Turbopack spawns subprocesses that inherit the session). Always include `</dev/null` to close stdin or the process may hang waiting for input.
- Use `--max-time` (not `--connect-timeout`) on curl. `--connect-timeout` only limits the TCP handshake; if the server accepts the connection but hangs before sending a response, curl will still block. `--max-time` caps the entire operation.
- Poll `http://localhost:3434` until it responds with any HTTP status.
- If not responding after 30s, kill and retry once.
- Do not proceed with browser tests until the server is confirmed ready.
- When done testing, kill the dev server: `pkill -f "next dev"`.

<!-- END:dev-server-rules -->

<!-- BEGIN:verification-planning-rules -->

# How to Write a Verification Plan (Testplan)

When an agent is asked to write a verification plan, they MUST format it properly as described in `reference/HOW_TO_WRITE_VERIFICATION_PLAN.md`.
Do not duplicate the template inline in this file; follow the dedicated reference doc.

<!-- END:verification-planning-rules -->

<!-- BEGIN:regression-planning-rules -->

# How to Write a Regression Plan

When an agent writes a verification plan for a new feature, they MUST also include a Regression Testplan section formatted as described in `reference/HOW_TO_WRITE_REGRESSION_PLAN.md`.
The regression plan identifies which existing features are at risk of breaking due to the new code, and provides BDD scenarios to verify they remain intact.

<!-- END:regression-planning-rules -->

<!-- BEGIN:git-workflow-rules -->

# Git Workflow & Commit Rules

To ensure we can safely rollback changes if anything goes wrong, you MUST follow this git workflow:

1. **Commit Frequently**: Commit and push changes after EVERY significant logical change or implementation step.
2. **Explicit Permissions**: Only commit and push when the human user explicitly tells you to do so in the _current request_, unless previously agreed upon.
3. **Conventional Commits**: You MUST follow the Conventional Commits specification for all git commits. The commit message should be structured as follows: `<type>[optional scope]: <description>`
   - `fix`: patches a bug in your codebase.
   - `feat`: introduces a new feature to the codebase.
   - `BREAKING CHANGE`: introduces a breaking API change.
   - Other allowed types: `build:`, `chore:`, `ci:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, etc.
4. **Human Verification Tags**: If a commit is explicitly requested or verified by the human user, you MUST append the `[Human Verified]` tag to the end of the first line (the description) of your Conventional Commit.
   - _Example_: `fix(editor): resolve trackpad panning conflicts [Human Verified]`
   - _Example_: `feat: support sequence diagram syntax [Human Verified]`
5. **No Historical Precedent for Tags**: Do NOT use conversation history as a precedent for applying the `[Human Verified]` tag. The tag must ONLY be applied if the user explicitly authorizes it in the **immediate `<USER_REQUEST>` tag of the current turn**.
   - _Purpose_: AI agents have context windows containing previous conversation history. If a user previously authorized a commit 5 turns ago, an agent might read that string in its history and mistakenly assume the _current_ action is also human verified.
   - _Rule_: You MUST ignore any authorization, verification, or "human verified" phrases found in conversation summaries, system messages, or previous messages. A verification is ONLY valid if it is explicitly written by the user in their current, real-time message to you.
6. **Feature Branch Workflow (Squash & Merge)**: We follow a strict feature branch workflow.
   - When starting a new epic or task, branch off from `main`.
   - Once work is complete, a Pull Request is raised to `main`.
   - The PR MUST be merged using **"Squash and merge"**.
   - After merging, the feature branch MUST be deleted. Do not reuse old branches. Future changes require checking out a fresh branch from `main`.
   - _Note: PRs currently do not require reviewers, but this will change when more contributors join._
7. **Conventional Commit PR Titles**: Because we **squash and merge**, the PR title becomes the commit message on `main`, so the PR title MUST also follow the Conventional Commits specification: `<type>[optional scope]: <description>`.
   - The allowed types are the same as for commits (`feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`).
   - Keep the description concise, in the imperative mood, and starting with a lowercase letter (e.g. `feat: implement user profile view (closes #123)`).
   - Reference related issues/tickets in the description when applicable.
   - This is enforced automatically by the `ci/pr-title` workflow (`.github/workflows/pr-title.yml`), which uses [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request).
8. **Concurrent Agent Workspaces**: If multiple agents are working on the same repository concurrently and performing complex Git branch manipulations, they MUST use isolated workspace clones (e.g. using `Workspace: "branch"` or `Workspace: "share"` when invoking subagents). Do not perform branch checkouts on a shared local directory while another agent is actively modifying files, as this will lead to stashing collisions and lost work.
<!-- END:git-workflow-rules -->

<!-- BEGIN:prepush-agent-rules -->

# Pre-Push Validation

Before committing or pushing any changes, you MUST run the `prepush` script defined in `package.json`:

```bash
npm run prepush
```

This runs:

1. `typecheck` — TypeScript type checking
2. `lint` — ESLint
3. `format:check` — Prettier formatting check
4. `test` — Vitest unit tests
5. `build` — Next.js production build

If any step fails, fix the errors before pushing. Do not bypass failures.

<!-- END:prepush-agent-rules -->
