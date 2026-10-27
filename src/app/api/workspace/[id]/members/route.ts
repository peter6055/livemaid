import { NextResponse } from "next/server";
import {
  requireMember,
  requireAdmin,
  writeAuditLog,
  getWorkspaceMembers,
  inviteMember,
} from "@/lib/auth";
import { getRequiredSession, handleRouteError } from "@/lib/auth/routeAuth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  try {
    const session = await getRequiredSession();
    await requireMember(session.user.id, workspaceId);
    const members = await getWorkspaceMembers(workspaceId);
    return NextResponse.json(members);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  try {
    const session = await getRequiredSession();
    await requireAdmin(session.user.id, workspaceId);

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role = body.role === "admin" ? "admin" : "member";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const membership = await inviteMember(workspaceId, email, role);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "membership.invite",
      targetId: membership._id.toString(),
      request,
    });
    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
