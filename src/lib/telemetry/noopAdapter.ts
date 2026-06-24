import type { TelemetryAdapter, TelemetryBreadcrumb } from "./types";

export function createNoopAdapter(): TelemetryAdapter {
  return {
    captureError(_error: Error, _context?: Record<string, unknown>) {},

    captureMessage(
      _message: string,
      _level: "info" | "warning" | "error",
      _context?: Record<string, unknown>,
    ) {
      return undefined;
    },

    addBreadcrumb(_breadcrumb: TelemetryBreadcrumb) {},

    setUser(_user: { id: string } | null) {},

    setTags(_tags: Record<string, string>) {},

    setDebugReporting(_enabled: boolean) {},

    async flush() {},
  };
}
