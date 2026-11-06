import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { auth, isAuthEnabled, isAdmin, isMember } from "@/lib/auth";
import { areOidcCredentialsConfigured, getAppConfigDoc } from "@/lib/auth/appConfig";
import { isDemoMode } from "@/lib/env";

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

function redirectToLogin(request: NextRequest): Response {
  return NextResponse.redirect(new URL("/login", request.url));
}

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Response> {
  const authEnabled = await isAuthEnabled();
  const pathname = request.nextUrl.pathname;

  if (isDemoMode() || !authEnabled) {
    // Auth may be turned off (public portal) or requested but not yet
    // configured. In the latter case, force the setup flow but still allow the
    // admin to reach /admin/settings to cancel the toggle.
    const appConfig = await getAppConfigDoc();
    if (appConfig.authEnabled && !areOidcCredentialsConfigured()) {
      if (
        pathname === "/admin/setup" ||
        pathname === "/admin/settings" ||
        pathname.startsWith("/api/admin/auth-toggle") ||
        pathname === "/login" ||
        pathname.startsWith("/api/auth/") ||
        isPublicPath(pathname)
      ) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/admin/setup", request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  type AuthHandler = (req: NextAuthRequest) => Response | Promise<Response>;
  type AuthMiddleware = (
    handler: AuthHandler,
  ) => (req: NextRequest, ev: NextFetchEvent) => Promise<Response>;

  const authMiddleware = (auth as unknown as AuthMiddleware)((req: NextAuthRequest) => {
    const workspaceId = getWorkspaceIdFromPath(req.nextUrl.pathname);
    if (!workspaceId) {
      return NextResponse.next();
    }

    const userId = req.auth?.user?.id;
    const tokenWorkspaceId = req.auth?.user?.workspaceId;
    if (!userId) {
      return redirectToLogin(request);
    }

    // Trust the workspace id and role encoded in the JWT when the workspace
    // matches the URL. This avoids a database round-trip on every request and
    // lets tests run without a real MongoDB instance as long as the session
    // cookie is valid.
    if (tokenWorkspaceId === workspaceId) {
      if (req.nextUrl.pathname.startsWith(`/workspace/${workspaceId}/settings`)) {
        const role = req.auth?.user?.role;
        if (role !== "admin") {
          return redirectToLogin(request);
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
    return redirectToLogin(request);
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
      return redirectToLogin(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export const runtime = "nodejs";
