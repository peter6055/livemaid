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

## Two-Server Protocol

- **User's server** (port **3434**): runs via `npm run dev`. Never touch this.
- **Agent's test server** (port **3435**): runs via `npm run test:dev`. Agent starts/stops ONLY this.

Both `npm run dev` and `npm run test:dev` now automatically kill any existing process on their respective port before starting, so stale servers are cleaned up automatically.

**CRITICAL**: Never kill or interact with the user's server (port 3434, tmux session `livemaid`). The agent uses a separate port and tmux session (`livemaid-test`).

## Agent Test Server Startup

> **Note**: OpenCode's bash tool may hang when backgrounding processes with `&`.  
> Use `tmux` to fully decouple the server from the tool's process tree.

```bash
# Kill only the agent's old test server (NOT the user's server on 3434)
tmux kill-session -t livemaid-test 2>/dev/null

# Start agent's test server on port 3435 in a detached tmux session
# (port 3435 is automatically freed by the `test:dev` script)
cd /path/to/project && tmux new-session -d -s livemaid-test 'npm run test:dev'

# Poll until ready
for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3435 2>/dev/null; then
    echo "Dev server ready after ${i}s"
    break
  fi
  sleep 1
done

# Retry once if needed
if ! curl -s -o /dev/null --max-time 2 http://localhost:3435 2>/dev/null; then
  echo "First attempt timed out, retrying..."
  tmux kill-session -t livemaid-test 2>/dev/null
  tmux new-session -d -s livemaid-test 'npm run test:dev'
  for i in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 2 http://localhost:3435 2>/dev/null; then
      echo "Dev server ready on retry after ${i}s"
      break
    fi
    sleep 1
  done
  if ! curl -s -o /dev/null --max-time 2 http://localhost:3435 2>/dev/null; then
    echo "Dev server still unavailable after retry" >&2
    exit 1
  fi
fi
```

- Use `tmux new-session -d -s livemaid-test 'npm run test:dev'` to start the agent's server.
- Poll `http://localhost:3435` until it responds with any HTTP status.
- If not responding after 30s, kill and retry once.
- When done testing, kill ONLY the agent's server: `tmux kill-session -t livemaid-test`.
- Never run `pkill -f "next dev"` — it would kill the user's server too.

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

Git workflow: [`reference/git/workflow.md`](reference/git/workflow.md). Key rules: Conventional Commits, explicit user permission to commit, `[Human Verified]` only when authorized in the current message, squash-merge to `main`.

<!-- END:git-workflow-rules -->

<!-- BEGIN:prepush-agent-rules -->

# Pre-Push Validation

Before committing or pushing any changes, you MUST run the `prepush` script defined in `package.json`:

```bash
npm run prepush 2>&1 | head -c 4000
```

This runs:

1. `typecheck` — TypeScript type checking
2. `lint` — ESLint
3. `format:check` — Prettier formatting check
4. `test` — Vitest unit tests
5. `build` — Next.js production build

If any step fails, fix the errors before pushing. Do not bypass failures.

<!-- END:prepush-agent-rules -->
