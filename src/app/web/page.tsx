import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Data Collection Notice — LiveMaid",
  description: "What data LiveMaid collects, why, and how to control it.",
};

export default function WebPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans antialiased">
      <div className="max-w-2xl mx-auto w-full px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Data Collection Notice</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <section className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-2">What We Collect</h2>
            <p className="text-muted-foreground mb-2">
              When telemetry is enabled, LiveMaid collects anonymised diagnostic data to help
              identify bugs, performance issues, and usability problems. This includes:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
              <li>Error stack traces (sanitised — no source code, URLs, or credentials)</li>
              <li>App version, browser, OS, and viewport size</li>
              <li>Current route and diagram type (e.g. flowchart, sequenceDiagram)</li>
              <li>Action breadcrumbs: diagram loaded, render failed, auto-save, export, undo/redo</li>
              <li>Non-sensitive metrics: render duration, node/edge counts (bucketed)</li>
              <li>Anonymous session ID (random, generated locally — not tied to your identity)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">What We Do NOT Collect</h2>
            <p className="text-muted-foreground mb-2">We explicitly never collect:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
              <li>Your Mermaid diagram source code</li>
              <li>Diagram names, folder names, or file paths</li>
              <li>Comments or version history contents</li>
              <li>Exported images or raw SVG/PNG data</li>
              <li>Clipboard contents or keystroke-level logging</li>
              <li>Full session replays</li>
              <li>Personal information (name, email, IP address)</li>
              <li>Authentication tokens or credentials</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">How We Use It</h2>
            <p className="text-muted-foreground text-sm">
              The sole purpose of telemetry is to improve LiveMaid. We use the data to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm mt-2">
              <li>Detect and fix crashes and rendering bugs</li>
              <li>Identify diagram types or features that cause parse errors</li>
              <li>Monitor performance regressions (render times, save latency)</li>
              <li>Understand feature usage to prioritise development</li>
              <li>Respond to user-reported issues (via support report IDs)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">How to Control It</h2>
            <p className="text-muted-foreground text-sm mb-2">
              You can enable or disable telemetry at any time:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
              <li>
                <strong>Dashboard sidebar</strong> — Toggle the &ldquo;Telemetry&rdquo; switch at the
                bottom of the left sidebar.
              </li>
              <li>
                <strong>Console</strong> — Run{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  LiveMaidDiagnostics.setEnabled(false)
                </code>{" "}
                in the browser developer tools.
              </li>
              <li>
                <strong>Environment</strong> — Set{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  NEXT_PUBLIC_TELEMETRY_ENABLED=false
                </code>{" "}
                before starting the server.
              </li>
            </ul>
            <p className="text-muted-foreground text-sm mt-3">
              Telemetry is off by default when running locally unless explicitly enabled. When
              disabled, no data is sent — the telemetry SDK loads but remains inactive.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Support Reports</h2>
            <p className="text-muted-foreground text-sm">
              If you encounter a strange bug, you can manually create a support report. Open the
              browser console and run:
            </p>
            <pre className="bg-muted p-3 rounded-lg text-xs mt-2 overflow-x-auto">
              LiveMaidDiagnostics.reportIssue(&quot;canvas selection stopped working&quot;)
            </pre>
            <p className="text-muted-foreground text-sm mt-2">
              This captures the current sanitised state and returns a report ID. Share that ID with
              the LiveMaid team so they can investigate. No diagram content is included.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Data Processor</h2>
            <p className="text-muted-foreground text-sm">
              Diagnostic data is processed by{" "}
              <a
                href="https://sentry.io/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Sentry
              </a>{" "}
              (Functional Software, Inc.). Data is stored in the US region. Sentry&rsquo;s privacy
              policy applies to the processing of this data. We do not sell or share this data with
              any third party beyond Sentry.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Questions</h2>
            <p className="text-muted-foreground text-sm">
              If you have questions about this notice or the data we collect, please open an issue on{" "}
              <a
                href="https://github.com/peter6055/livemaid"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
