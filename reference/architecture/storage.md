# Storage Architecture

## 1. Storage Principle: Local-First Today, Document-DB Ready

LiveMaid currently runs entirely locally with **no external database**, but the persistence layer is deliberately structured as a **document store** so it can migrate to MongoDB (or any document DB) without touching API routes or the frontend.

- **Storage Medium (current)**: Each diagram is a `.json` document under `data/<id>.json`; each folder under `data/folders/<id>.json`. One file == one document, keyed by a `nanoid` id.
- **Why local-first first?**: To eliminate backend infrastructure, authentication, and external dependencies for the initial product — trivial to run via Docker or `npm run dev`.
- **Document-oriented model (migration-ready)**: The data shapes (`DiagramDocument`, `Folder`) are already document-shaped — top-level records with **embedded sub-documents** (`subPages`, `comments`, `versionHistory`) and nullable reference ids (`folderId`, `parentId` as an adjacency-list tree). This maps 1:1 onto MongoDB collections, so moving to a document DB is a backend swap, not a redesign.
- **Soft Deletion**: Soft deletion (`deletedAt` timestamp) instead of hard deletion to prevent accidental data loss. In Mongo this becomes a `deletedAt: null` filter / partial index.
- **Version History**: Saved diagrams retain an append-only `versionHistory` array (capped at 100) for rollback. (Migration note: for a document-DB backend at scale this array should be promoted to its own `versions` collection to avoid unbounded document growth — see §1a.)
- **Version Metadata**: Version history entries carry lightweight UI metadata (user label, starred) without changing the storage model.

### 1a. Storage Adapter Architecture (the migration seam)

All persistence goes through a single **`StorageAdapter` interface**, never the file system directly:

- **`src/lib/api/storageTypes.ts`** — domain types (`DiagramDocument`, `Folder`, `VersionHistoryEntry`), `normalize*` hydration helpers, the `IS_DEMO_MODE` flag, and the `StorageAdapter` interface (the full persistence contract: `getDiagrams`/`getDiagram`/`saveDiagram`/`deleteDiagram` + the `Folder` equivalents + `deleteFolderCascade`).
- **`src/lib/api/storageFsAdapter.ts`** — `createFileSystemStorageAdapter()`, the only module that imports `fs`. Owns `data/` vs `demo/` selection and the demo-mode write no-ops.
- **`src/lib/api/storage.ts`** — the public façade everything imports (`@/lib/api/storage`). Re-exports the types and delegates each function to the active adapter. **Swapping backends is a one-line change here** (`createFileSystemStorageAdapter()` → `createMongoStorageAdapter()`); API routes and the frontend keep their identical imports.

**To migrate to MongoDB**: implement `createMongoStorageAdapter()` against the same interface (`replaceOne`/`findOne`/`find({deletedAt:null})`, indexes on `folderId`/`parentId`/`deletedAt`/`updatedAt`, atomic `findOneAndUpdate`, `deleteFolderCascade` as two `updateMany` in a transaction), promote `versionHistory` to a `versions` collection, and flip the one line in `storage.ts`.

> **Migration is DEFERRED** — we stay on the file-system backend for now. The full findings, the
> current-model → MongoDB mapping, the step-by-step migration, and the one real design change
> (splitting `versionHistory` into its own `versions` collection) are documented in
> [`reference/architecture/mongodb-migration.md`](./mongodb-migration.md). Execute that when we decide
> to move to MongoDB.

