import { describe, it, expect, vi } from "vitest";
import type { DbUser, DbWorkspace, DbMembership, DbMigrationMarker } from "@/lib/db/collections";
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

import { normalizeEmail, findOrCreateUser, ensureDefaultWorkspace } from "@/lib/auth/workspace";

describe("workspace", () => {
  it("normalizes email to lowercase and trimmed", () => {
    expect(normalizeEmail("  Test.User@EXAMPLE.COM  ")).toBe("test.user@example.com");
  });

  it("creates a user on first call and updates the same user on second call", async () => {
    const profile = {
      sub: "auth-workspace-1",
      email: "workspace-new@example.com",
      name: "New User",
    };

    const first = await findOrCreateUser(profile);
    expect(first.email).toBe("workspace-new@example.com");
    expect(first.name).toBe("New User");
    expect(first._id).toBeDefined();

    const second = await findOrCreateUser({ ...profile, name: "Updated Name" });
    expect(second._id.toString()).toBe(first._id.toString());
    expect(second.email).toBe("workspace-new@example.com");
    expect(second.name).toBe("Updated Name");
  });

  it("creates a default workspace and admin membership on first call", async () => {
    const profile = {
      sub: "auth-workspace-2",
      email: "workspace-default@example.com",
      name: "Default User",
    };

    const { user, workspace, membership } = await ensureDefaultWorkspace(profile);

    expect(user.email).toBe("workspace-default@example.com");
    expect(workspace.name).toBe("My Workspace");
    expect(workspace.createdBy.toString()).toBe(user._id.toString());
    expect(membership.userId?.toString()).toBe(user._id.toString());
    expect(membership.workspaceId.toString()).toBe(workspace._id.toString());
    expect(membership.role).toBe("admin");
    expect(membership.status).toBe("active");
  });

  it("is idempotent: second call returns the existing records", async () => {
    const profile = {
      sub: "auth-workspace-3",
      email: "workspace-idempotent@example.com",
    };

    const first = await ensureDefaultWorkspace(profile);
    const second = await ensureDefaultWorkspace(profile);

    expect(second.user._id.toString()).toBe(first.user._id.toString());
    expect(second.workspace._id.toString()).toBe(first.workspace._id.toString());
    expect(second.membership._id.toString()).toBe(first.membership._id.toString());
  });
});
