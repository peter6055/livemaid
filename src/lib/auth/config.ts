import type { DefaultSession, NextAuthConfig } from "next-auth";
// next-auth re-exports this, but its entrypoint pulls in next/server; @auth/core
// is the dependency-free source of the same symbol.
import { customFetch } from "@auth/core";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getMongoClient } from "@/lib/db/client";
import { isDemoMode } from "@/lib/env";
import {
  ensureDefaultWorkspace,
  findOrCreateUser,
  getActiveWorkspace,
  getWorkspaceById,
  type OidcProfile,
} from "./workspace";
import { cachedDiscoveryFetch } from "./oidcDiscovery";
import { acceptInviteByEmail } from "./invites";
import { ensureAuthSecret } from "./secrets";
import { areOidcCredentialsConfigured } from "./appConfig";

// Ensure a signing secret is available. If the operator did not set one via the
// environment, we generate one and persist it under data/.livemaid/ so sessions
// survive container restarts.
ensureAuthSecret();

declare module "next-auth" {
  interface User {
    id?: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  }

  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      workspaceId?: string;
      role?: "admin" | "member";
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    workspaceId?: string;
    role?: "admin" | "member";
  }
}

export type { User, Session } from "next-auth";

export function getAuthSecret() {
  return ensureAuthSecret();
}

const DAY_IN_SECONDS = 24 * 60 * 60;

function authBasePathFromEnv(): string {
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) return "/api/auth";
  try {
    const pathname = new URL(authUrl).pathname.replace(/\/$/, "");
    if (pathname && pathname !== "/") return pathname;
  } catch {
    // Keep the default when AUTH_URL is not a valid absolute URL.
  }
  return "/api/auth";
}

// Auth.js emits page redirects as bare relative URLs, which drop the
// reverse-proxy prefix. Keep the prefix from BASE_URL (public site URL).
function appPagePath(page: string): string {
  if (!process.env.BASE_URL) return page;
  try {
    const prefix = new URL(process.env.BASE_URL).pathname.replace(/\/$/, "");
    return `${prefix}${page}`;
  } catch {
    return page;
  }
}

export async function createAuthConfig(): Promise<NextAuthConfig> {
  // Instrumentation should set AUTH_URL at startup, but in long-running dev
  // servers (or any environment where the instrumentation hook did not run)
  // we populate it here so Auth.js redirect URLs keep the proxy prefix.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // BASE_URL is the full public site URL including any proxy prefix.
    const baseUrl = (process.env.BASE_URL ?? "").replace(/\/$/, "");
    if (baseUrl && !process.env.AUTH_URL) {
      process.env.AUTH_URL = `${baseUrl}/api/auth`;
    }
  }

  // Auth.js createActionURL keeps AUTH_URL's path only when basePath matches
  // that pathname exactly; otherwise the proxy prefix is wiped from redirect_uri.
  return {
    basePath: authBasePathFromEnv(),
    adapter: MongoDBAdapter(() => getMongoClient()),
    providers: [
      () => ({
        id: "oidc",
        name: "OIDC",
        type: "oidc",
        issuer: process.env.AUTH_OIDC_ISSUER,
        wellKnown: process.env.AUTH_OIDC_ISSUER
          ? `${process.env.AUTH_OIDC_ISSUER}/.well-known/openid-configuration`
          : undefined,
        clientId: process.env.AUTH_OIDC_CLIENT_ID,
        clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET,
        // Discovery is fetched on every sign-in and callback; cache the document.
        [customFetch]: cachedDiscoveryFetch,
        // Auth.js OIDC defaults to PKCE-only; Cloudflare Access requires state.
        checks: ["pkce", "state"],
        // findOrCreateUser in signIn creates the user before the adapter links the account.
        allowDangerousEmailAccountLinking: true,
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
          };
        },
      }),
    ],
    session: {
      strategy: "jwt",
      maxAge: DAY_IN_SECONDS,
      updateAge: 0,
    },
    cookies: {
      sessionToken: {
        name: "next-auth.session-token",
        options: {
          httpOnly: true,
          // Secure cookies break session set on HTTP test:dev / local.
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
      },
    },
    pages: {
      signIn: "/login",
      // Without this, Auth.js lands on /api/auth/error?error=AccessDenied.
      error: appPagePath("/login"),
    },
    trustHost: true,
    secret: ensureAuthSecret(),
    callbacks: {
      async authorized({ request, auth }) {
        const pathname = request.nextUrl.pathname;
        if (pathname === "/login" || pathname.startsWith("/api/auth/")) return true;
        return !!auth?.user?.id;
      },
      async signIn({ profile }) {
        if (!(await areOidcCredentialsConfigured())) {
          throw new Error("Authentication is not configured.");
        }

        if (isDemoMode()) {
          return true;
        }

        const oidcProfile = profile as OidcProfile | undefined;
        if (!oidcProfile?.email) {
          return true;
        }

        const user = await findOrCreateUser(oidcProfile);
        if (user.active === false) {
          return false;
        }
        const acceptedInvite = await acceptInviteByEmail(user);

        if (acceptedInvite) {
          const invitedWorkspace = await getWorkspaceById(acceptedInvite.workspaceId);
          if (!invitedWorkspace) {
            throw new Error("Accepted invite references a missing workspace");
          }
        } else {
          try {
            await ensureDefaultWorkspace(user);
          } catch {
            // Only the first user bootstraps the workspace; everyone else must
            // be invited. Deny the sign-in instead of provisioning an admin.
            return false;
          }
        }

        return true;
      },
      async jwt({ token, user, profile, trigger }) {
        if (trigger === "signIn" || trigger === "update") {
          const userId = user?.id ?? token.sub;
          try {
            let active = userId ? await getActiveWorkspace(userId) : null;
            if (!active) {
              // No active membership yet: create the default workspace for the
              // profile we already have (brand-new user, or an update call).
              const oidcProfile = profile as OidcProfile | undefined;
              const email = user?.email ?? oidcProfile?.email;
              if (email) {
                active = await ensureDefaultWorkspace(
                  await findOrCreateUser({
                    sub: user?.id ?? oidcProfile?.sub ?? token.sub ?? "",
                    email,
                    name: user?.name ?? oidcProfile?.name,
                    image: user?.image ?? oidcProfile?.image,
                  }),
                );
              }
            }
            if (active) {
              token.workspaceId = active.membership.workspaceId.toString();
              token.role = active.membership.role;
            }
          } catch {
            // Leave workspaceId/role unset if the database is unavailable.
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (token.sub) {
          session.user.id = token.sub;
        }
        if (token.workspaceId) {
          session.user.workspaceId = token.workspaceId;
        }
        if (token.role) {
          session.user.role = token.role;
        }
        return session;
      },
    },
  };
}
