import { auth, isAuthEnabled } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getWorkspaceById } from "@/lib/auth/workspace";
import { Button } from "@/components/ui/button";
import { connection } from "next/server";
import Link from "next/link";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Opt out of build-time prerendering so runtime env flags are read fresh.
  await connection();

  const { id: workspaceId } = await params;
  const isDemo = isDemoMode();
  const authEnabled = isAuthEnabled();
  const session = !isDemo && authEnabled ? await auth() : null;

  let workspaceName = "Workspace";
  try {
    const workspace = await getWorkspaceById(workspaceId);
    if (workspace) workspaceName = workspace.name;
  } catch {
    // If the database is unavailable, fall back to the workspace id placeholder.
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{workspaceName}</h1>
      <p className="text-sm text-muted-foreground mt-1">Workspace ID: {workspaceId}</p>
      {session?.user?.email && (
        <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
      )}
      <div className="mt-6">
        <Link href={`/workspace/${workspaceId}/settings/members`}>
          <Button variant="outline">Manage members</Button>
        </Link>
      </div>
    </main>
  );
}
