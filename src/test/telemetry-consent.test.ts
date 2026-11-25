// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

// initTelemetry is a singleton, so reset the module registry and re-import for a clean instance.
async function freshInit(prefs: { usageAnalytics: boolean; debugReporting: boolean }) {
  vi.resetModules();
  const mod = await import("@/lib/telemetry/index");
  return { mod, telemetry: mod.initTelemetry({ dsn: "" }, prefs) };
}

function recordingAdapter(calls: string[]) {
  return {
    captureError: () => void calls.push("error"),
    captureMessage: () => {
      calls.push("message");
      return "id";
    },
    addBreadcrumb: () => {},
    setUser: () => {},
    setTags: () => {},
    setDebugReporting: () => {},
    flush: async () => {},
  };
}

describe("telemetry consent", () => {
  it("applies the stored consent flags passed by the preferences provider", async () => {
    const on = await freshInit({ usageAnalytics: true, debugReporting: true });
    expect(on.telemetry.usageAnalytics).toBe(true);
    expect(on.telemetry.debugReporting).toBe(true);

    const off = await freshInit({ usageAnalytics: false, debugReporting: false });
    expect(off.telemetry.usageAnalytics).toBe(false);
    expect(off.telemetry.debugReporting).toBe(false);
  });

  it("treats a non-boolean consent value as opted out", async () => {
    const { telemetry } = await freshInit({
      usageAnalytics: "true",
      debugReporting: 1,
    } as never);
    expect(telemetry.usageAnalytics).toBe(false);
    expect(telemetry.debugReporting).toBe(false);
  });

  it("gates messages and errors on the consent flags", async () => {
    const { mod } = await freshInit({ usageAnalytics: true, debugReporting: false });
    const calls: string[] = [];
    const telemetry = new mod.Telemetry(
      recordingAdapter(calls),
      { usageAnalytics: true, debugReporting: false },
      "test-session",
    );

    expect(telemetry.captureMessage("usage event", "info")).toBe("id");
    expect(telemetry.captureError(new Error("boom"))).toBeUndefined();
    expect(calls).toContain("message");
    expect(calls).not.toContain("error");
  });

  it("stops capturing when the user revokes consent", async () => {
    const { mod } = await freshInit({ usageAnalytics: true, debugReporting: true });
    const calls: string[] = [];
    const telemetry = new mod.Telemetry(
      recordingAdapter(calls),
      { usageAnalytics: true, debugReporting: true },
      "test-session",
    );

    telemetry.setUsageAnalytics(false);
    telemetry.setDebugReporting(false);

    expect(telemetry.captureMessage("usage event", "info")).toBeUndefined();
    expect(telemetry.captureError(new Error("boom"))).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
