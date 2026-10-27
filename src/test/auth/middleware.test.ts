import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse, NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() =>
    vi.fn(() => Promise.resolve(NextResponse.redirect(new URL("http://localhost/login")))),
  ),
  isAuthEnabled: vi.fn(() => !!process.env.AUTH_SECRET),
  isMember: vi.fn(() => Promise.resolve(true)),
  isAdmin: vi.fn(() => Promise.resolve(true)),
}));

import middleware from "@/middleware";

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`http://localhost:3434${pathname}`, {
    headers: {
      host: "localhost:3434",
      "x-forwarded-proto": "http",
    },
  });
}

describe("middleware", () => {
  beforeEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_OIDC_ISSUER;
    delete process.env.AUTH_OIDC_CLIENT_ID;
    delete process.env.AUTH_OIDC_CLIENT_SECRET;
  });

  afterEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_OIDC_ISSUER;
    delete process.env.AUTH_OIDC_CLIENT_ID;
    delete process.env.AUTH_OIDC_CLIENT_SECRET;
  });

  it("allows public paths without a session", async () => {
    const response = (await middleware(makeRequest("/login"), {} as never)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects unauthenticated users to /login when auth is configured", async () => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "test-client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "test-client-secret";
    const response = (await middleware(makeRequest("/editor/abc"), {} as never)) as Response;
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
  });

  it("bypasses auth when DEMO_MODE is true", async () => {
    process.env.DEMO_MODE = "true";
    const response = (await middleware(makeRequest("/editor/abc"), {} as never)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("bypasses auth when OIDC environment variables are missing", async () => {
    const response = (await middleware(makeRequest("/editor/abc"), {} as never)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
