import { NextResponse } from 'next/server';
import { getDiagram, saveDiagram, deleteDiagram } from '@/lib/api/storage';

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
    
    // Merge updates
    const updated = {
      ...existing,
      ...body,
      id, // Protect ID
      updatedAt: new Date().toISOString(),
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
