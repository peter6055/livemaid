# MongoDB Migration Plan (Deferred)

> **Status: DEFERRED.** The app runs on the local file-system backend today. This document captures
> the migratability findings and the concrete plan so the move to MongoDB (or any document DB) can
> be executed later without re-discovery. Nothing here is implemented yet except the **storage
> adapter seam** (already in place — see "What's already done").

## TL;DR

- The current persistence model is already **document-shaped** and migrates to MongoDB at low risk.
- Persistence is fully abstracted behind a **`StorageAdapter` interface**, so switching backends is a
  one-line change in `src/lib/api/storage.ts` — **no API route or frontend change**.
- The **one** part that does not map cleanly is the embedded, unbounded `versionHistory` array. The
  recommended fix (promote it to its own `versions` collection) is detailed in §4 and should be done
  **as part of / before** the Mongo migration.

## 1. What's already done (the migration seam)

Refactored so persistence is backend-agnostic:

- `src/lib/api/storageTypes.ts` — domain types (`DiagramDocument`, `Folder`, `VersionHistoryEntry`),
  `normalize*` hydration helpers, `IS_DEMO_MODE`, and the **`StorageAdapter` interface** (the whole
  persistence contract).
- `src/lib/api/storageFsAdapter.ts` — `createFileSystemStorageAdapter()`, the only module importing
  `fs`. Owns `data/` vs `demo/` selection + demo write no-ops.
- `src/lib/api/storage.ts` — public façade (`@/lib/api/storage`) that delegates to the active
  adapter. **The single swap point.**

Consumers (unchanged by a backend swap): `src/app/api/diagrams/route.ts`,
`src/app/api/diagrams/[id]/route.ts`, `src/app/api/folders/route.ts`,
`src/app/api/folders/[id]/route.ts`, and the `DiagramDocument` type import in
`src/hooks/useEditorState.ts`.

## 2. Current model → MongoDB mapping (clean, no model change)

| Current (file system) | MongoDB equivalent |
| --- | --- |
| `data/<id>.json` (1 file = 1 doc) | `diagrams` collection, one document per diagram |
| `data/folders/<id>.json` | `folders` collection |
| `getDiagram(id)` | `findOne({ _id: id })` |
| `saveDiagram(doc)` | `replaceOne({ _id }, doc, { upsert: true })` |
| `getDiagrams()` (scan + filter `!deletedAt`, sort `updatedAt` desc) | `find({ deletedAt: null }).sort({ updatedAt: -1 })` |
| `deleteDiagram` (set `deletedAt`) | `updateOne({ _id }, { $set: { deletedAt } })` |
| `subPages`, `comments` arrays | embedded sub-documents (canonical Mongo pattern) |
| `folderId` / `parentId` nullable refs | adjacency-list tree (standard pattern) |
| soft delete `deletedAt` | filter + partial index |
| `nanoid` `id` field | use as string `_id` (or map `id ↔ _id` in a thin serializer) |
| ISO-string timestamps | BSON `Date` (convert in the `normalize*` helpers — the single conversion point) |
| `DEMO_MODE` separate `demo/` dir | read-only connection / `demo` DB + the existing write no-op guards |

## 3. Concrete migration steps (when we move)

1. **Implement `createMongoStorageAdapter()`** in a new `src/lib/api/storageMongoAdapter.ts` against
   the existing `StorageAdapter` interface. Use the official `mongodb` driver with a cached client
   (Next.js: store the client promise on `globalThis` to survive HMR/serverless reuse).
2. **Indexes**: `diagrams`: `{ deletedAt: 1, updatedAt: -1 }`, `{ folderId: 1 }`. `folders`:
   `{ deletedAt: 1 }`, `{ parentId: 1 }`.
3. **Atomicity**: replace the read-modify-write merge in `PUT /api/diagrams/[id]` semantics with
   `findOneAndUpdate(..., { $set }, { returnDocument: 'after' })`. Implement `deleteFolderCascade`
   as **two `updateMany`** (reparent child folders + reparent contained diagrams) inside a
   transaction, instead of the current N+1 file rewrites.
4. **Connection/config**: `MONGODB_URI` env var; fail fast if missing when the Mongo adapter is
   selected.
