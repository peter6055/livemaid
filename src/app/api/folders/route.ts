import { NextResponse } from 'next/server';
import { getFolders, saveFolder, getFolder, Folder, IS_DEMO_MODE } from '@/lib/api/storage';
import { nanoid } from 'nanoid';

export async function GET() {
    try {
        const folders = await getFolders();
        return NextResponse.json(folders);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (IS_DEMO_MODE) {
        return NextResponse.json({ error: 'Demo mode: creating folders is disabled' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const parentId = typeof body.parentId === 'string' ? body.parentId : null;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Guard against a parentId that points to a non-existent folder.
        if (parentId) {
            const parent = await getFolder(parentId);
            if (!parent) {
                return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 });
            }
        }

        const now = new Date().toISOString();
        const folder: Folder = {
            id: nanoid(),
            name,
            parentId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };

        await saveFolder(folder);
        return NextResponse.json(folder, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }
}
