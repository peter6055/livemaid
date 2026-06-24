# Data Collection Notice

**Last updated: June 2026**

## What We Collect

When telemetry is enabled, LiveMaid collects anonymised diagnostic data to help identify bugs, performance issues, and usability problems. This includes:

- Error stack traces (sanitised — no source code, URLs, or credentials)
- App version, browser, OS, and viewport size
- Current route and diagram type (e.g. flowchart, sequenceDiagram)
- Action breadcrumbs: diagram loaded, render failed, auto-save, export, undo/redo
- Non-sensitive metrics: render duration, node/edge counts (bucketed)
- Anonymous session ID (random, generated locally — not tied to your identity)

## What We Do NOT Collect

We explicitly never collect:

- Your Mermaid diagram source code
- Diagram names, folder names, or file paths
- Comments or version history contents
- Exported images or raw SVG/PNG data
- Clipboard contents or keystroke-level logging
- Full session replays
- Personal information (name, email, IP address)
- Authentication tokens or credentials

## How We Use It

The sole purpose of telemetry is to improve LiveMaid. We use the data to:

- Detect and fix crashes and rendering bugs
- Identify diagram types or features that cause parse errors
- Monitor performance regressions (render times, save latency)
- Understand feature usage to prioritise development
- Respond to user-reported issues (via support report IDs)

## How to Control It

You can enable or disable telemetry at any time:

- **Dashboard sidebar** — Toggle the "Telemetry" switch at the bottom of the left sidebar.
- **Console** — Run `LiveMaidDiagnostics.setEnabled(false)` in the browser developer tools.
- **Environment** — Set `NEXT_PUBLIC_TELEMETRY_ENABLED=false` before starting the server.

Telemetry is off by default when running locally unless explicitly enabled. When disabled, no data is sent — the telemetry SDK loads but remains inactive.

## Support Reports

If you encounter a strange bug, you can manually create a support report. Open the browser console and run:

```
LiveMaidDiagnostics.reportIssue("canvas selection stopped working")
```

This captures the current sanitised state and returns a report ID. Share that ID with the LiveMaid team so they can investigate. No diagram content is included.

## Data Processor

Diagnostic data is processed by [Sentry](https://sentry.io/privacy/) (Functional Software, Inc.). Data is stored in the US region. Sentry's privacy policy applies to the processing of this data. We do not sell or share this data with any third party beyond Sentry.

## Questions

If you have questions about this notice or the data we collect, please open an issue on [GitHub](https://github.com/peter6055/livemaid).
