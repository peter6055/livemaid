# Data Collection Notice

**Last updated: June 2026**

LiveMaid has two independent data collection tiers. You control each in **Settings > Privacy**.

---

## Usage Data (Privacy-Safe)

Collected when **Usage Data** is enabled. Disabled by default.

### What is collected

- App version, browser, OS, and viewport size
- Current route and diagram type (e.g. flowchart, sequenceDiagram)
- Feature usage: diagram loaded, auto-saved, exported, undo/redo
- Non-sensitive metrics: render duration, node/edge counts (bucketed)
- Anonymous session ID (random, generated locally — not tied to your identity)

### What is NOT collected

- Your Mermaid diagram source code
- Diagram names, folder names, or file paths
- Any content you type or edit
- Comments or version history contents
- Exported images or raw SVG/PNG data

This tier is **safe to enable** — it never contains your diagram content.

---

## Debug Data (May Contain Content)

Collected when **Debug Data** is enabled. Disabled by default.

### What is collected

- Error stack traces and exception messages
- Mermaid parse/render failure messages (may contain code snippets)
- Auto-save and load failures
- Breadcrumbs for render errors and preview failures

### Important

Mermaid parser error messages sometimes include the diagram code that caused the failure. While we sanitise URLs, credentials, and email addresses, **code snippets inside error texts are not stripped**. Enabling this tier means you accept that small portions of your diagram may be transmitted during errors.

### When to enable

- You are comfortable sharing error context that may include diagram fragments
- You want to help us identify and fix rendering bugs
- You are reporting a specific issue and want us to have richer diagnostic data

---

## Support Reports (Always Available)

Regardless of the above tiers, you can manually create a support report from the browser console:

```
LiveMaidDiagnostics.reportIssue("canvas selection stopped working")
```

This sends a single event with current sanitised state and returns a report ID. Share that ID with the LiveMaid team so they can investigate.

---

## How to Control It

Open **Settings > Privacy** in the Dashboard sidebar. You'll find two independent toggles:

| Toggle     | Default | Contains content?          |
| ---------- | ------- | -------------------------- |
| Usage Data | OFF     | No                         |
| Debug Data | OFF     | May contain error snippets |

You can also control both from the browser console:

```js
LiveMaidDiagnostics.setUsageAnalytics(false); // disable usage data
LiveMaidDiagnostics.setDebugReporting(true); // enable debug data
```

---

## Data Processor

Diagnostic data is processed by [Sentry](https://sentry.io/privacy/) (Functional Software, Inc.). Data is stored in the US region. Sentry's privacy policy applies to the processing of this data. We do not sell or share this data with any third party beyond Sentry.

---

## Questions

If you have questions about this notice or the data we collect, please open an issue on [GitHub](https://github.com/peter6055/livemaid).
