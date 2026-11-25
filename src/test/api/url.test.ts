import { describe, it, expect, afterEach, vi } from "vitest";
import { appUrl } from "@/lib/api/url";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("appUrl", () => {
  it("returns the path unchanged when BASE_URL is unset", () => {
    vi.stubEnv("BASE_URL", "");
    expect(appUrl("/api/x")).toBe("/api/x");
  });

  it("prefixes with BASE_URL on the server", () => {
    vi.stubEnv("BASE_URL", "https://example.com/livemaid");
    expect(appUrl("/api/x")).toBe("https://example.com/livemaid/api/x");
  });

  it("strips a trailing slash from BASE_URL", () => {
    vi.stubEnv("BASE_URL", "https://example.com/livemaid/");
    expect(appUrl("/api/x")).toBe("https://example.com/livemaid/api/x");
  });

  it("reads the base injected by the root layout on the client", () => {
    vi.stubEnv("BASE_URL", "");
    vi.stubGlobal("window", { __APP_BASE__: "https://example.com/livemaid" });
    expect(appUrl("/api/x")).toBe("https://example.com/livemaid/api/x");
  });
});
