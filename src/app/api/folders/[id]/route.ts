import { NextResponse } from 'next/server';
import { getFolders, getFolder, saveFolder, deleteFolderCascade, IS_DEMO_MODE } from '@/lib/api/storage';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (IS_DEMO_MODE) {
        return NextResponse.json({ error: 'Demo mode: editing folders is disabled' }, { status: 403 });
    }

    try {
        const existing = await getFolder(id);
        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        const body = await request.json();
        const next = { ...existing };

        if (typeof body.name === 'string') {
            const trimmed = body.name.trim();
            if (!trimmed) {
                return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
            }
            next.name = trimmed;
        }

        if ('parentId' in body) {
            const newParentId = typeof body.parentId === 'string' ? body.parentId : null;

            if (newParentId === id) {
                return NextResponse.json({ error: 'A folder cannot be its own parent' }, { status: 400 });
            }

            if (newParentId) {
                const parent = await getFolder(newParentId);
                if (!parent) {
                    return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 });
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
                    return NextResponse.json({ error: 'Cannot move a folder into its own subtree' }, { status: 400 });
                }
            }

            next.parentId = newParentId;
        }

        next.updatedAt = new Date().toISOString();
        await saveFolder(next);
        return NextResponse.json(next);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (IS_DEMO_MODE) {
        return NextResponse.json({ error: 'Demo mode: deleting folders is disabled' }, { status: 403 });
    }

    try {
        const success = await deleteFolderCascade(id);
        if (!success) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
    }
}
