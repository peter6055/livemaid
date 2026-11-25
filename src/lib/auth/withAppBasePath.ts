import { NextRequest } from "next/server";

type AuthHandler = (req: NextRequest) => Promise<Response> | Response;

/**
 * After a strip-prefix reverse proxy, Next sees `/api/auth/...` while
 * `AUTH_URL` (and Auth.js `basePath`) is `/<prefix>/api/auth`. Rewrite the
 * request URL so Auth.js can parse the action and keep the public path in
 * OIDC `redirect_uri` values.
 */
export function withAppBasePath(handler: AuthHandler): AuthHandler {
  return (req) => {
    const authUrl = process.env.AUTH_URL;
    if (!authUrl) return handler(req);

    let authOrigin: string;
    let authPath: string;
    try {
      const parsed = new URL(authUrl);
      authOrigin = parsed.origin;
      authPath = parsed.pathname.replace(/\/$/, "") || "/api/auth";
    } catch {
      return handler(req);
    }

    const url = new URL(req.url);
    if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
      const suffix = url.pathname.slice("/api/auth".length);
      const rewritten = new NextRequest(`${authOrigin}${authPath}${suffix}${url.search}`, req);
      return handler(rewritten);
    }

    if (url.origin !== authOrigin) {
      return handler(new NextRequest(url.href.replace(url.origin, authOrigin), req));
    }

    return handler(req);
  };
}
