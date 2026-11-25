import { describe, it, expect, beforeEach } from "vitest";
import {
  mongoUriConfigured,
  areOidcCredentialsConfigured,
  isAuthEnabled,
} from "@/lib/auth/appConfig";

describe("appConfig", () => {
  beforeEach(() => {
    delete process.env.MONGODB_URI;
    delete process.env.DEMO_MODE;
    delete process.env.WORKSPACES_ENABLED;
    delete process.env.AUTH_OIDC_ISSUER;
    delete process.env.AUTH_OIDC_CLIENT_ID;
    delete process.env.AUTH_OIDC_CLIENT_SECRET;
  });

  it("reports mongoUriConfigured from process.env", () => {
    expect(mongoUriConfigured()).toBe(false);
    process.env.MONGODB_URI = "mongodb://localhost/livemaid";
    expect(mongoUriConfigured()).toBe(true);
  });

  it("reports OIDC credentials as unconfigured when unset", () => {
    expect(areOidcCredentialsConfigured()).toBe(false);
  });

  it("reports OIDC credentials when all AUTH_OIDC_* vars are set", () => {
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "client-secret";
    expect(areOidcCredentialsConfigured()).toBe(true);
  });

  it("enables auth only when WORKSPACES_ENABLED, Mongo, and OIDC are set", () => {
    expect(isAuthEnabled()).toBe(false);

    process.env.MONGODB_URI = "mongodb://localhost/livemaid";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "client-secret";
    expect(isAuthEnabled()).toBe(false);

    process.env.WORKSPACES_ENABLED = "true";
    expect(isAuthEnabled()).toBe(true);
  });

  it("treats WORKSPACES_ENABLED truthy values", () => {
    process.env.MONGODB_URI = "mongodb://localhost/livemaid";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "client-secret";

    for (const value of ["1", "true", "yes", "TRUE", " Yes "]) {
      process.env.WORKSPACES_ENABLED = value;
      expect(isAuthEnabled()).toBe(true);
    }

    process.env.WORKSPACES_ENABLED = "false";
    expect(isAuthEnabled()).toBe(false);
  });

  it("reports auth as disabled in demo mode even when workspace env is set", () => {
    process.env.DEMO_MODE = "true";
    process.env.WORKSPACES_ENABLED = "true";
    process.env.MONGODB_URI = "mongodb://localhost/livemaid";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "client-secret";

    expect(isAuthEnabled()).toBe(false);
  });
});
