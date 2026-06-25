<!-- BEGIN:livemaid-architecture-rules -->

# Reference Documentation

Before implementing features or modifying editor logic, read only what your task needs from `reference/`. Full index: [`reference/README.md`](reference/README.md).

**Mandatory for editor/feature work** (in order):

1. [`reference/features/reading-map.md`](reference/features/reading-map.md) — invariants, support matrix, subsystem reading map
2. [`reference/architecture/overview.md`](reference/architecture/overview.md) — system structure
3. [`reference/standards/design.md`](reference/standards/design.md) — UI/UX tokens and interaction

Then read the deep-dive linked from the reading map for your subsystem (e.g. `features/editor/`, `features/diagrams/`).

> **RULE:** All agent/developer reference docs live under `reference/` in the appropriate subfolder. Do not add docs at the repo root.

| Topic | Doc |
| --- | --- |
| Command output caps | [`reference/standards/command-output.md`](reference/standards/command-output.md) |
| Next.js caveats | [`reference/standards/nextjs.md`](reference/standards/nextjs.md) |
| Mermaid syntax | [`reference/standards/mermaid.md`](reference/standards/mermaid.md) |
| Testing & dev servers | [`reference/standards/testing.md`](reference/standards/testing.md) |
| Git workflow | [`reference/git/workflow.md`](reference/git/workflow.md) |
| Pre-push validation | [`reference/git/prepush.md`](reference/git/prepush.md) |
| Verification plans | [`reference/plans/verification-plan.md`](reference/plans/verification-plan.md) |
| Regression plans | [`reference/plans/regression-plan.md`](reference/plans/regression-plan.md) |
| OpenCode orchestration | [`reference/skills/opencode-workflow.md`](reference/skills/opencode-workflow.md) |

<!-- END:livemaid-architecture-rules -->

<!-- BEGIN:nextjs-agent-rules -->

Before writing Next.js code, read [`reference/standards/nextjs.md`](reference/standards/nextjs.md).

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mermaid-agent-rules -->

Before implementing Mermaid logic, read [`reference/standards/mermaid.md`](reference/standards/mermaid.md). Do not guess syntax.

<!-- END:mermaid-agent-rules -->

<!-- BEGIN:testing-agent-rules -->

When implementing UI features or complex client-side changes, follow the loop in [`reference/standards/testing.md`](reference/standards/testing.md): implement → browser test → screenshots → fix all errors → iterate until stable.

<!-- END:testing-agent-rules -->

<!-- BEGIN:dev-server-rules -->

Dev servers: user on port **3434** (`npm run dev`, never touch); agent on port **3435** (`npm run test:dev`, tmux `livemaid-test`). Details in [`reference/standards/testing.md`](reference/standards/testing.md).

<!-- END:dev-server-rules -->

<!-- BEGIN:verification-planning-rules -->

Verification plans must follow [`reference/plans/verification-plan.md`](reference/plans/verification-plan.md).

<!-- END:verification-planning-rules -->

<!-- BEGIN:regression-planning-rules -->

Verification plans for new features must include a Regression Testplan per [`reference/plans/regression-plan.md`](reference/plans/regression-plan.md).

<!-- END:regression-planning-rules -->

<!-- BEGIN:git-workflow-rules -->

Git workflow: [`reference/git/workflow.md`](reference/git/workflow.md). Key rules: Conventional Commits, explicit user permission to commit, `[Human Verified]` only when authorized in the current message, squash-merge to `main`.

<!-- END:git-workflow-rules -->

<!-- BEGIN:prepush-agent-rules -->

Before commit or push: `npm run prepush`. Details: [`reference/git/prepush.md`](reference/git/prepush.md).

<!-- END:prepush-agent-rules -->