# Git Workflow & Commit Rules

1. **Commit frequently** after significant logical changes — but only when the user explicitly requests commits.
2. **Conventional Commits**: `<type>[optional scope]: <description>` — no emoji.
3. **`[Human Verified]` tag**: Only when explicitly authorized in the **current** user message.
4. **Feature branch workflow**: Branch from `main`, PR to `main`, squash-and-merge, delete branch after merge.
5. **PR titles** must follow Conventional Commits (enforced by `ci/pr-title`).
6. **Concurrent agents**: Use isolated workspace clones for complex branch manipulation.
7. **Branch creation**: Fetch latest remote `main` first. On auth failure, use `gh` token from `~/.config/gh/hosts.yml`.

Allowed types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`.
