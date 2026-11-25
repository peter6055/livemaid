import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse, NextRequest } from "next/server";

type AuthHandler = (req: unknown) => Response | Promise<Response>;

vi.mock("@/lib/auth", () => ({
  // Behaves like Auth.js: unauthenticated requests get the sign-in redirect,
  // authenticated ones reach the proxy handler with `req.auth` populated.
  auth: vi.fn(
    (handler: AuthHandler) => (req: { auth?: { user?: { id?: string } } }) =>
      req.auth?.user?.id
        ? Promise.resolve(handler(req))
        : Promise.resolve(NextResponse.redirect(new URL("http://localhost/login"))),
  ),
  isAuthEnabled: vi.fn(() =>
    Promise.resolve(
      !!process.env.AUTH_SECRET &&
        !!process.env.AUTH_OIDC_ISSUER &&
        !!process.env.AUTH_OIDC_CLIENT_ID &&
        !!process.env.AUTH_OIDC_CLIENT_SECRET,
    ),
  ),
  isMember: vi.fn(() => Promise.resolve(true)),
  isAdmin: vi.fn(() => Promise.resolve(true)),
  isUserActive: vi.fn(() => Promise.resolve(true)),
}));

import middleware from "@/proxy";
import { isAdmin, isAuthEnabled, isMember, isUserActive } from "@/lib/auth";

function makeRequest(pathname: string, auth?: Record<string, unknown>): NextRequest {
  const request = new NextRequest(`http://localhost:3434${pathname}`, {
    headers: {
      host: "localhost:3434",
      "x-forwarded-proto": "http",
    },
  });
  if (auth) {
    (request as unknown as { auth: unknown }).auth = auth;
  }
  return request;
}

function enableAuth(): void {
  process.env.AUTH_SECRET = "test-secret";
  process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
  process.env.AUTH_OIDC_CLIENT_ID = "test-client-id";
  process.env.AUTH_OIDC_CLIENT_SECRET = "test-client-secret";
}

function clearAuthEnv(): void {
  delete process.env.DEMO_MODE;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_OIDC_ISSUER;
  delete process.env.AUTH_OIDC_CLIENT_ID;
  delete process.env.AUTH_OIDC_CLIENT_SECRET;
}

describe("middleware", () => {
  beforeEach(() => {
    clearAuthEnv();
    vi.mocked(isMember).mockResolvedValue(true);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isUserActive).mockResolvedValue(true);
  });

  afterEach(clearAuthEnv);

  it("allows public paths without a session", async () => {
    const response = (await middleware(makeRequest("/login"), {} as never)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects unauthenticated users to /login when auth is configured", async () => {
    enableAuth();
    const response = (await middleware(makeRequest("/editor/abc"), {} as never)) as Response;
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
  });

  it("sends an authenticated non-member to the restricted page", async () => {
    enableAuth();
    vi.mocked(isMember).mockImplementation(
      async (_userId, workspaceId) => workspaceId === "ws-mine",
    );

    const response = (await middleware(
      makeRequest("/workspace/ws-other", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/restricted");
    expect(location).not.toContain("/login");
  });

  it("sends a member without admin role to the restricted page for settings", async () => {
    enableAuth();

    const response = (await middleware(
      makeRequest("/workspace/ws-mine/settings", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/restricted");
  });

  it("lets workspace members through to non-settings pages", async () => {
    enableAuth();

    const response = (await middleware(
      makeRequest("/workspace/ws-mine", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("logs out a deactivated user on their next page request", async () => {
    enableAuth();
    vi.mocked(isUserActive).mockResolvedValueOnce(false);

    const response = (await middleware(
      makeRequest("/workspace/ws-mine", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    expect(response.headers.get("location") ?? "").toContain("/login");
    expect(response.headers.get("set-cookie") ?? "").toContain("next-auth.session-token=");
    expect(response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });

  it("logs out a removed workspace member on their next page request", async () => {
    enableAuth();
    vi.mocked(isMember).mockResolvedValueOnce(false);

    const response = (await middleware(
      makeRequest("/workspace/ws-mine", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    expect(response.headers.get("location") ?? "").toContain("/login");
    expect(response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });

  it("returns 401 and clears the cookie for revoked API sessions", async () => {
    enableAuth();
    vi.mocked(isUserActive).mockResolvedValueOnce(false);

    const response = (await middleware(
      makeRequest("/api/diagrams", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });

  it("fails closed when the session cannot be revalidated", async () => {
    enableAuth();
    vi.mocked(isUserActive).mockRejectedValueOnce(new Error("Mongo unreachable"));

    const response = (await middleware(
      makeRequest("/workspace/ws-mine", {
        user: { id: "user-1", workspaceId: "ws-mine", role: "member" },
      }),
      {} as never,
    )) as Response;

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Database unavailable");
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

  it("shows an error screen instead of bypassing auth when the auth state cannot be determined", async () => {
    vi.mocked(isAuthEnabled).mockRejectedValueOnce(new Error("Mongo unreachable"));

    const response = (await middleware(makeRequest("/editor/abc"), {} as never)) as Response;

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Database unavailable");
  });
});
