# Testing Standards

## Test File Conventions

- All tests in TypeScript under `src/test/`.
- Unit: Vitest `*.test.ts` — `npm run test`.
- E2E: Playwright `*.spec.ts` — `npm run test:e2e`.
- `playwright.config.ts` uses `testMatch: "**/*.spec.ts"`.
- No co-located tests, no `__tests__/`, no Python/shell ad-hoc test scripts.

## UI Verification Loop

After UI or interaction changes:

1. Implement the change.
2. Run interactive browser testing on the real user flow.
3. Capture screenshots at meaningful checkpoints.
4. Fix every error discovered before considering the task done.
5. Iterate until stable.

## Dev Servers

| Server | Port | Command | Owner |
| --- | --- | --- | --- |
| User dev | 3434 | `npm run dev` | Human (tmux `livemaid`) — **never touch** |
| Agent test | 3435 | `npm run test:dev` | Agent (tmux `livemaid-test`) |

Never run `pkill -f "next dev"` — it kills both servers.

Agent test server startup:

```bash
tmux kill-session -t livemaid-test 2>/dev/null
cd /path/to/project && tmux new-session -d -s livemaid-test 'npm run test:dev'
for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3435 2>/dev/null; then break; fi
  sleep 1
done
```

When done testing: `tmux kill-session -t livemaid-test`.
