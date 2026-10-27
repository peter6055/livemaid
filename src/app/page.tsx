import { auth, isAuthEnabled } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";
import { connection } from "next/server";
import { isDemoMode, getDisplayVersion, getRawVersion } from "@/lib/env";
import { redirect } from "next/navigation";
import type { Session } from "@/lib/auth";

export function getHomeRedirect(
  session: Session | null,
  isDemo: boolean,
  authEnabled: boolean,
): string | null {
  if (isDemo || !authEnabled) return null;
  if (session?.user?.workspaceId) return `/workspace/${session.user.workspaceId}`;
  return null;
}

export default async function Home() {
  // Opt out of build-time prerendering so DEMO_MODE is read from the live
  // runtime environment (e.g. Railway service variables) instead of being baked
  // into the static bundle at build time.
  await connection();
  const isDemo = isDemoMode();
  const rawVersion = getRawVersion();
  const displayVersion = getDisplayVersion();
  const authEnabled = isAuthEnabled();

  const session = authEnabled ? await auth() : null;
  const redirectPath = getHomeRedirect(session, isDemo, authEnabled);
  if (redirectPath) {
    redirect(redirectPath);
  }

  return <Dashboard isDemo={isDemo} appVersion={displayVersion} rawVersion={rawVersion} />;
}
