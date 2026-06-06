// File-system storage backend.
//
// Implements `StorageAdapter` against the local file system: each diagram is a JSON file under
// `data/<id>.json` and each folder under `data/folders/<id>.json` (a subdirectory so the flat
// `*.json` diagram scan never mistakes a folder record for a diagram). In demo mode it reads from
// `demo/` and all writes are no-ops. This is the only module that touches `fs`; swapping to another
// backend (e.g. MongoDB) means writing a sibling adapter and changing one line in `storage.ts`.

import fs from "fs/promises";
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
  const DATA_DIR = path.join(process.cwd(), IS_DEMO_MODE ? "demo" : "data");
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

  async function getDiagrams(): Promise<DiagramDocument[]> {
    await ensureDataDir();
    const files = await fs.readdir(DATA_DIR);
    const diagrams: DiagramDocument[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(DATA_DIR, file);
        const content = await fs.readFile(filePath, "utf-8");
        try {
          const doc = normalizeDiagramDocument(JSON.parse(content) as DiagramDocument);
          if (!doc.deletedAt) {
            diagrams.push(doc);
          }
        } catch (e) {
          console.error(`Failed to parse diagram file: ${file}`, e);
        }
      }
    }

    // Sort by updatedAt descending
    return diagrams.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async function getDiagram(id: string): Promise<DiagramDocument | null> {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, `${id}.json`);

    try {
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
    const filePath = path.join(DATA_DIR, `${doc.id}.json`);
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
    const files = await fs.readdir(FOLDERS_DIR);
    const folders: Folder[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = await fs.readFile(path.join(FOLDERS_DIR, file), "utf-8");
          const folder = normalizeFolder(JSON.parse(content) as Folder);
          if (!folder.deletedAt) folders.push(folder);
        } catch (e) {
          console.error(`Failed to parse folder file: ${file}`, e);
        }
      }
    }

    return folders.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getFolder(id: string): Promise<Folder | null> {
    await ensureFoldersDir();
    try {
      const content = await fs.readFile(path.join(FOLDERS_DIR, `${id}.json`), "utf-8");
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
      path.join(FOLDERS_DIR, `${folder.id}.json`),
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
