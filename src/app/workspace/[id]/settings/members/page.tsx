"use client";

import { useParams } from "next/navigation";
import { WorkspaceMembersManager } from "@/components/WorkspaceMembersManager";

export default function WorkspaceMembersPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  return (
    <main className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Member management</h1>
      <WorkspaceMembersManager workspaceId={workspaceId} />
    </main>
  );
}
