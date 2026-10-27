import LiveMaidEditor from "@/components/LiveMaidEditor";
import { connection } from "next/server";
import { auth, isAuthEnabled } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { redirect } from "next/navigation";
import type { Session } from "@/lib/auth";

export function getEditorRedirect(
  session: Session | null,
  isDemo: boolean,
  authEnabled: boolean,
  diagramId: string,
): string | null {
  if (isDemo || !authEnabled) return null;
  if (session?.user?.workspaceId)
    return `/workspace/${session.user.workspaceId}/editor/${diagramId}`;
  return null;
}

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  // Read DEMO_MODE at request time (runtime), never baked at build time.
  await connection();
  const { id } = await params;
  const isDemo = isDemoMode();
  const authEnabled = isAuthEnabled();

  const session = authEnabled ? await auth() : null;
  const redirectPath = getEditorRedirect(session, isDemo, authEnabled, id);
  if (redirectPath) {
    redirect(redirectPath);
  }

  return <LiveMaidEditor documentId={id} isDemo={isDemo} />;
}
