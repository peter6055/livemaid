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
      if (Array.isArray(value) && key === "$in") {
        // Not used in these tests.
        return value.includes(itemValue);
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
        const results = items.filter((item) => matches(item, filter));
        return {
          toArray: () => Promise.resolve(results),
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
      async deleteOne(filter: Record<string, unknown>) {
        const index = items.findIndex((item) => matches(item, filter));
        if (index >= 0) {
          items.splice(index, 1);
          return { acknowledged: true, deletedCount: 1 };
        }
        return { acknowledged: true, deletedCount: 0 };
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

import {
  getMembership,
  isAdmin,
  isMember,
  requireAdmin,
  requireMember,
  AuthorizationError,
} from "@/lib/auth/permissions";
import { getMembershipsCollection } from "@/lib/db/collections";

async function seedMembership(role: "admin" | "member", status: "active" | "pending") {
  const memberships = await getMembershipsCollection();
  const userId = new ObjectId();
  const workspaceId = new ObjectId();
  const membership: DbMembership = {
    _id: new ObjectId(),
    userId,
    workspaceId,
    role,
    invitedEmail: null,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await memberships.insertOne(membership);
  return { userId: userId.toString(), workspaceId: workspaceId.toString(), membership };
}

describe("permissions", () => {
  it("returns the active membership for a workspace member", async () => {
    const { userId, workspaceId, membership } = await seedMembership("member", "active");
    const result = await getMembership(userId, workspaceId);
    expect(result).not.toBeNull();
    expect(result!._id.toString()).toBe(membership._id.toString());
  });

  it("returns null when no active membership exists", async () => {
    const userId = new ObjectId().toString();
    const workspaceId = new ObjectId().toString();
    const result = await getMembership(userId, workspaceId);
    expect(result).toBeNull();
  });

  it("isAdmin returns true for admins and false for members", async () => {
    const admin = await seedMembership("admin", "active");
    const member = await seedMembership("member", "active");

    expect(await isAdmin(admin.userId, admin.workspaceId)).toBe(true);
    expect(await isAdmin(member.userId, member.workspaceId)).toBe(false);
  });

  it("isMember returns true for both admins and members", async () => {
    const admin = await seedMembership("admin", "active");
    const member = await seedMembership("member", "active");

    expect(await isMember(admin.userId, admin.workspaceId)).toBe(true);
    expect(await isMember(member.userId, member.workspaceId)).toBe(true);
  });

  it("isMember returns false for pending memberships", async () => {
    const { userId, workspaceId } = await seedMembership("member", "pending");
    expect(await isMember(userId, workspaceId)).toBe(false);
  });

  it("requireAdmin throws AuthorizationError for non-admins", async () => {
    const { userId, workspaceId } = await seedMembership("member", "active");
    await expect(requireAdmin(userId, workspaceId)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireAdmin(userId, workspaceId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requireAdmin resolves for admins", async () => {
    const { userId, workspaceId } = await seedMembership("admin", "active");
    await expect(requireAdmin(userId, workspaceId)).resolves.toBeUndefined();
  });

  it("requireMember throws AuthorizationError for non-members", async () => {
    const userId = new ObjectId().toString();
    const workspaceId = new ObjectId().toString();
    await expect(requireMember(userId, workspaceId)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("requireMember resolves for members", async () => {
    const { userId, workspaceId } = await seedMembership("member", "active");
    await expect(requireMember(userId, workspaceId)).resolves.toBeUndefined();
  });
});
