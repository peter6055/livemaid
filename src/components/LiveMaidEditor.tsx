import { LiveMaidEditor } from "./editor/LiveMaidEditor";

export default function LiveMaidEditorWrapper({
  documentId,
  isDemo,
  workspaceId,
}: {
  documentId: string;
  isDemo?: boolean;
  workspaceId?: string;
}) {
  return <LiveMaidEditor documentId={documentId} isDemo={isDemo} workspaceId={workspaceId} />;
}
