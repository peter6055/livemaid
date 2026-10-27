import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DbUser, DbWorkspace, DbMembership, DbMigrationMarker } from "@/lib/db/collections";
import type { DiagramDocument, Folder } from "@/lib/api/storageTypes";
import { ObjectId } from "mongodb";

vi.mock("@/lib/db/collections", async () => {
  const { ObjectId } = await vi.importActual<typeof import("mongodb")>("mongodb");

  const users: DbUser[] = [];
  const workspaces: DbWorkspace[] = [];
  const memberships: DbMembership[] = [];
  const migrationMarkers: DbMigrationMarker[] = [];

  function matches<T extends { _id: ObjectId }>(item: T, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      const itemValue = (item as Record<string, unknown>)[key];
      if (value instanceof ObjectId && itemValue instanceof ObjectId) {
        return value.equals(itemValue);
      }
      return itemValue === value;
    });
  }

  function createCollection<T extends { _id: ObjectId }>(items: T[]) {
    return {
      async findOne(filter: Record<string, unknown>) {
        return items.find((item) => matches(item, filter)) ?? null;
      },
      async insertOne(doc: T) {
        items.push(doc);
        return { acknowledged: true, insertedId: doc._id };
      },
      async updateOne(filter: Record<string, unknown>, update: { $set: Partial<T> }) {
        const index = items.findIndex((item) => matches(item, filter));
        if (index >= 0) {
          items[index] = { ...items[index], ...update.$set } as T;
          return { acknowledged: true, modifiedCount: 1 };
        }
        return { acknowledged: true, modifiedCount: 0 };
      },
    };
  }

  return {
    getUsersCollection: () =>
      Promise.resolve(createCollection(users) as unknown as import("mongodb").Collection<DbUser>),
    getWorkspacesCollection: () =>
      Promise.resolve(
        createCollection(workspaces) as unknown as import("mongodb").Collection<DbWorkspace>,
      ),
    getMembershipsCollection: () =>
      Promise.resolve(
        createCollection(memberships) as unknown as import("mongodb").Collection<DbMembership>,
      ),
    getMigrationMarkersCollection: () =>
      Promise.resolve(
        createCollection(
          migrationMarkers,
        ) as unknown as import("mongodb").Collection<DbMigrationMarker>,
      ),
  };
});

vi.mock("@/lib/api/storage", () => {
  const diagrams: DiagramDocument[] = [];
  const folders: Folder[] = [];

  function resetStorage() {
    diagrams.length = 0;
    folders.length = 0;
  }

  return {
    getDiagrams: () => Promise.resolve([...diagrams]),
    getFolders: () => Promise.resolve([...folders]),
    saveDiagram: (doc: DiagramDocument) => {
      const index = diagrams.findIndex((d) => d.id === doc.id);
      if (index >= 0) {
        diagrams[index] = doc;
      } else {
        diagrams.push(doc);
      }
      return Promise.resolve();
    },
    saveFolder: (folder: Folder) => {
      const index = folders.findIndex((f) => f.id === folder.id);
      if (index >= 0) {
        folders[index] = folder;
      } else {
        folders.push(folder);
      }
      return Promise.resolve();
    },
    resetStorage,
  };
});

import {
  adoptLegacyDiagrams,
  isLegacyAdoptionComplete,
  runLegacyAdoptionIfNeeded,
} from "@/lib/auth/migration";
import * as storage from "@/lib/api/storage";

const { resetStorage } = storage as unknown as { resetStorage: () => void };

function makeDiagram(id: string, workspaceId?: string): DiagramDocument {
  return {
    id,
    name: "Test Diagram",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    code: "flowchart TD\nA",
    type: "flowchart",
    folderId: null,
    workspaceId,
    subPages: [],
    comments: [],
    versionHistory: [],
  };
}

function makeFolder(id: string, workspaceId?: string): Folder {
  return {
    id,
    name: "Test Folder",
    parentId: null,
    workspaceId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

describe("legacy migration", () => {
  beforeEach(() => {
    resetStorage();
  });

  it("adopts diagrams and folders that do not have a workspaceId", async () => {
    await storage.saveDiagram(makeDiagram("migration-d1"));
    await storage.saveDiagram(makeDiagram("migration-d2"));
    await storage.saveFolder(makeFolder("migration-f1"));

    const workspaceId = new ObjectId().toString();
    const result = await adoptLegacyDiagrams(workspaceId);

    expect(result.adoptedDiagrams).toBe(2);
    expect(result.adoptedFolders).toBe(1);

    const diagrams = await storage.getDiagrams();
    const folders = await storage.getFolders();
    expect(diagrams.every((d) => d.workspaceId === workspaceId)).toBe(true);
    expect(folders.every((f) => f.workspaceId === workspaceId)).toBe(true);
  });

  it("skips records that already have a workspaceId", async () => {
    await storage.saveDiagram(makeDiagram("migration-d3", "existing-workspace"));
    await storage.saveDiagram(makeDiagram("migration-d4"));
    await storage.saveFolder(makeFolder("migration-f2", "existing-workspace"));
    await storage.saveFolder(makeFolder("migration-f3"));

    const workspaceId = new ObjectId().toString();
    const result = await adoptLegacyDiagrams(workspaceId);

    expect(result.adoptedDiagrams).toBe(1);
    expect(result.adoptedFolders).toBe(1);

    const diagrams = await storage.getDiagrams();
    const folders = await storage.getFolders();
    expect(diagrams.find((d) => d.id === "migration-d3")?.workspaceId).toBe("existing-workspace");
    expect(diagrams.find((d) => d.id === "migration-d4")?.workspaceId).toBe(workspaceId);
    expect(folders.find((f) => f.id === "migration-f2")?.workspaceId).toBe("existing-workspace");
    expect(folders.find((f) => f.id === "migration-f3")?.workspaceId).toBe(workspaceId);
  });

  it("marks adoption complete and only runs once per workspace", async () => {
    const workspaceId = new ObjectId().toString();
    await storage.saveDiagram(makeDiagram("migration-d5"));

    expect(await isLegacyAdoptionComplete(workspaceId)).toBe(false);

    const first = await runLegacyAdoptionIfNeeded(workspaceId);
    expect(first).toBeUndefined();
    expect(await isLegacyAdoptionComplete(workspaceId)).toBe(true);

    const diagramsAfterFirst = await storage.getDiagrams();
    expect(diagramsAfterFirst.find((d) => d.id === "migration-d5")?.workspaceId).toBe(workspaceId);

    const second = await adoptLegacyDiagrams(workspaceId);
    expect(second.adoptedDiagrams).toBe(0);
    expect(second.adoptedFolders).toBe(0);
  });
});
