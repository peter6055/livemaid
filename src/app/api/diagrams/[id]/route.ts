import { NextResponse } from 'next/server';
import { getDiagram, saveDiagram, deleteDiagram } from '@/lib/api/storage';
import { nanoid } from 'nanoid';

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
    const requestedHistory = Array.isArray(body.versionHistory) ? body.versionHistory : null;
    const baseHistory = requestedHistory ?? existing.versionHistory ?? [];

    const nextVersionHistory =
      typeof body.code === 'string' && body.code !== existing.code
        ? [
            {
              id: nanoid(),
              code: existing.code,
              timestamp: existing.updatedAt,
              label: (() => {
              const n = ((existing.versionHistory ?? []).length || 0) + 1;
              const d = new Date(existing.updatedAt);
              const h = d.getHours() % 12 || 12;
              const m = String(d.getMinutes()).padStart(2, '0');
              const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
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
      ...body,
      id, // Protect ID
      updatedAt: new Date().toISOString(),
      versionHistory: nextVersionHistory,
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
