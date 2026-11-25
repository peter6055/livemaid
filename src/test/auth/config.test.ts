import { describe, it, expect, beforeEach, vi } from "vitest";
import { customFetch } from "@auth/core";
import type { OIDCConfig, Provider } from "@auth/core/providers";
import type { Profile } from "@auth/core/types";
import { createAuthConfig } from "@/lib/auth/config";
import { cachedDiscoveryFetch } from "@/lib/auth/oidcDiscovery";

function resolveProvider(provider: Provider): OIDCConfig<Profile> {
  return (typeof provider === "function" ? provider() : provider) as OIDCConfig<Profile>;
}

describe("auth config", () => {
  beforeEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_OIDC_ISSUER;
    delete process.env.AUTH_OIDC_CLIENT_ID;
    delete process.env.AUTH_OIDC_CLIENT_SECRET;
    delete process.env.AUTH_URL;
    delete process.env.BASE_URL;
    delete process.env.MONGODB_URI;
  });

  it("is importable without environment variables", async () => {
    const config = await createAuthConfig();
    expect(config).toBeDefined();
    expect(config.providers).toHaveLength(1);
  });

  it("configures a generic OIDC provider", async () => {
    const config = await createAuthConfig();
    const provider = resolveProvider(config.providers[0]);
    expect(provider.type).toBe("oidc");
    expect(provider.id).toBe("oidc");
  });

  it("reads OIDC credentials at request time", async () => {
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "client-secret";

    const config = await createAuthConfig();
    const provider = resolveProvider(config.providers[0]);
    expect(provider.issuer).toBe("https://idp.example.com");
    expect(provider.clientId).toBe("client-id");
    expect(provider.clientSecret).toBe("client-secret");
  });

  it("uses JWT sessions with a 24-hour sliding maxAge", async () => {
    const config = await createAuthConfig();
    expect(config.session?.strategy).toBe("jwt");
    expect(config.session?.maxAge).toBe(24 * 60 * 60);
  });

  it("sets secure session cookies only in production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await createAuthConfig()).cookies?.sessionToken?.options?.secure).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect((await createAuthConfig()).cookies?.sessionToken?.options?.secure).toBe(true);
    vi.unstubAllEnvs();
  });

  it("allows email account linking for OIDC", async () => {
    const config = await createAuthConfig();
    const provider = resolveProvider(config.providers[0]);
    expect(provider.allowDangerousEmailAccountLinking).toBe(true);
  });

  it("enables pkce and state checks for OIDC", async () => {
    const config = await createAuthConfig();
    const provider = resolveProvider(config.providers[0]);
    expect(provider.checks).toEqual(["pkce", "state"]);
  });

  it("routes provider requests through the cached discovery fetch", async () => {
    const config = await createAuthConfig();
    const provider = resolveProvider(config.providers[0]);
    // Symbol identity matters: a second @auth/core copy would silently drop the cache.
    expect((provider as unknown as Record<symbol, unknown>)[customFetch]).toBe(
      cachedDiscoveryFetch,
    );
  });

  it("defaults Auth.js basePath to /api/auth", async () => {
    expect((await createAuthConfig()).basePath).toBe("/api/auth");
  });

  it("routes Auth.js errors to our login page, keeping the reverse-proxy prefix", async () => {
    expect((await createAuthConfig()).pages).toMatchObject({ signIn: "/login", error: "/login" });

    process.env.BASE_URL = "https://example.com/livemaid";
    expect((await createAuthConfig()).pages?.error).toBe("/livemaid/login");
  });

  it("derives AUTH_URL and Auth basePath from BASE_URL, keeping the proxy prefix", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    process.env.BASE_URL = "https://example.com/livemaid";

    const config = await createAuthConfig();

    expect(process.env.AUTH_URL).toBe("https://example.com/livemaid/api/auth");
    expect(config.basePath).toBe("/livemaid/api/auth");
    vi.unstubAllEnvs();
  });

  it("strips a trailing slash from BASE_URL", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    process.env.BASE_URL = "https://example.com/livemaid/";

    const config = await createAuthConfig();

    expect(process.env.AUTH_URL).toBe("https://example.com/livemaid/api/auth");
    expect(config.basePath).toBe("/livemaid/api/auth");
    vi.unstubAllEnvs();
  });

  it("leaves AUTH_URL unset when BASE_URL is unset", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    await createAuthConfig();

    expect(process.env.AUTH_URL).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("uses AUTH_URL pathname as Auth basePath when AUTH_URL is set", async () => {
    process.env.AUTH_URL = "https://example.com/3434/api/auth";

    expect((await createAuthConfig()).basePath).toBe("/3434/api/auth");
  });
});