5. **Swap the one line** in `storage.ts`: `createFileSystemStorageAdapter()` →
   `createMongoStorageAdapter()` (or select by env, e.g. `STORAGE_BACKEND=mongo`).
6. **Backfill** existing `data/*.json` (and `demo/`) into the collections (one-off script — read each
   file, `insertOne`/`replaceOne`). Run §4's version split in the same pass.
7. **Docker / deploy**: add a Mongo service (compose) or point `MONGODB_URI` at Atlas; keep `data/`
   volume only for the FS fallback.

## 4. The one real design change: split `versionHistory` into a `versions` collection

### Why
`versionHistory` is an embedded, append-only array of **full code snapshots** (capped at 100). The
demo diagram is already ~100 KB; 100 snapshots of a large diagram can approach Mongo's **16 MB
document limit**, and every diagram read drags the whole history along even though the editor only
needs it when the history panel is opened.

### Target shape
```ts
interface VersionRecord {
  id: string;          // existing entry id (nanoid)
  diagramId: string;   // FK → DiagramDocument.id (the new index key)
  code: string;        // the snapshot
  timestamp: string;
  label?: string;
  starred?: boolean;
}
```
- **FS backend** (if kept in parallel): `data/versions/<diagramId>.json` (one array file per diagram,
  atomic rewrite; mirrors the `folders/` subdir pattern).
- **Mongo backend**: `versions` collection, compound index `{ diagramId: 1, timestamp: -1 }`, optional
  partial index on `{ starred: 1 }`.
- `DiagramDocument.versionHistory` is **removed** from the stored doc.

### StorageAdapter additions
```ts
getVersions(diagramId: string): Promise<VersionRecord[]>;   // starred first, then timestamp desc
appendVersion(v: VersionRecord): Promise<void>;             // prepend + cap at 100, never prune a starred entry
updateVersion(id: string, patch: { label?: string; starred?: boolean }): Promise<VersionRecord | null>;
deleteVersions(diagramId: string): Promise<void>;
```

### API surface
- **New** `GET /api/diagrams/[id]/versions` → version list (replaces reading `doc.versionHistory`).
- **New** `PATCH /api/diagrams/[id]/versions/[versionId]` → label/star toggle (currently done by
  PUTing the whole diagram with a mutated array).
- **Change** `PUT /api/diagrams/[id]`: the snapshot-on-code-change logic (currently builds
  `nextVersionHistory` inline) calls `appendVersion()` instead; the saved diagram doc no longer
  contains `versionHistory`. Rollback stays a normal `PUT` with the chosen `code`.

### Frontend touch points (small, isolated)
- `LiveMaidEditor.tsx` history panel: fetch `GET …/versions` when the panel opens; `PATCH …` for
  star/label (instead of reading `doc.versionHistory` / PUTing the diagram). History preview render
  is unchanged.
- `useEditorState.ts` / `DiagramDocument` type: drop `versionHistory` (or keep optional during the
  transition).
- Dashboard/cards: **no change** (never used `versionHistory`).

### Invariants to preserve
- Ordering is "**starred first, then newest**" — centralize that sort in the adapter so FS and Mongo
  agree.
- The 100-cap prune must **never** delete a `starred` entry.
- Keep `normalizeDiagramDocument` tolerant of a legacy embedded `versionHistory` during rollout
  (read legacy, write new) so a half-migrated `data/` still works.

### Sequencing (incremental, reversible)
1. Add adapter methods + backfill with **dual-read** (prefer versions store, fall back to embedded
   array).
2. Flip writes to the versions store.
3. Remove the embedded field last.

## 5. Effort estimate (the version split, when undertaken)

- `storageTypes.ts` + both adapters: ~1–2 hrs
- 2 new API routes + PUT change: ~1 hr
- Frontend history-panel rewire: ~1–2 hrs
- Backfill script + demo fixtures + tests: ~1 hr

≈ half a day, fully incremental.

## 6. Reconciliation note

`reference/ARCHITECTURE.md` §1 previously stated the app runs "without a traditional database … e.g.
MongoDB". That has been updated to "Local-First Today, Document-DB Ready" with the adapter seam
described in §1a. This file is the detailed companion for the eventual migration.
