import { NextResponse } from "next/server";
import { getDiagrams, saveDiagram, DiagramDocument } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import {
  getDiagramCatalogItem,
  getDiagramTemplate,
  isCreatableDiagramType,
} from "@/lib/diagrams/catalog";
import { isAuthEnabled, writeAuditLog } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getRequiredSession, getUserWorkspaceId, handleRouteError } from "@/lib/auth/routeAuth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitStr = searchParams.get("limit");
    const offsetStr = searchParams.get("offset");
    const search = searchParams.get("search");
    const requestedWorkspaceId = searchParams.get("workspaceId") ?? undefined;

    let diagrams = await getDiagrams();

    if (!isDemoMode() && isAuthEnabled()) {
      const session = await getRequiredSession();
      const workspaceId = requestedWorkspaceId ?? getUserWorkspaceId(session);
      if (!workspaceId) {
        return NextResponse.json({ items: [], total: 0 });
      }
      const { requireMember } = await import("@/lib/auth");
      await requireMember(session.user.id, workspaceId);
      diagrams = diagrams.filter((d) => d.workspaceId === workspaceId);
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      diagrams = diagrams.filter((d) => d.name.toLowerCase().includes(lowerSearch));
    }

    const total = diagrams.length;

    if (limitStr !== null && offsetStr !== null) {
      const limit = parseInt(limitStr, 10);
      const offset = parseInt(offsetStr, 10);
      diagrams = diagrams.slice(offset, offset + limit);
    }

    return NextResponse.json({ items: diagrams, total });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json(
      { error: "Demo mode: creating diagrams is disabled" },
      { status: 403 },
    );
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

    const template =
      typeof body.templateId === "string" ? getDiagramTemplate(body.templateId) : null;
    const requestedType =
      template?.type ?? (typeof body.type === "string" ? body.type : "flowchart");
    const { name, code } = body;
    const folderId = typeof body.folderId === "string" ? body.folderId : null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!isCreatableDiagramType(requestedType)) {
      return NextResponse.json({ error: "Unsupported diagram type" }, { status: 400 });
    }

    const catalogItem = getDiagramCatalogItem(requestedType);
    const finalCode = typeof code === "string" ? code : (template?.code ?? catalogItem.defaultCode);
    const now = new Date().toISOString();

    const newDiagram: DiagramDocument = {
      id: nanoid(),
      name,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      code: finalCode,
      type: requestedType,
      folderId,
      workspaceId,
      starred: false,
      starredAt: null,
      subPages: [],
      comments: [],
      versionHistory: [],
    };

    await saveDiagram(newDiagram);
    await writeAuditLog({
      actorId: session.user.id,
      workspaceId,
      action: "diagram.create",
      targetId: newDiagram.id,
      request,
    });
    return NextResponse.json(newDiagram, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
