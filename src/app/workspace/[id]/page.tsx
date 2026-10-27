import { auth, isAuthEnabled } from "@/lib/auth";
import { isDemoMode, getDisplayVersion, getRawVersion } from "@/lib/env";
import Dashboard from "@/components/Dashboard";
import { connection } from "next/server";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Opt out of build-time prerendering so DEMO_MODE is read from the live runtime environment.
  await connection();

  const { id: workspaceId } = await params;
  const isDemo = isDemoMode();
  const rawVersion = getRawVersion();
  const displayVersion = getDisplayVersion();

  const authEnabled = isAuthEnabled();
  const session = authEnabled ? await auth() : null;
  const userWorkspaceId = session?.user?.workspaceId;

  // Workspace-membership enforcement will be added in Task #51. For now, render for the
  // requested workspace id even if it does not match the user's own workspace.
  void userWorkspaceId;

  return (
    <Dashboard
      isDemo={isDemo}
      appVersion={displayVersion}
      rawVersion={rawVersion}
      workspaceId={workspaceId}
    />
  );
}
