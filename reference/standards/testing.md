# Testing Standards

## Test File Conventions

- All tests in TypeScript under `src/test/`.
- Unit: Vitest `*.test.ts` — `npm run test`.
- E2E: Playwright `*.spec.ts` — `npm run test:e2e`.
- `playwright.config.ts` uses `testMatch: "**/*.spec.ts"`.
- No co-located tests, no `__tests__/`, no Python/shell ad-hoc test scripts.
- **Commit rule**: Only general, reusable tests are committed to the repo. Verification tests written for a specific one-off fix must be discarded after the fix is verified.

## UI Verification Loop

After UI or interaction changes:

1. Implement the change.
2. Run interactive browser testing on the real user flow. Prefer project Playwright; see
   [`browser-mcp.md`](./browser-mcp.md) for why the in-app Browser MCP can hang and how to recover.
3. Capture screenshots at meaningful checkpoints.
4. Fix every error discovered before considering the task done.
5. Iterate until stable.

## Dev Servers

| Server     | Port               | Command            | Owner                                     |
| ---------- | ------------------ | ------------------ | ----------------------------------------- |
| User dev   | 3434               | `npm run dev`      | Human (tmux `livemaid`) — **never touch** |
| Agent test | random 20000–30000 | `npm run test:dev` | Agent (tmux `livemaid-test`)              |

`npm run test:dev` picks a random free port in 20000–30000 and uses a unique temporary `distDir`
(see AGENTS.md "Random Port Test Server" for the full startup/poll/cleanup flow). When running
Playwright, `scripts/playwright-global-setup.mjs` handles server startup and sets `PLAYWRIGHT_BASE_URL`
automatically.

Never run `pkill -f "next dev"` — it kills both servers.

When done testing: `tmux kill-session -t livemaid-test`.
