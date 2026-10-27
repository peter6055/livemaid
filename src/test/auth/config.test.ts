import { describe, it, expect, beforeEach } from "vitest";
import type { OIDCConfig } from "@auth/core/providers";
import type { Profile } from "@auth/core/types";
import { authConfig } from "@/lib/auth/config";

describe("auth config", () => {
  beforeEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_OIDC_ISSUER;
    delete process.env.AUTH_OIDC_CLIENT_ID;
    delete process.env.AUTH_OIDC_CLIENT_SECRET;
  });

  it("is importable without environment variables", () => {
    expect(authConfig).toBeDefined();
    expect(authConfig.providers).toHaveLength(1);
  });

  it("configures a generic OIDC provider", () => {
    const provider = authConfig.providers[0] as OIDCConfig<Profile>;
    expect(provider.type).toBe("oidc");
    expect(provider.id).toBe("oidc");
  });

  it("uses JWT sessions with a 24-hour sliding maxAge", () => {
    expect(authConfig.session?.strategy).toBe("jwt");
    expect(authConfig.session?.maxAge).toBe(24 * 60 * 60);
  });
});
