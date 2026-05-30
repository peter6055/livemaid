import { NextResponse } from 'next/server';
import { getDiagrams, saveDiagram, DiagramDocument } from '@/lib/api/storage';
import { nanoid } from 'nanoid';
import { DiagramRegistry } from '@/lib/diagrams/registry';

export async function GET() {
  try {
    const diagrams = await getDiagrams();
    return NextResponse.json(diagrams);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch diagrams' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type = 'flowchart' } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const plugin = DiagramRegistry[type] || DiagramRegistry['flowchart'];
    const defaultCode = plugin.defaultCode;

    const newDiagram: DiagramDocument = {
      id: nanoid(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      code: defaultCode,
      type,
      subPages: [],
      comments: [],
      versionHistory: [],
    };

    await saveDiagram(newDiagram);
    return NextResponse.json(newDiagram, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create diagram' }, { status: 500 });
  }
}
