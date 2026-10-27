import type { DefaultSession, NextAuthConfig } from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getMongoClient } from "@/lib/db/client";
import { isDemoMode } from "@/lib/env";
import {
  ensureDefaultWorkspace,
  findOrCreateUser,
  getWorkspaceById,
  type OidcProfile,
} from "./workspace";
import { runLegacyAdoptionIfNeeded } from "./migration";
import { acceptInviteByEmail } from "./invites";

import type { DbWorkspace } from "@/lib/db/collections";

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

function getAuthSecret() {
  return process.env.AUTH_SECRET;
}

function getOidcIssuer() {
  return process.env.AUTH_OIDC_ISSUER;
}

function getOidcClientId() {
  return process.env.AUTH_OIDC_CLIENT_ID;
}

function getOidcClientSecret() {
  return process.env.AUTH_OIDC_CLIENT_SECRET;
}

export function isAuthEnabled(): boolean {
  return !!(getAuthSecret() && getOidcIssuer() && getOidcClientId() && getOidcClientSecret());
}

export function assertAuthConfigured(): void {
  const missing: string[] = [];
  if (!getAuthSecret()) missing.push("AUTH_SECRET");
  if (!getOidcIssuer()) missing.push("AUTH_OIDC_ISSUER");
  if (!getOidcClientId()) missing.push("AUTH_OIDC_CLIENT_ID");
  if (!getOidcClientSecret()) missing.push("AUTH_OIDC_CLIENT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Authentication is not configured. Missing environment variables: ${missing.join(", ")}`,
    );
  }
}

const DAY_IN_SECONDS = 24 * 60 * 60;

export const authConfig: NextAuthConfig = {
  adapter: MongoDBAdapter(() => getMongoClient()),
  providers: [
    {
      id: "oidc",
      name: "OIDC",
      type: "oidc",
      issuer: getOidcIssuer(),
      wellKnown: getOidcIssuer()
        ? `${getOidcIssuer()}/.well-known/openid-configuration`
        : undefined,
      clientId: getOidcClientId(),
      clientSecret: getOidcClientSecret(),
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    },
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
        secure: true,
        sameSite: "lax",
        path: "/",
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  callbacks: {
    async authorized({ request, auth }) {
      const pathname = request.nextUrl.pathname;
      if (pathname === "/login" || pathname.startsWith("/api/auth/")) return true;
      return !!auth?.user;
    },
    async signIn({ profile }) {
      assertAuthConfigured();

      if (isDemoMode()) {
        return true;
      }

      const oidcProfile = profile as OidcProfile | undefined;
      if (!oidcProfile?.email) {
        return true;
      }

      const user = await findOrCreateUser(oidcProfile);
      const acceptedInvite = await acceptInviteByEmail(user);

      let workspace: DbWorkspace;
      if (acceptedInvite) {
        const invitedWorkspace = await getWorkspaceById(acceptedInvite.workspaceId);
        if (!invitedWorkspace) {
          throw new Error("Accepted invite references a missing workspace");
        }
        workspace = invitedWorkspace;
      } else {
        const result = await ensureDefaultWorkspace(oidcProfile);
        workspace = result.workspace;
      }

      await runLegacyAdoptionIfNeeded(workspace._id.toString());
      return true;
    },
    async jwt({ token, user, profile, trigger }) {
      if (trigger === "signIn" || trigger === "update") {
        const oidcProfile = profile as OidcProfile | undefined;
        const email = user?.email ?? oidcProfile?.email;
        if (email) {
          const workspaceProfile: OidcProfile = {
            sub: user?.id ?? oidcProfile?.sub ?? token.sub ?? "",
            email,
            name: user?.name ?? oidcProfile?.name,
            image: user?.image ?? oidcProfile?.image,
          };
          try {
            const { membership } = await ensureDefaultWorkspace(workspaceProfile);
            token.workspaceId = membership.workspaceId.toString();
            token.role = membership.role;
          } catch {
            // Leave workspaceId/role unset if the database is unavailable.
          }
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
