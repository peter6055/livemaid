// Storage domain types + the StorageAdapter contract.
//
// This module defines the persistence-layer SHAPE (documents) and the INTERFACE every storage
// backend must implement. The current backend is the local file system (`storageFsAdapter.ts`); a
// future MongoDB backend simply implements this same `StorageAdapter` interface and gets swapped in
// at the single instantiation point in `storage.ts`. No API route or frontend code references a
// concrete backend — they only use the façade in `storage.ts` — so migrating backends is a
// localized change.

export interface DiagramDocument {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    code: string;
    type: 'flowchart' | 'sequence' | 'class';
    folderId: string | null;
    subPages: { id: string; name: string; code: string }[];
    comments: { id: string; content: string; timestamp: string }[];
    versionHistory: VersionHistoryEntry[];
}

export interface VersionHistoryEntry {
    id: string;
    code: string;
    timestamp: string;
    label?: string;
    starred?: boolean;
}

export interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

// Whether the app runs in read-only demo mode. Read here once so every backend (and the API routes
// that return 403s for writes) shares a single source of truth.
export const IS_DEMO_MODE = process.env.DEMO_MODE === 'true';

// Coerce an arbitrary parsed record into a fully-formed DiagramDocument with safe defaults. Backend-
// agnostic so both the FS adapter and a future Mongo adapter hydrate documents identically.
export function normalizeDiagramDocument(raw: Partial<DiagramDocument>): DiagramDocument {
    return {
        id: raw.id || '',
        name: raw.name || 'Untitled Diagram',
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : null,
        code: raw.code || '',
        type: raw.type || 'flowchart',
        folderId: typeof raw.folderId === 'string' ? raw.folderId : null,
        subPages: Array.isArray(raw.subPages) ? raw.subPages : [],
        comments: Array.isArray(raw.comments) ? raw.comments : [],
        versionHistory: Array.isArray(raw.versionHistory) ? raw.versionHistory : [],
    };
}

export function normalizeFolder(raw: Partial<Folder>): Folder {
    return {
        id: raw.id || '',
        name: raw.name || 'Untitled Folder',
        parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : null,
    };
}

// The persistence contract. Every storage backend (file system today, MongoDB later) implements
// exactly these methods. Reads exclude soft-deleted records; writes are no-ops in demo mode; folder
// deletion reparents contents so nothing is orphaned. Keeping this surface minimal is deliberate —
// it is the entire API the rest of the app depends on.
export interface StorageAdapter {
    // Diagrams
    getDiagrams(): Promise<DiagramDocument[]>;
    getDiagram(id: string): Promise<DiagramDocument | null>;
    saveDiagram(doc: DiagramDocument): Promise<void>;
    deleteDiagram(id: string): Promise<boolean>;

    // Folders
    getFolders(): Promise<Folder[]>;
    getFolder(id: string): Promise<Folder | null>;
    saveFolder(folder: Folder): Promise<void>;
    deleteFolderCascade(id: string): Promise<boolean>;
}
