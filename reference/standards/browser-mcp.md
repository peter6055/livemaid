# Browser Automation: In-App Browser MCP vs Playwright

## Decision Rule

- **Prefer project Playwright** (`npx playwright test`, or a short standalone script against
  `npm run test:dev`) for any real UI/feature validation. It is the reliable path in this runtime.
- Use the **in-app Browser MCP** only for quick exploratory reconnaissance (a few clicks/screenshots).
- If the Browser MCP hangs or times out, **switch to Playwright immediately — do not keep retrying
  the MCP session.** A wedged MCP session usually stays wedged until the browser process is killed.

## Agent Responsibilities (browser testing)

- **Own the session lifecycle.** The agent starts, monitors, and cleans up its own browser session and
  test server. Never leave orphaned Chromium processes or `livemaid-test` tmux sessions behind.
- **Never touch the user's server** (port 3434, tmux `livemaid`). Only the agent's test server
  (`npm run test:dev`) may be started/stopped, and only via tmux `livemaid-test`.
- **Don't retry a wedged MCP session.** One hang is enough: switch to project Playwright immediately
  instead of burning time/timeouts on further `snapshot`/`click`/`stop` calls.
- **Clean up after crashes.** Kill stale Chromium and clear `SingletonLock`/`SingletonSocket` from the
  browser profile before relaunching (commands below).
- **Warm routes before navigating** with the MCP so cold-compile timeouts don't trigger hangs.
- **Use explicit, generous navigation settings** (`waitUntil: "domcontentloaded"`, 60–120s timeout)
  rather than MCP defaults.
- **Verify, then close.** Close the browser context and kill the test server when validation is done
  so later agents don't inherit wedged state.

## Why the Browser MCP Hangs (observed in this environment)

1. **Cold compile vs short navigation timeout (main trigger).**
   Next.js/Turbopack's first compile of a route can take 30–40s+ (observed `GET / 200 in 37.5s`).
   The Browser MCP `goto` defaults to `waitUntil: "load"` with a ~30s timeout, so navigation to a
   not-yet-compiled route times out and leaves the session in a bad state.

2. **Dead session after timeout/abort.**
   Once a navigation times out or the user aborts mid-navigation, the CDP connection is wedged but
   the MCP wrapper still treats the session as open. Subsequent `snapshot`, `click`, or `stop` calls
   then hang waiting on `body`/CDP indefinitely.

3. **Stale persistent-profile lock.**
   `/root/.opencode/browser-profile/` can retain `SingletonLock` / `SingletonSocket` from a crashed
   Chromium (e.g. a headed launch that died on missing `$DISPLAY`), blocking or flaking later launches.

4. **Headed mode without an X server.**
   `$DISPLAY` is empty in this runtime. Headed launch fails immediately
   (`Missing X server or $DISPLAY`). `Xvfb` is installed but not managed by the MCP. Headless works.

## Workarounds

- **Warm the route before navigating.** `curl -s -o /dev/null -w "%{http_code}" --max-time 90 http://localhost:PORT/`
  forces the cold compile; then the MCP `goto` completes quickly.
- **Use relaxed navigation.** `waitUntil: "domcontentloaded"` with a 60–120s timeout instead of the
  default `load`/30s.
- **Recover a wedged session:** kill stale Chromium, then clear the singleton locks before relaunch:
  ```bash
  pkill -f "chrome.*opencode/browser-profile"
  rm -f /root/.opencode/browser-profile/SingletonLock \
        /root/.opencode/browser-profile/SingletonSocket \
        /root/.opencode/browser-profile/SingletonCookie
  ```
- **Prefer Playwright specs.** The project suite already handles cold compiles correctly:
  `scripts/playwright-global-setup.mjs` waits for "Ready in", uses a random port + unique `distDir`,
  and specs use generous timeouts/retries. Cold-compile flakiness on first `page.goto` still exists
  (passes on retry); if it matters, add a warm-up `page.goto` before the assertions.
