import { auth, isAuthEnabled } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { appUrl } from "@/lib/api/url";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id: workspaceId } = await params;
  // workspaceId will be used by the workspace shell in Task #51.
  void workspaceId;
  const isDemo = isDemoMode();
  const authEnabled = await isAuthEnabled();

  if (!isDemo && authEnabled) {
    const session = await auth();
    if (!session) {
      redirect(appUrl("/login"));
    }
  }

  return <>{children}</>;
}
