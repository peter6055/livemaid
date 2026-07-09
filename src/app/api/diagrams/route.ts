import { NextResponse } from "next/server";
import { getDiagrams, saveDiagram, DiagramDocument, IS_DEMO_MODE } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import {
  getDiagramCatalogItem,
  getDiagramTemplate,
  isCreatableDiagramType,
} from "@/lib/diagrams/catalog";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitStr = searchParams.get("limit");
    const offsetStr = searchParams.get("offset");
    const search = searchParams.get("search");

    let diagrams = await getDiagrams();

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
    return NextResponse.json({ error: "Failed to fetch diagrams" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (IS_DEMO_MODE) {
    return NextResponse.json(
      { error: "Demo mode: creating diagrams is disabled" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
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
      starred: false,
      starredAt: null,
      subPages: [],
      comments: [],
      versionHistory: [],
    };

    await saveDiagram(newDiagram);
    return NextResponse.json(newDiagram, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create diagram" }, { status: 500 });
  }
}
