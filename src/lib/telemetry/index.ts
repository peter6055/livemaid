import type {
  TelemetryAdapter,
  TelemetryBreadcrumb,
  TelemetryConfig,
  TelemetryStatus,
} from "./types";
import { createNoopAdapter } from "./noopAdapter";
import { createSentryAdapter } from "./sentryAdapter";

let instance: Telemetry | null = null;

const DEBUG_CATEGORIES = new Set(["render", "preview"]);

export const STORAGE_KEY = "livemaid:telemetry";

export class Telemetry {
  private adapter: TelemetryAdapter;
  usageAnalytics: boolean;
  debugReporting: boolean;
  private diagnosticSessionId: string;
  private reportCount = 0;

  constructor(
    adapter: TelemetryAdapter,
    config: { usageAnalytics: boolean; debugReporting: boolean },
    sessionId: string,
  ) {
    this.adapter = adapter;
    this.usageAnalytics = config.usageAnalytics;
    this.debugReporting = config.debugReporting;
    this.diagnosticSessionId = sessionId;
    this.adapter.setTags({ sessionId });
    this.adapter.setDebugReporting(config.debugReporting);
  }

  captureError(error: Error, context?: Record<string, unknown>) {
    if (!this.debugReporting) return;
    this.adapter.captureError(error, { ...context, sessionId: this.diagnosticSessionId });
  }

  captureMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
    context?: Record<string, unknown>,
  ): string | undefined {
    if (level === "error" || level === "warning") {
      if (!this.debugReporting) return undefined;
    } else {
      if (!this.usageAnalytics) return undefined;
    }
    return this.adapter.captureMessage(message, level, {
      ...context,
      sessionId: this.diagnosticSessionId,
    });
  }

  addBreadcrumb(breadcrumb: TelemetryBreadcrumb) {
    if (breadcrumb.level === "error" || DEBUG_CATEGORIES.has(breadcrumb.category)) {
      if (!this.debugReporting) return;
    } else {
      if (!this.usageAnalytics) return;
    }
    this.adapter.addBreadcrumb(breadcrumb);
  }

  reportIssue(reason: string, context?: Record<string, unknown>): string {
    this.reportCount += 1;
    const reportId = this.adapter.captureMessage(`[Support Report] ${reason}`, "info", {
      ...context,
      sessionId: this.diagnosticSessionId,
      reportNumber: this.reportCount,
    });
    return reportId || this.diagnosticSessionId;
  }

  getStatus(): TelemetryStatus {
    return {
      usageAnalytics: this.usageAnalytics,
      debugReporting: this.debugReporting,
      adapter: "sentry",
      sessionId: this.diagnosticSessionId,
      reportCount: this.reportCount,
    };
  }

  setUsageAnalytics(enabled: boolean) {
    this.usageAnalytics = enabled;
  }

  setDebugReporting(enabled: boolean) {
    this.debugReporting = enabled;
    this.adapter.setDebugReporting(enabled);
  }

  async flush() {
    await this.adapter.flush();
  }
}

export function initTelemetry(
  config: TelemetryConfig,
  prefs?: { usageAnalytics: boolean; debugReporting: boolean },
): Telemetry {
  if (instance) return instance;

  const sessionId = generateSessionId();

  let usagePref = false;
  let debugPref = false;

  if (prefs) {
    usagePref = prefs.usageAnalytics;
    debugPref = prefs.debugReporting;
  } else if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        usagePref = typeof parsed.usageAnalytics === "boolean" ? parsed.usageAnalytics : false;
        debugPref = typeof parsed.debugReporting === "boolean" ? parsed.debugReporting : false;
      }
    } catch {
      // ignore
    }
  }

  const adapter = config.dsn
    ? createSentryAdapter({
        dsn: config.dsn,
        environment: config.environment || "development",
        release: config.release || "0.0.0",
      })
    : createNoopAdapter();

  instance = new Telemetry(
    adapter,
    { usageAnalytics: usagePref, debugReporting: debugPref },
    sessionId,
  );

  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).LiveMaidDiagnostics = {
      reportIssue: (reason: string, context?: Record<string, unknown>) =>
        instance!.reportIssue(reason, context),
      getStatus: () => instance!.getStatus(),
      setUsageAnalytics: (enabled: boolean) => instance!.setUsageAnalytics(enabled),
      setDebugReporting: (enabled: boolean) => instance!.setDebugReporting(enabled),
    };
  }

  console.info(
    `[LiveMaid Telemetry] Session: ${sessionId} | Usage: ${usagePref ? "ON" : "OFF"} | Debug: ${debugPref ? "ON" : "OFF"}`,
  );

  return instance;
}

export function getTelemetry(): Telemetry | null {
  return instance;
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint32Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => n.toString(36)).join("");
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
