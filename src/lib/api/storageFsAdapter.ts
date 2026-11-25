// File-system storage backend.
//
// Implements `StorageAdapter` against the local file system: each diagram is a JSON file under
// `data/<id>.json` and each folder under `data/folders/<id>.json` (a subdirectory so the flat
// `*.json` diagram scan never mistakes a folder record for a diagram). In demo mode it reads from
// `demo/` and all writes are no-ops. This is the only module that touches `fs`; swapping to another
// backend (e.g. MongoDB) means writing a sibling adapter and changing one line in `storage.ts`.

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  DiagramDocument,
  Folder,
  StorageAdapter,
  IS_DEMO_MODE,
  normalizeDiagramDocument,
  normalizeFolder,
} from "./storageTypes";

export function createFileSystemStorageAdapter(): StorageAdapter {
  const DATA_DIR = IS_DEMO_MODE
    ? path.join(process.cwd(), "demo")
    : path.join(process.cwd(), "data");
  const FOLDERS_DIR = path.join(DATA_DIR, "folders");

  async function ensureDataDir() {
    try {
      await fs.access(DATA_DIR);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
  }

  async function ensureFoldersDir() {
    try {
      await fs.access(FOLDERS_DIR);
    } catch {
      await fs.mkdir(FOLDERS_DIR, { recursive: true });
    }
  }

  // Both list endpoints read every record file, which is the hot path once an install has a few
  // thousand diagrams. `fs.promises` hands each read to libuv's 4-thread pool and measured ~30x
  // slower than a synchronous read here, so read synchronously and yield to the event loop
  // periodically to keep concurrent requests responsive.
  const YIELD_EVERY = 200;

  async function readRecords<T>(dir: string, parse: (raw: unknown) => T | null): Promise<T[]> {
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".json"));
    const records: T[] = [];

    for (const [index, file] of files.entries()) {
      if (index > 0 && index % YIELD_EVERY === 0) await new Promise(setImmediate);
      try {
        const record = parse(JSON.parse(fsSync.readFileSync(path.join(dir, file), "utf-8")));
        if (record) records.push(record);
      } catch (e) {
        console.error(`Failed to read record file: ${file}`, e);
      }
    }

    return records;
  }

  async function getDiagrams(): Promise<DiagramDocument[]> {
    await ensureDataDir();
    const diagrams = await readRecords(DATA_DIR, (raw) => {
      const doc = raw as Partial<DiagramDocument>;
      // Skip normalization for soft-deleted records: it scans the whole code body, and most files
      // in a long-lived install are deleted.
      if (typeof doc.deletedAt === "string" && doc.deletedAt) return null;
      return normalizeDiagramDocument(doc);
    });

    return diagrams.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  function validateId(id: string): string {
    if (!id || /[^a-zA-Z0-9_-]/.test(id)) throw new Error("Invalid ID");
    return id;
  }

  function safeFilePath(dir: string, id: string): string {
    const safeName = validateId(id);
    const safe = path.basename(safeName) + ".json";
    if (safe !== safeName + ".json") throw new Error("Invalid ID");
    return path.join(dir, safe);
  }

  async function getDiagram(id: string): Promise<DiagramDocument | null> {
    await ensureDataDir();
    try {
      const safeId = validateId(id);
      const filePath = path.join(DATA_DIR, `${safeId}.json`);
      const content = await fs.readFile(filePath, "utf-8");
      const doc = normalizeDiagramDocument(JSON.parse(content) as DiagramDocument);
      if (doc.deletedAt) {
        return null; // Don't return soft-deleted files
      }
      return doc;
    } catch {
      return null;
    }
  }

  async function saveDiagram(doc: DiagramDocument): Promise<void> {
    if (IS_DEMO_MODE) return;
    await ensureDataDir();
    const safeId = validateId(doc.id);
    const filePath = path.join(DATA_DIR, `${safeId}.json`);
    await fs.writeFile(filePath, JSON.stringify(normalizeDiagramDocument(doc), null, 2), "utf-8");
  }

  async function deleteDiagram(id: string): Promise<boolean> {
    if (IS_DEMO_MODE) return false;
    const doc = await getDiagram(id);
    if (!doc) return false;

    doc.deletedAt = new Date().toISOString();
    await saveDiagram(doc);
    return true;
  }

  async function getFolders(): Promise<Folder[]> {
    await ensureFoldersDir();
    const folders = await readRecords(FOLDERS_DIR, (raw) => {
      const folder = normalizeFolder(raw as Folder);
      return folder.deletedAt ? null : folder;
    });

    return folders.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getFolder(id: string): Promise<Folder | null> {
    await ensureFoldersDir();
    try {
      const filePath = safeFilePath(FOLDERS_DIR, id);
      const content = await fs.readFile(filePath, "utf-8");
      const folder = normalizeFolder(JSON.parse(content) as Folder);
      if (folder.deletedAt) return null;
      return folder;
    } catch {
      return null;
    }
  }

  async function saveFolder(folder: Folder): Promise<void> {
    if (IS_DEMO_MODE) return;
    await ensureFoldersDir();
    await fs.writeFile(
      safeFilePath(FOLDERS_DIR, folder.id),
      JSON.stringify(normalizeFolder(folder), null, 2),
      "utf-8",
    );
  }

  // Soft-delete a folder and REPARENT its contents to the folder's own parent so nothing is
  // orphaned: child folders inherit `deleted.parentId`, and diagrams inside the folder move to
  // `deleted.parentId` (null === workspace root).
  async function deleteFolderCascade(id: string): Promise<boolean> {
    if (IS_DEMO_MODE) return false;
    const folder = await getFolder(id);
    if (!folder) return false;

    const targetParent = folder.parentId;
    const now = new Date().toISOString();

    // Reparent direct child folders.
    const childFolders = (await getFolders()).filter((f) => f.parentId === id);
    for (const child of childFolders) {
      await saveFolder({ ...child, parentId: targetParent, updatedAt: now });
    }

    // Move diagrams that live in this folder up to the parent.
    const diagrams = await getDiagrams();
    for (const d of diagrams) {
      if (d.folderId === id) {
        await saveDiagram({ ...d, folderId: targetParent, updatedAt: now });
      }
    }

    await saveFolder({ ...folder, deletedAt: now, updatedAt: now });
    return true;
  }

  return {
    getDiagrams,
    getDiagram,
    saveDiagram,
    deleteDiagram,
    getFolders,
    getFolder,
    saveFolder,
    deleteFolderCascade,
  };
}
