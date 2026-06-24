import type {
  TelemetryAdapter,
  TelemetryBreadcrumb,
  TelemetryConfig,
  TelemetryStatus,
} from "./types";
import { createNoopAdapter } from "./noopAdapter";
import { createSentryAdapter } from "./sentryAdapter";

let instance: Telemetry | null = null;

export class Telemetry {
  private adapter: TelemetryAdapter;
  private enabled: boolean;
  private diagnosticSessionId: string;
  private reportCount = 0;

  constructor(adapter: TelemetryAdapter, enabled: boolean, sessionId: string) {
    this.adapter = adapter;
    this.enabled = enabled;
    this.diagnosticSessionId = sessionId;
    this.adapter.setTags({ sessionId });
  }

  captureError(error: Error, context?: Record<string, unknown>) {
    if (!this.enabled) return;
    this.adapter.captureError(error, { ...context, sessionId: this.diagnosticSessionId });
  }

  captureMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
    context?: Record<string, unknown>,
  ): string | undefined {
    if (!this.enabled) return undefined;
    return this.adapter.captureMessage(message, level, {
      ...context,
      sessionId: this.diagnosticSessionId,
    });
  }

  addBreadcrumb(breadcrumb: TelemetryBreadcrumb) {
    if (!this.enabled) return;
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
      enabled: this.enabled,
      adapter: this.enabled ? "sentry" : "none",
      sessionId: this.diagnosticSessionId,
      reportCount: this.reportCount,
    };
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  async flush() {
    if (this.enabled) {
      await this.adapter.flush();
    }
  }
}

export function initTelemetry(config: TelemetryConfig): Telemetry {
  if (instance) return instance;

  const sessionId = generateSessionId();
  let adapter: TelemetryAdapter;

  if (config.enabled && config.dsn) {
    adapter = createSentryAdapter({
      dsn: config.dsn,
      environment: config.environment || "development",
      release: config.release || "0.0.0",
    });
  } else {
    adapter = createNoopAdapter();
  }

  instance = new Telemetry(adapter, config.enabled, sessionId);

  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).LiveMaidDiagnostics = {
      reportIssue: (reason: string, context?: Record<string, unknown>) =>
        instance!.reportIssue(reason, context),
      getStatus: () => instance!.getStatus(),
      setEnabled: (enabled: boolean) => instance!.setEnabled(enabled),
    };
  }

  console.info(
    `[LiveMaid Telemetry] ${config.enabled ? "Enabled" : "Disabled"} | Session: ${sessionId}`,
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
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
