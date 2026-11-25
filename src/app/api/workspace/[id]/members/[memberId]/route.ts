import { NextResponse } from "next/server";
import {
  requireAdmin,
  writeAuditLog,
  updateMemberRole,
  removeMember,
  setUserActive,
} from "@/lib/auth";
import { getRequiredSession, handleRouteError } from "@/lib/auth/routeAuth";
import { getMembershipsCollection } from "@/lib/db/collections";
import { ObjectId } from "mongodb";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: workspaceId, memberId } = await params;
  try {
    const session = await getRequiredSession();
    await requireAdmin(session.user.id, workspaceId);

    const body = await request.json();
    const hasRole = body.role === "admin" || body.role === "member";
    const hasActive = typeof body.active === "boolean";

    if (!hasRole && !hasActive) {
      return NextResponse.json({ error: "role or active is required" }, { status: 400 });
    }

    if (hasRole) {
      await updateMemberRole(workspaceId, memberId, body.role);
      await writeAuditLog({
        actorId: session.user.id,
        workspaceId,
        action: "membership.role_change",
        targetId: memberId,
        request,
      });
    }

    if (hasActive) {
      const memberships = await getMembershipsCollection();
      const membership = await memberships.findOne({
        _id: new ObjectId(memberId),
        workspaceId: new ObjectId(workspaceId),
      });
      if (!membership?.userId) {
        return NextResponse.json(
          { error: "Cannot set active on a pending invite without a user" },
          { status: 400 },
        );
      }
      await setUserActive(membership.userId.toString(), body.active);
      await writeAuditLog({
        actorId: session.user.id,
        workspaceId,
        action: "user.active_change",
        targetId: membership.userId.toString(),
        metadata: { active: body.active, membershipId: memberId },
        request,
      });
    }

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
