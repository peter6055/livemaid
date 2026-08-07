// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// Fresh module state per test: initTelemetry is a singleton, so reset the module
// registry and re-import to get a clean `instance` each time.
async function freshInit(stored?: string, prefs?: unknown) {
  vi.resetModules();
  const mod = await import("@/lib/telemetry/index");
  if (stored !== undefined) {
    window.localStorage.setItem(mod.STORAGE_KEY, stored);
  } else {
    window.localStorage.removeItem(mod.STORAGE_KEY);
  }
  const telemetry =
    prefs !== undefined
      ? mod.initTelemetry({ dsn: "" }, prefs as never)
      : mod.initTelemetry({ dsn: "" });
  return { mod, telemetry };
}

describe("telemetry preference persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the stable livemaid:telemetry storage key", async () => {
    const { mod } = await freshInit();
    expect(mod.STORAGE_KEY).toBe("livemaid:telemetry");
  });

  it("restores persisted usage analytics ON and debug OFF from localStorage", async () => {
    const { telemetry } = await freshInit(
      JSON.stringify({ usageAnalytics: true, debugReporting: false }),
    );
    expect(telemetry.usageAnalytics).toBe(true);
    expect(telemetry.debugReporting).toBe(false);
  });

  it("restores both toggles ON when persisted", async () => {
    const { telemetry } = await freshInit(
      JSON.stringify({ usageAnalytics: true, debugReporting: true }),
    );
    expect(telemetry.usageAnalytics).toBe(true);
    expect(telemetry.debugReporting).toBe(true);
  });

  it("defaults to OFF when nothing is stored", async () => {
    const { telemetry } = await freshInit();
    expect(telemetry.usageAnalytics).toBe(false);
    expect(telemetry.debugReporting).toBe(false);
  });

  it("defaults to OFF on corrupt JSON", async () => {
    const { telemetry } = await freshInit("{not valid json");
    expect(telemetry.usageAnalytics).toBe(false);
    expect(telemetry.debugReporting).toBe(false);
  });

  it("ignores non-boolean persisted values", async () => {
    const { telemetry } = await freshInit(
      JSON.stringify({ usageAnalytics: "yes", debugReporting: 1 }),
    );
    expect(telemetry.usageAnalytics).toBe(false);
    expect(telemetry.debugReporting).toBe(false);
  });

  it("prefers explicitly passed prefs over localStorage", async () => {
    const { telemetry } = await freshInit(
      JSON.stringify({ usageAnalytics: false, debugReporting: false }),
      { usageAnalytics: true, debugReporting: true },
    );
    expect(telemetry.usageAnalytics).toBe(true);
    expect(telemetry.debugReporting).toBe(true);
  });

  it("persisted prefs gate captureMessage and captureError behavior", async () => {
    const { mod } = await freshInit(
      JSON.stringify({ usageAnalytics: true, debugReporting: false }),
    );
    const calls: string[] = [];
    const adapter = {
      captureError: () => {
        calls.push("error");
      },
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
    const telemetry = new mod.Telemetry(
      adapter,
      { usageAnalytics: true, debugReporting: false },
      "test-session",
    );
    // usage analytics ON allows info messages…
    expect(telemetry.captureMessage("usage event", "info")).toBe("id");
    expect(calls).toContain("message");
    // …but debug reporting OFF drops errors.
    expect(telemetry.captureError(new Error("boom"))).toBeUndefined();
    expect(calls).not.toContain("error");
  });
});
