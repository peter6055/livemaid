import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DbUser, DbWorkspace, DbMembership } from "@/lib/db/collections";
import { ObjectId } from "mongodb";

vi.mock("@/lib/db/collections", async () => {
  const { ObjectId } = await vi.importActual<typeof import("mongodb")>("mongodb");

  const users: DbUser[] = [];
  const workspaces: DbWorkspace[] = [];
  const memberships: DbMembership[] = [];

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
      find(filter: Record<string, unknown>) {
        return {
          toArray: async () => items.filter((item) => matches(item, filter)),
        };
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
      async deleteMany() {
        const deletedCount = items.length;
        items.length = 0;
        return { acknowledged: true, deletedCount };
      },
      // Minimal in-memory $match / $lookup / $limit for getActiveWorkspace.
      aggregate(pipeline: Record<string, unknown>[]) {
        let rows = items.map((item) => ({ ...(item as object) })) as Record<string, unknown>[];
        for (const stage of pipeline) {
          if ("$match" in stage) {
            rows = rows.filter((row) => matches(row as T, stage.$match as Record<string, unknown>));
          } else if ("$limit" in stage) {
            rows = rows.slice(0, stage.$limit as number);
          } else if ("$lookup" in stage) {
            const lookup = stage.$lookup as {
              from: string;
              localField: string;
              foreignField: string;
              as: string;
            };
            const source =
              lookup.from === "workspaces"
                ? (workspaces as unknown as Record<string, unknown>[])
                : lookup.from === "users"
                  ? (users as unknown as Record<string, unknown>[])
                  : [];
            rows = rows.map((row) => ({
              ...row,
              [lookup.as]: source.filter((doc) =>
                matches(doc as T, { [lookup.foreignField]: row[lookup.localField] }),
              ),
            }));
          }
        }
        return { toArray: async () => rows };
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
  };
});

import {
  normalizeEmail,
  findOrCreateUser,
  ensureDefaultWorkspace,
  getActiveWorkspace,
  createAdminMembership,
  createDefaultWorkspace,
} from "@/lib/auth/workspace";
import {
  getUsersCollection,
  getWorkspacesCollection,
  getMembershipsCollection,
} from "@/lib/db/collections";

describe("workspace", () => {
  beforeEach(async () => {
    await (await getUsersCollection()).deleteMany({});
    await (await getWorkspacesCollection()).deleteMany({});
    await (await getMembershipsCollection()).deleteMany({});
  });

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
    const user = await findOrCreateUser({
      sub: "auth-workspace-2",
      email: "workspace-default@example.com",
      name: "Default User",
    });

    const { user: ensured, workspace, membership } = await ensureDefaultWorkspace(user);

    expect(ensured._id.toString()).toBe(user._id.toString());
    expect(workspace.name).toBe("My Workspace");
    expect(workspace.createdBy.toString()).toBe(user._id.toString());
    expect(membership.userId?.toString()).toBe(user._id.toString());
    expect(membership.workspaceId.toString()).toBe(workspace._id.toString());
    expect(membership.role).toBe("admin");
    expect(membership.status).toBe("active");
  });

  it("is idempotent: second call returns the existing records", async () => {
    const user = await findOrCreateUser({
      sub: "auth-workspace-3",
      email: "workspace-idempotent@example.com",
    });

    const first = await ensureDefaultWorkspace(user);
    const second = await ensureDefaultWorkspace(user);

    expect(second.user._id.toString()).toBe(first.user._id.toString());
    expect(second.workspace._id.toString()).toBe(first.workspace._id.toString());
    expect(second.membership._id.toString()).toBe(first.membership._id.toString());
  });

  it("getActiveWorkspace returns the active membership and its workspace", async () => {
    const user = await findOrCreateUser({
      sub: "auth-workspace-4",
      email: "workspace-active@example.com",
    });
    const workspace = await createDefaultWorkspace(user._id, "Active Workspace");
    await createAdminMembership(user._id, workspace._id);

    const active = await getActiveWorkspace(user._id.toString());

    expect(active).not.toBeNull();
    expect(active!.workspace._id.toString()).toBe(workspace._id.toString());
    expect(active!.membership.userId?.toString()).toBe(user._id.toString());
    expect(active!.membership.status).toBe("active");
  });

  it("getActiveWorkspace returns null when there is no active membership", async () => {
    const user = await findOrCreateUser({
      sub: "auth-workspace-5",
      email: "workspace-none@example.com",
    });

    expect(await getActiveWorkspace(user._id.toString())).toBeNull();
    expect(await getActiveWorkspace(new ObjectId().toString())).toBeNull();
  });

  it("refuses to provision a workspace for an uninvited user once one exists", async () => {
    const owner = await findOrCreateUser({
      sub: "auth-workspace-owner",
      email: "owner@example.com",
    });
    await ensureDefaultWorkspace(owner);

    const stranger = await findOrCreateUser({
      sub: "auth-workspace-stranger",
      email: "stranger@example.com",
    });

    await expect(ensureDefaultWorkspace(stranger)).rejects.toThrow("invite is required");

    const workspaces = await getWorkspacesCollection();
    expect(await workspaces.find({}).toArray()).toHaveLength(1);
    expect(await getActiveWorkspace(stranger._id.toString())).toBeNull();
  });
});
