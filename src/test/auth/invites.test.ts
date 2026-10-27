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
  inviteMember,
  acceptInviteByEmail,
  removeMember,
  updateMemberRole,
  getWorkspaceMembers,
} from "@/lib/auth/invites";
import { getMembershipsCollection, getUsersCollection } from "@/lib/db/collections";

async function seedWorkspace(): Promise<DbWorkspace> {
  const workspaceId = new ObjectId();
  const workspace: DbWorkspace = {
    _id: workspaceId,
    name: "Test Workspace",
    createdBy: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const coll = await import("@/lib/db/collections").then((m) => m.getWorkspacesCollection());
  await coll.insertOne(workspace);
  return workspace;
}

async function seedUser(email: string): Promise<DbUser> {
  const user: DbUser = {
    _id: new ObjectId(),
    email,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const users = await getUsersCollection();
  await users.insertOne(user);
  return user;
}

describe("invites", () => {
  it("creates a pending membership with a normalized email", async () => {
    const workspace = await seedWorkspace();
    const membership = await inviteMember(workspace._id.toString(), "  InviteD@Example.COM  ");

    expect(membership.status).toBe("pending");
    expect(membership.invitedEmail).toBe("invited@example.com");
    expect(membership.role).toBe("member");
    expect(membership.userId).toBeNull();
  });

  it("prevents duplicate pending invites for the same email", async () => {
    const workspace = await seedWorkspace();
    const workspaceId = workspace._id.toString();
    await inviteMember(workspaceId, "invited@example.com");

    await expect(inviteMember(workspaceId, "INVITED@EXAMPLE.COM")).rejects.toThrow(
      "already pending",
    );
  });

  it("prevents inviting an email that is already an active member", async () => {
    const workspace = await seedWorkspace();
    const workspaceId = workspace._id.toString();
    const user = await seedUser("member@example.com");
    const memberships = await getMembershipsCollection();
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: user._id,
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(inviteMember(workspaceId, "MEMBER@EXAMPLE.COM")).rejects.toThrow(
      "already a member",
    );
  });

  it("accepts a pending invite by normalized email on first login", async () => {
    const workspace = await seedWorkspace();
    const user = await seedUser("Pending@Example.COM");
    const memberships = await getMembershipsCollection();
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: null,
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: "pending@example.com",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const accepted = await acceptInviteByEmail(user);
    expect(accepted).not.toBeNull();
    expect(accepted!.status).toBe("active");
    expect(accepted!.userId?.toString()).toBe(user._id.toString());
  });

  it("returns null when no pending invite exists", async () => {
    const user = await seedUser("nobody@example.com");
    const accepted = await acceptInviteByEmail(user);
    expect(accepted).toBeNull();
  });

  it("removes a member from the workspace", async () => {
    const workspace = await seedWorkspace();
    const memberships = await getMembershipsCollection();
    const membership: DbMembership = {
      _id: new ObjectId(),
      userId: new ObjectId(),
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await memberships.insertOne(membership);

    await removeMember(workspace._id.toString(), membership._id.toString());
    const remaining = await memberships.findOne({ _id: membership._id });
    expect(remaining).toBeNull();
  });

  it("updates a member's role", async () => {
    const workspace = await seedWorkspace();
    const memberships = await getMembershipsCollection();
    const membership: DbMembership = {
      _id: new ObjectId(),
      userId: new ObjectId(),
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await memberships.insertOne(membership);

    await updateMemberRole(workspace._id.toString(), membership._id.toString(), "admin");
    const updated = await memberships.findOne({ _id: membership._id });
    expect(updated?.role).toBe("admin");
  });

  it("lists only active workspace members", async () => {
    const workspace = await seedWorkspace();
    const otherWorkspace = await seedWorkspace();
    const memberships = await getMembershipsCollection();

    await memberships.insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(),
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(),
      workspaceId: workspace._id,
      role: "admin",
      invitedEmail: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(),
      workspaceId: otherWorkspace._id,
      role: "member",
      invitedEmail: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const members = await getWorkspaceMembers(workspace._id.toString());
    expect(members).toHaveLength(1);
    expect(members[0].status).toBe("active");
    expect(members[0].workspaceId.toString()).toBe(workspace._id.toString());
  });
});
