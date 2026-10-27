import { NextResponse } from "next/server";
import { getFolders, getFolder, saveFolder, deleteFolderCascade } from "@/lib/api/storage";
import { isAuthEnabled, writeAuditLog } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import {
  getRequiredSession,
  getUserWorkspaceId,
  assertFolderAccess,
  handleRouteError,
} from "@/lib/auth/routeAuth";
import type { AuditAction } from "@/lib/auth/audit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!isDemoMode() && isAuthEnabled()) {
      const session = await getRequiredSession();
      const workspaceId = getUserWorkspaceId(session);
      if (!workspaceId) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      const { requireMember } = await import("@/lib/auth");
      await requireMember(session.user.id, workspaceId);
      const folder = await getFolder(id);
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
      assertFolderAccess(session.user.id, workspaceId, folder);
      return NextResponse.json(folder);
    }

    const folder = await getFolder(id);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    return NextResponse.json(folder);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ error: "Demo mode: editing folders is disabled" }, { status: 403 });
  }

  try {
    const session = await getRequiredSession();
    const workspaceId = getUserWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const { requireMember } = await import("@/lib/auth");
    await requireMember(session.user.id, workspaceId);

    const existing = await getFolder(id);
    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    assertFolderAccess(session.user.id, workspaceId, existing);

    const body = await request.json();
    const next = { ...existing };

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      next.name = trimmed;
    }

    if ("parentId" in body) {
      const newParentId = typeof body.parentId === "string" ? body.parentId : null;

      if (newParentId === id) {
        return NextResponse.json({ error: "A folder cannot be its own parent" }, { status: 400 });
      }

      if (newParentId) {
        const parent = await getFolder(newParentId);
        if (!parent) {
          return NextResponse.json({ error: "Parent folder not found" }, { status: 400 });
        }

        // Cycle guard: the new parent must not be a descendant of this folder.
        const allFolders = await getFolders();
        const childrenOf = (pid: string) => allFolders.filter((f) => f.parentId === pid);
        const descendants = new Set<string>();
        const stack = [id];
        while (stack.length) {
          const current = stack.pop()!;
          for (const child of childrenOf(current)) {
            if (!descendants.has(child.id)) {
              descendants.add(child.id);
              stack.push(child.id);
            }
          }
        }
        if (descendants.has(newParentId)) {
          return NextResponse.json(
            { error: "Cannot move a folder into its own subtree" },
            { status: 400 },
          );
        }
      }

      next.parentId = newParentId;
    }

    if (typeof body.starred === "boolean") {
      next.starred = body.starred;
      next.starredAt = body.starred
        ? typeof body.starredAt === "string"
          ? body.starredAt
          : new Date().toISOString()
        : null;
    }

    next.updatedAt = new Date().toISOString();
    await saveFolder(next);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "folder.update" as AuditAction,
      targetId: id,
      request,
    });
    return NextResponse.json(next);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ error: "Demo mode: deleting folders is disabled" }, { status: 403 });
  }

  try {
    const session = await getRequiredSession();
    const workspaceId = getUserWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const { requireMember } = await import("@/lib/auth");
    await requireMember(session.user.id, workspaceId);

    const existing = await getFolder(id);
    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    assertFolderAccess(session.user.id, workspaceId, existing);

    const success = await deleteFolderCascade(id);
    if (!success) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "folder.delete" as AuditAction,
      targetId: id,
      request,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
