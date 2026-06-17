// Public storage façade.
//
// This is the ONLY storage module the rest of the app imports (`@/lib/api/storage`). It re-exports
// the domain types and exposes the persistence functions, delegating each to the currently-active
// `StorageAdapter`. Swapping backends (file system → MongoDB) is a ONE-LINE change here: replace
// `createFileSystemStorageAdapter()` with the new adapter factory. Every API route and the frontend
// keep their identical imports — they never reference a concrete backend.

import { createFileSystemStorageAdapter } from "./storageFsAdapter";
import type {
  DiagramDocument,
  DiagramComment,
  DiagramCommentAnchor,
  Folder,
  StorageAdapter,
} from "./storageTypes";

export type {
  DiagramDocument,
  DiagramComment,
  DiagramCommentAnchor,
  Folder,
  VersionHistoryEntry,
} from "./storageTypes";
export { IS_DEMO_MODE } from "./storageTypes";

// ── Active backend ────────────────────────────────────────────────────────────
// To migrate to MongoDB: implement `createMongoStorageAdapter()` (same StorageAdapter interface)
// and swap the line below. Nothing else in the codebase changes.
const adapter: StorageAdapter = createFileSystemStorageAdapter();

// ── Diagrams ────────────────────────────────────────────────────────────────────
export function getDiagrams(): Promise<DiagramDocument[]> {
  return adapter.getDiagrams();
}
export function getDiagram(id: string): Promise<DiagramDocument | null> {
  return adapter.getDiagram(id);
}
export function saveDiagram(doc: DiagramDocument): Promise<void> {
  return adapter.saveDiagram(doc);
}
export function deleteDiagram(id: string): Promise<boolean> {
  return adapter.deleteDiagram(id);
}

// ── Folders ─────────────────────────────────────────────────────────────────────
export function getFolders(): Promise<Folder[]> {
  return adapter.getFolders();
}
export function getFolder(id: string): Promise<Folder | null> {
  return adapter.getFolder(id);
}
export function saveFolder(folder: Folder): Promise<void> {
  return adapter.saveFolder(folder);
}
export function deleteFolderCascade(id: string): Promise<boolean> {
  return adapter.deleteFolderCascade(id);
}
