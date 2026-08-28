import { NextResponse } from "next/server";
import { getDiagram, saveDiagram, deleteDiagram, IS_DEMO_MODE } from "@/lib/api/storage";
import { nanoid } from "nanoid";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const diagram = await getDiagram(id);
    if (!diagram) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    return NextResponse.json(diagram);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch diagram" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (IS_DEMO_MODE) {
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
    } catch (error) {
      return NextResponse.json({ error: "Failed to fetch diagram" }, { status: 500 });
    }
  }

  try {
    const existing = await getDiagram(id);
    if (!existing) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }

    const body = await request.json();

    // Conditional update: code writes carry `expectedCode` — the server state the client last
    // saw. If the server moved on since then, refuse with 409 + the current doc so the client
    // can surface a conflict instead of silently clobbering a concurrent save. Metadata-only
    // writes (rename/move/star) omit `expectedCode` and stay unconditional.
    // ponytail: compare-then-write is atomic only within one server instance; a multi-instance
    // deployment needs a real compare-and-swap inside the storage adapter.
    if (typeof body.expectedCode === "string" && body.expectedCode !== existing.code) {
      return NextResponse.json(existing, { status: 409 });
    }

    // `expectedCode` is a write precondition, not document data — never persist it.
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

    // Merge updates
    const updated = {
      ...existing,
      ...updates,
      id, // Protect ID
      updatedAt: new Date().toISOString(),
      starred: Boolean(nextStarred),
      starredAt: nextStarred ? (nextStarredAt ?? new Date().toISOString()) : null,
      versionHistory: nextVersionHistory,
    };

    await saveDiagram(updated);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update diagram" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (IS_DEMO_MODE) {
    return NextResponse.json(
      { error: "Demo mode: deleting diagrams is disabled" },
      { status: 403 },
    );
  }

  try {
    const success = await deleteDiagram(id);
    if (!success) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete diagram" }, { status: 500 });
  }
}
