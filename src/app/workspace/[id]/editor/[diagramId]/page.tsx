import { isDemoMode } from "@/lib/env";
import LiveMaidEditor from "@/components/LiveMaidEditor";
import { connection } from "next/server";

export default async function WorkspaceEditorPage({
  params,
}: {
  params: Promise<{ id: string; diagramId: string }>;
}) {
  // Read DEMO_MODE at request time (runtime), never baked at build time.
  await connection();

  const { id: workspaceId, diagramId } = await params;
  const isDemo = isDemoMode();

  return <LiveMaidEditor documentId={diagramId} isDemo={isDemo} workspaceId={workspaceId} />;
}
