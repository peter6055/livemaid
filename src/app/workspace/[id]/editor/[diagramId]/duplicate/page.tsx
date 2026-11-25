import { redirect } from "next/navigation";
import { appUrl } from "@/lib/api/url";

export default async function WorkspaceDuplicateDiagramPage({
  params,
}: {
  params: Promise<{ id: string; diagramId: string }>;
}) {
  const { id: workspaceId, diagramId } = await params;
  // The actual duplication logic will be updated in Task #51. For now, redirect back to the
  // source diagram's editor page.
  redirect(appUrl(`/workspace/${workspaceId}/editor/${diagramId}`));
}
