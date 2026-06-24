import { describe, it, expect } from "vitest";
import { sanitizeString, sanitizeContext } from "@/lib/telemetry/sanitizer";
import { createNoopAdapter } from "@/lib/telemetry/noopAdapter";

describe("sanitizer", () => {
  describe("sanitizeString", () => {
    it("shortens long strings", () => {
      const long = "x".repeat(2000);
      const result = sanitizeString(long);
      expect(result.length).toBeLessThan(600);
      expect(result).toContain("[truncated]");
    });

    it("strips URLs", () => {
      const result = sanitizeString("Error at https://example.com/secret/page?token=abc");
      expect(result).toContain("[url]");
      expect(result).not.toContain("example.com");
    });

    it("strips emails", () => {
      const result = sanitizeString("user@example.com reported an error");
      expect(result).toContain("[email]");
    });

    it("strips API keys", () => {
      const result = sanitizeString("api_key=sk_test_abcdefghijklmnopqrstuvwxyz1234");
      expect(result).toContain("[credential]");
    });

    it("strips connection strings", () => {
      const result = sanitizeString("mongodb://admin:pass@localhost:27017/mydb");
      expect(result).toContain("[connection-string]");
    });

    it("passes through safe strings", () => {
      const result = sanitizeString("Diagram render error on line 5");
      expect(result).toBe("Diagram render error on line 5");
    });
  });

  describe("sanitizeContext", () => {
    it("redacts sensitive keys", () => {
      const ctx = sanitizeContext({
        code: "graph TD; A-->B;",
        source: "user input",
        diagram: "flowchart",
        safeKey: "hello",
      });
      expect(ctx.code).toBe("[sanitized]");
      expect(ctx.source).toBe("[sanitized]");
      expect(ctx.diagram).toBe("[sanitized]");
      expect(ctx.safeKey).toBe("hello");
    });

    it("passes numbers and booleans through", () => {
      const ctx = sanitizeContext({ count: 42, enabled: true });
      expect(ctx.count).toBe(42);
      expect(ctx.enabled).toBe(true);
    });

    it("handles null and undefined", () => {
      const ctx = sanitizeContext({ a: null, b: undefined });
      expect(ctx.a).toBeNull();
      expect(ctx.b).toBeUndefined();
    });

    it("truncates arrays", () => {
      const ctx = sanitizeContext({ items: Array.from({ length: 50 }, (_, i) => `item${i}`) });
      expect(Array.isArray(ctx.items)).toBe(true);
      expect((ctx.items as string[]).length).toBe(10);
    });

    it("replaces complex objects", () => {
      const ctx = sanitizeContext({ nested: { foo: "bar" } });
      expect(ctx.nested).toBe("[complex]");
    });
  });
});

describe("noopAdapter", () => {
  const adapter = createNoopAdapter();

  it("captureError does not throw", () => {
    expect(() => adapter.captureError(new Error("test"))).not.toThrow();
  });

  it("captureMessage returns undefined", () => {
    expect(adapter.captureMessage("test", "info")).toBeUndefined();
  });

  it("addBreadcrumb does not throw", () => {
    expect(() => adapter.addBreadcrumb({ category: "test", message: "test" })).not.toThrow();
  });

  it("setUser does not throw", () => {
    expect(() => adapter.setUser({ id: "test" })).not.toThrow();
  });

  it("setTags does not throw", () => {
    expect(() => adapter.setTags({ key: "value" })).not.toThrow();
  });

  it("flush resolves", async () => {
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
});
