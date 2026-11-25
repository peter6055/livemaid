import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { auth, isAuthEnabled, isAdmin, isMember, isUserActive } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { appUrl } from "@/lib/api/url";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/health" || pathname.startsWith("/health/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf)$/.test(pathname);
}

function getWorkspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspace\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function redirectToLogin(request: NextRequest): NextResponse {
  // appUrl keeps the reverse-proxy prefix that request.nextUrl has already lost.
  return NextResponse.redirect(new URL(appUrl("/login"), request.url));
}

// The JWT is stateless, so a removed or deactivated account keeps a valid token
// until it expires. Expire the cookie on the next protected request and send the
// user back through login. API clients get a 401 instead of a redirect.
function revokedSessionResponse(request: NextRequest): Response {
  const response = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : redirectToLogin(request);
  response.cookies.set({
    name: "next-auth.session-token",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

// Signed in, but the token does not grant this workspace (or admin settings).
// A login redirect would just bounce them back; show the restricted page.
function redirectToRestricted(request: NextRequest): Response {
  return NextResponse.redirect(new URL(appUrl("/restricted"), request.url));
}

// Fail closed: if the auth state cannot be read, requests must not be served
// unauthenticated. A 503 error screen is shown until the database is reachable.
function authStateUnavailableResponse(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Database unavailable — LiveMaid</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #ffffff; color: #18181b; padding: 1.5rem;
  }
  .card {
    max-width: 32rem; width: 100%; border: 1px solid #e4e4e7; border-radius: 0.75rem;
    padding: 2rem; background: #ffffff;
  }
  h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
  p { margin: 0 0 1rem; font-size: 0.9375rem; line-height: 1.6; color: #52525b; }
  a {
    display: inline-block; margin-top: 0.5rem; font-size: 0.875rem; color: #18181b;
    text-decoration: underline; text-underline-offset: 2px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #09090b; color: #fafafa; }
    .card { background: #09090b; border-color: #27272a; }
    p { color: #a1a1aa; }
    a { color: #fafafa; }
  }
</style>
</head>
<body>
  <main class="card">
    <h1>Database unavailable</h1>
    <p>LiveMaid cannot reach MongoDB, so it cannot verify who is signed in. Requests are blocked until the database is reachable again.</p>
    <p>Check that MongoDB is running and that <code>MONGODB_URI</code> is correct.</p>
    <a href="">Retry</a>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "30",
    },
  });
}

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Response> {
  const pathname = request.nextUrl.pathname;

  if (isDemoMode()) {
    return NextResponse.next();
  }

  let authEnabled: boolean;
  try {
    authEnabled = await isAuthEnabled();
  } catch (error) {
    console.error("Failed to determine auth state; refusing to serve requests.", error);
    return authStateUnavailableResponse();
  }

  if (!authEnabled) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  type AuthHandler = (req: NextAuthRequest) => Response | Promise<Response>;
  type AuthMiddleware = (req: NextRequest, ev: NextFetchEvent) => Promise<Response>;

  // NextAuth is lazily initialized, so the wrapper is resolved asynchronously.
  const authMiddleware = await (
    auth as unknown as (handler: AuthHandler) => Promise<AuthMiddleware>
  )(async (req: NextAuthRequest) => {
    const userId = req.auth?.user?.id;
    const tokenWorkspaceId = req.auth?.user?.workspaceId;
    if (!userId) {
      return redirectToLogin(request);
    }

    // Revoke immediately when the account was deactivated or its workspace
    // membership was removed. This is the only database check on the common
    // path, so a stale JWT cannot outlive the account it belongs to.
    try {
      const [userActive, workspaceActive] = await Promise.all([
        isUserActive(userId),
        tokenWorkspaceId ? isMember(userId, tokenWorkspaceId) : Promise.resolve(true),
      ]);
      if (!userActive || !workspaceActive) {
        return revokedSessionResponse(request);
      }
    } catch (error) {
      console.error("Failed to verify session state; refusing to serve request.", error);
      return authStateUnavailableResponse();
    }

    const workspaceId = getWorkspaceIdFromPath(req.nextUrl.pathname);
    if (!workspaceId) {
      return NextResponse.next();
    }

    // The token's workspace membership is verified above. Use the JWT role for
    // settings; other workspace URLs still fall through to a fresh check.
    if (tokenWorkspaceId === workspaceId) {
      if (req.nextUrl.pathname.startsWith(`/workspace/${workspaceId}/settings`)) {
        const role = req.auth?.user?.role;
        if (role !== "admin") {
          return redirectToRestricted(request);
        }
      }
      return NextResponse.next();
    }

    return enforceWorkspaceAccess(req, workspaceId, userId);
  });

  return authMiddleware(request, event);
}

async function enforceWorkspaceAccess(
  request: NextRequest,
  workspaceId: string,
  userId: string,
): Promise<Response> {
  if (!(await isMember(userId, workspaceId))) {
    return redirectToRestricted(request);
  }

  return enforceWorkspaceAdmin(request, workspaceId, userId);
}

async function enforceWorkspaceAdmin(
  request: NextRequest,
  workspaceId: string,
  userId: string,
): Promise<Response> {
  if (request.nextUrl.pathname.startsWith(`/workspace/${workspaceId}/settings`)) {
    if (!(await isAdmin(userId, workspaceId))) {
      return redirectToRestricted(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
