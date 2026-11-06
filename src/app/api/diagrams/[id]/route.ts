import { NextResponse } from "next/server";
import { getDiagram, saveDiagram, deleteDiagram } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import { isAuthEnabled, writeAuditLog } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import {
  getRequiredSession,
  getUserWorkspaceId,
  assertDiagramAccess,
  handleRouteError,
} from "@/lib/auth/routeAuth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authEnabled = await isAuthEnabled();
    if (!isDemoMode() && authEnabled) {
      const session = await getRequiredSession();
      const workspaceId = getUserWorkspaceId(session);
      if (!workspaceId) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      const { requireMember } = await import("@/lib/auth");
      await requireMember(session.user.id, workspaceId);
      const diagram = await getDiagram(id);
      if (!diagram) {
        return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
      }
      assertDiagramAccess(session.user.id, workspaceId, diagram);
      return NextResponse.json(diagram);
    }

    const diagram = await getDiagram(id);
    if (!diagram) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    return NextResponse.json(diagram);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isDemoMode()) {
    try {
      const body = await request.json();
      // Metadata writes (rename/move/star) are rejected in demo mode.
      if (body.code === undefined) {
        return NextResponse.json(
          { error: "Demo mode: editing diagrams is disabled" },
          { status: 403 },
        );
      }
      // Code edits: return existing diagram as if saved (read-only illusion)
      const existing = await getDiagram(id);
      if (!existing) {
        return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
      }
      return NextResponse.json(existing);
    } catch {
      return NextResponse.json({ error: "Failed to fetch diagram" }, { status: 500 });
    }
  }

  try {
    const authEnabled = await isAuthEnabled();
    const body = await request.json();

    if (!authEnabled) {
      const existing = await getDiagram(id);
      if (!existing) {
        return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
      }

      if (typeof body.expectedCode === "string" && body.expectedCode !== existing.code) {
        return NextResponse.json(existing, { status: 409 });
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { expectedCode: _expectedCode, ...updates } = body;

      const nextStarred = typeof updates.starred === "boolean" ? updates.starred : existing.starred;
      const nextStarredAt =
        typeof updates.starredAt === "string" || updates.starredAt === null
          ? updates.starredAt
          : existing.starredAt;
      const requestedHistory = Array.isArray(updates.versionHistory)
        ? updates.versionHistory
        : null;
      const baseHistory = requestedHistory ?? existing.versionHistory ?? [];

      const nextVersionHistory =
        typeof updates.code === "string" && updates.code !== existing.code
          ? [
              {
                id: nanoid(),
                code: existing.code,
                timestamp: existing.updatedAt,
                label: (() => {
                  const n = ((existing.versionHistory ?? []).length || 0) + 1;
                  const d = new Date(existing.updatedAt);
                  const h = d.getHours() % 12 || 12;
                  const m = String(d.getMinutes()).padStart(2, "0");
                  const ampm = d.getHours() >= 12 ? "PM" : "AM";
                  return `Snapshot ${n} - ${h}:${m} ${ampm}`;
                })(),
                starred: false,
              },
              ...baseHistory,
            ].slice(0, 100)
          : baseHistory;

      const updated = {
        ...existing,
        ...updates,
        id,
        updatedAt: new Date().toISOString(),
        starred: Boolean(nextStarred),
        starredAt: nextStarred ? (nextStarredAt ?? new Date().toISOString()) : null,
        versionHistory: nextVersionHistory,
      };

      await saveDiagram(updated);
      return NextResponse.json(updated);
    }

    const session = await getRequiredSession();
    const workspaceId = getUserWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const { requireMember } = await import("@/lib/auth");
    await requireMember(session.user.id, workspaceId);

    const existing = await getDiagram(id);
    if (!existing) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    assertDiagramAccess(session.user.id, workspaceId, existing);

    if (typeof body.expectedCode === "string" && body.expectedCode !== existing.code) {
      return NextResponse.json(existing, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { expectedCode: _expectedCode, ...updates } = body;

    const nextStarred = typeof updates.starred === "boolean" ? updates.starred : existing.starred;
    const nextStarredAt =
      typeof updates.starredAt === "string" || updates.starredAt === null
        ? updates.starredAt
        : existing.starredAt;
    const requestedHistory = Array.isArray(updates.versionHistory) ? updates.versionHistory : null;
    const baseHistory = requestedHistory ?? existing.versionHistory ?? [];

    const nextVersionHistory =
      typeof updates.code === "string" && updates.code !== existing.code
        ? [
            {
              id: nanoid(),
              code: existing.code,
              timestamp: existing.updatedAt,
              label: (() => {
                const n = ((existing.versionHistory ?? []).length || 0) + 1;
                const d = new Date(existing.updatedAt);
                const h = d.getHours() % 12 || 12;
                const m = String(d.getMinutes()).padStart(2, "0");
                const ampm = d.getHours() >= 12 ? "PM" : "AM";
                return `Snapshot ${n} - ${h}:${m} ${ampm}`;
              })(),
              starred: false,
            },
            ...baseHistory,
          ].slice(0, 100)
        : baseHistory;

    const updated = {
      ...existing,
      ...updates,
      id,
      workspaceId,
      updatedAt: new Date().toISOString(),
      starred: Boolean(nextStarred),
      starredAt: nextStarred ? (nextStarredAt ?? new Date().toISOString()) : null,
      versionHistory: nextVersionHistory,
    };

    await saveDiagram(updated);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "diagram.update",
      targetId: id,
      request,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isDemoMode()) {
    return NextResponse.json(
      { error: "Demo mode: deleting diagrams is disabled" },
      { status: 403 },
    );
  }

  try {
    const authEnabled = await isAuthEnabled();

    if (!authEnabled) {
      const success = await deleteDiagram(id);
      if (!success) {
        return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
      }
      return new NextResponse(null, { status: 204 });
    }

    const session = await getRequiredSession();
    const workspaceId = getUserWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const { requireMember } = await import("@/lib/auth");
    await requireMember(session.user.id, workspaceId);

    const existing = await getDiagram(id);
    if (!existing) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    assertDiagramAccess(session.user.id, workspaceId, existing);

    const success = await deleteDiagram(id);
    if (!success) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "diagram.delete",
      targetId: id,
      request,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
