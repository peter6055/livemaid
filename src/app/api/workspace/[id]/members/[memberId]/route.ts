import { NextResponse } from "next/server";
import { requireAdmin, writeAuditLog, updateMemberRole, removeMember } from "@/lib/auth";
import { getRequiredSession, handleRouteError } from "@/lib/auth/routeAuth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: workspaceId, memberId } = await params;
  try {
    const session = await getRequiredSession();
    await requireAdmin(session.user.id, workspaceId);

    const body = await request.json();
    const role = body.role === "admin" ? "admin" : "member";

    await updateMemberRole(workspaceId, memberId, role);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "membership.role_change",
      targetId: memberId,
      request,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: workspaceId, memberId } = await params;
  try {
    const session = await getRequiredSession();
    await requireAdmin(session.user.id, workspaceId);

    await removeMember(workspaceId, memberId);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "membership.remove",
      targetId: memberId,
      request,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
