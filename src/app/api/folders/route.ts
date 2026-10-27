import { NextResponse } from "next/server";
import { getFolders, saveFolder, getFolder, Folder } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import { isAuthEnabled, writeAuditLog } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getRequiredSession, getUserWorkspaceId, handleRouteError } from "@/lib/auth/routeAuth";
import type { AuditAction } from "@/lib/auth/audit";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId") ?? undefined;

    let folders = await getFolders();

    if (!isDemoMode() && isAuthEnabled()) {
      const session = await getRequiredSession();
      const workspaceId = requestedWorkspaceId ?? getUserWorkspaceId(session);
      if (!workspaceId) {
        return NextResponse.json([]);
      }
      const { requireMember } = await import("@/lib/auth");
      await requireMember(session.user.id, workspaceId);
      folders = folders.filter((f) => f.workspaceId === workspaceId);
    }

    return NextResponse.json(folders);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Demo mode: creating folders is disabled" }, { status: 403 });
  }

  try {
    const session = await getRequiredSession();
    const sessionWorkspaceId = getUserWorkspaceId(session);
    if (!sessionWorkspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await request.json();
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : sessionWorkspaceId;

    const { requireMember } = await import("@/lib/auth");
    await requireMember(session.user.id, workspaceId);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const parentId = typeof body.parentId === "string" ? body.parentId : null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Guard against a parentId that points to a non-existent folder.
    if (parentId) {
      const parent = await getFolder(parentId);
      if (!parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const folder: Folder = {
      id: nanoid(),
      name,
      parentId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      starred: false,
      starredAt: null,
    };

    await saveFolder(folder);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "folder.create" as AuditAction,
      targetId: folder.id,
      request,
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
