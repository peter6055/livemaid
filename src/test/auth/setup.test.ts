import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateAuthSecret, validateOidcDiscovery } from "@/lib/auth/setup";

describe("auth setup", () => {
  describe("generateAuthSecret", () => {
    it("returns a non-empty base64 string", () => {
      const secret = generateAuthSecret();
      expect(secret).toBeTruthy();
      expect(secret).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(Buffer.from(secret, "base64")).toHaveLength(32);
    });

    it("returns different values on successive calls", () => {
      const a = generateAuthSecret();
      const b = generateAuthSecret();
      expect(a).not.toBe(b);
    });
  });

  describe("validateOidcDiscovery", () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("rejects an invalid issuer URL", async () => {
      const result = await validateOidcDiscovery("not a url");
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toContain("Invalid issuer URL");
    });

    it("rejects a non-OK discovery response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
      const result = await validateOidcDiscovery("https://idp.example.com");
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toContain("404");
    });

    it("rejects a discovery document missing required endpoints", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ authorization_endpoint: "https://idp.example.com/auth" }),
      } as Response);
      const result = await validateOidcDiscovery("https://idp.example.com");
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toContain("missing required OIDC endpoints");
    });

    it("accepts a valid discovery document", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: "https://idp.example.com/auth",
          token_endpoint: "https://idp.example.com/token",
          userinfo_endpoint: "https://idp.example.com/userinfo",
        }),
      } as Response);
      const result = await validateOidcDiscovery("https://idp.example.com/");
      expect(result.ok).toBe(true);
    });
  });
});
