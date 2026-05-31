import { NextResponse } from 'next/server';
import { getDiagram, saveDiagram, deleteDiagram } from '@/lib/api/storage';
import { nanoid } from 'nanoid';

const MAX_VERSION_HISTORY = 50;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const diagram = await getDiagram(id);
    if (!diagram) {
      return NextResponse.json({ error: 'Diagram not found' }, { status: 404 });
    }
    return NextResponse.json(diagram);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch diagram' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const existing = await getDiagram(id);
    if (!existing) {
      return NextResponse.json({ error: 'Diagram not found' }, { status: 404 });
    }

    const body = await request.json();
    const now = new Date().toISOString();
    const shouldSnapshotCurrentCode =
      typeof body.code === 'string' &&
      typeof existing.code === 'string' &&
      body.code !== existing.code;
    const existingHistory = Array.isArray(existing.versionHistory) ? existing.versionHistory : [];
    const versionHistory = shouldSnapshotCurrentCode
      ? [
          {
            id: nanoid(),
            code: existing.code,
            timestamp: existing.updatedAt || now,
          },
          ...existingHistory,
        ].slice(0, MAX_VERSION_HISTORY)
      : existingHistory;

    const updated = {
      ...existing,
      ...body,
      id, // Protect ID
      updatedAt: now,
      versionHistory,
    };

    await saveDiagram(updated);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update diagram' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const success = await deleteDiagram(id);
    if (!success) {
      return NextResponse.json({ error: 'Diagram not found' }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete diagram' }, { status: 500 });
  }
}
