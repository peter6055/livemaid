import { describe, it, expect, vi, afterEach } from "vitest";
import type { Collection } from "mongodb";
import type { DbUser, DbWorkspace, DbMembership } from "@/lib/db/collections";
import { ObjectId } from "mongodb";

vi.mock("@/lib/db/collections", async () => {
  const { ObjectId } = await vi.importActual<typeof import("mongodb")>("mongodb");

  const users: DbUser[] = [];
  const workspaces: DbWorkspace[] = [];
  const memberships: DbMembership[] = [];

  function sameValue(left: unknown, right: unknown): boolean {
    if (left instanceof ObjectId && right instanceof ObjectId) {
      return left.equals(right);
    }
    return left === right;
  }

  function matchesField(itemValue: unknown, condition: unknown): boolean {
    if (condition && typeof condition === "object" && "$in" in condition) {
      return (condition as { $in: unknown[] }).$in.some((candidate) =>
        sameValue(candidate, itemValue),
      );
    }
    return sameValue(condition, itemValue);
  }

  function matches<T extends { _id: ObjectId }>(item: T, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, condition]) =>
      matchesField((item as Record<string, unknown>)[key], condition),
    );
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
      // Supports only the $match + $lookup pipeline getWorkspaceMembers builds.
      aggregate(pipeline: Record<string, unknown>[]) {
        let results = items.map((item) => ({ ...item }) as Record<string, unknown>);
        for (const stage of pipeline) {
          if ("$match" in stage) {
            const filter = stage.$match as Record<string, unknown>;
            results = results.filter((item) =>
              Object.entries(filter).every(([key, condition]) =>
                matchesField(item[key], condition),
              ),
            );
          } else if ("$lookup" in stage) {
            const { from, localField, foreignField, as } = stage.$lookup as {
              from: string;
              localField: string;
              foreignField: string;
              as: string;
            };
            const source = (from === "users" ? users : []) as unknown as Record<string, unknown>[];
            results = results.map((item) => ({
              ...item,
              [as]: source.filter(
                (candidate) =>
                  candidate[foreignField] != null &&
                  sameValue(candidate[foreignField], item[localField]),
              ),
            }));
          } else {
            throw new Error(`Unsupported aggregate stage: ${Object.keys(stage)[0]}`);
          }
        }
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

  // Collections are memoized so tests can spy on the exact instances the code uses.
  const collections = {
    users: createCollection<DbUser>(users),
    workspaces: createCollection<DbWorkspace>(workspaces),
    memberships: createCollection<DbMembership>(memberships),
  };

  return {
    getUsersCollection: () => Promise.resolve(collections.users as unknown as Collection<DbUser>),
    getWorkspacesCollection: () =>
      Promise.resolve(collections.workspaces as unknown as Collection<DbWorkspace>),
    getMembershipsCollection: () =>
      Promise.resolve(collections.memberships as unknown as Collection<DbMembership>),
  };
});

import {
  inviteMember,
  acceptInviteByEmail,
  removeMember,
  updateMemberRole,
  setUserActive,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("lists active and pending members in one query without per-member user lookups", async () => {
    const workspace = await seedWorkspace();
    const memberships = await getMembershipsCollection();
    const users = await getUsersCollection();

    const activeUser = await seedUser("active@example.com");
    const blockedUser = await seedUser("blocked@example.com");
    const thirdUser = await seedUser("third@example.com");
    await users.updateOne({ _id: blockedUser._id }, { $set: { active: false } });

    for (const [userId, role] of [
      [activeUser._id, "member"],
      [blockedUser._id, "admin"],
      [thirdUser._id, "member"],
    ] as const) {
      await memberships.insertOne({
        _id: new ObjectId(),
        userId,
        workspaceId: workspace._id,
        role,
        invitedEmail: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: null,
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: "invitee@example.com",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const userFindOne = vi.spyOn(users, "findOne");
    const memberAggregate = vi.spyOn(memberships, "aggregate");

    const members = await getWorkspaceMembers(workspace._id.toString());

    expect(userFindOne).not.toHaveBeenCalled();
    expect(memberAggregate).toHaveBeenCalledTimes(1);
    expect(members).toHaveLength(4);

    const byEmail = Object.fromEntries(members.map((m) => [m.email, m]));
    expect(byEmail["active@example.com"]).toMatchObject({
      email: "active@example.com",
      active: true,
      status: "active",
    });
    expect(byEmail["blocked@example.com"]).toMatchObject({ active: false, status: "active" });
    expect(byEmail["invitee@example.com"]).toMatchObject({
      email: "invitee@example.com",
      active: true,
      status: "pending",
      userId: null,
    });
  });

  it("filters member status inside the query and drops unknown statuses", async () => {
    const workspace = await seedWorkspace();
    const memberships = await getMembershipsCollection();
    const user = await seedUser("kept@example.com");

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
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(),
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: null,
      status: "removed" as unknown as DbMembership["status"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const memberAggregate = vi.spyOn(memberships, "aggregate");
    const members = await getWorkspaceMembers(workspace._id.toString());

    const pipeline = memberAggregate.mock.calls[0][0] as Record<string, unknown>[];
    const match = pipeline.find((stage) => "$match" in stage)?.$match as Record<string, unknown>;
    expect(match.status).toEqual({ $in: ["active", "pending"] });
    expect(members).toHaveLength(1);
    expect(members[0].email).toBe("kept@example.com");
  });

  it("lists active and pending members with email and active flags", async () => {
    const workspace = await seedWorkspace();
    const otherWorkspace = await seedWorkspace();
    const memberships = await getMembershipsCollection();
    const activeUser = await seedUser("active@example.com");
    const blockedUser = await seedUser("blocked@example.com");
    const users = await getUsersCollection();
    await users.updateOne({ _id: blockedUser._id }, { $set: { active: false } });

    await memberships.insertOne({
      _id: new ObjectId(),
      userId: activeUser._id,
      workspaceId: workspace._id,
      role: "member",
      invitedEmail: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: blockedUser._id,
      workspaceId: workspace._id,
      role: "admin",
      invitedEmail: null,
      status: "active",
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
    expect(members).toHaveLength(3);

    const byEmail = Object.fromEntries(members.map((m) => [m.email, m]));
    expect(byEmail["active@example.com"].active).toBe(true);
    expect(byEmail["active@example.com"].status).toBe("active");
    expect(byEmail["active@example.com"].userId).toBe(activeUser._id.toString());
    expect(byEmail["pending@example.com"].active).toBe(true);
    expect(byEmail["pending@example.com"].status).toBe("pending");
    expect(byEmail["pending@example.com"].userId).toBeNull();
    expect(byEmail["blocked@example.com"].active).toBe(false);
  });

  it("sets a user's active flag", async () => {
    const user = await seedUser("toggle@example.com");
    await setUserActive(user._id.toString(), false);
    const users = await getUsersCollection();
    const updated = await users.findOne({ _id: user._id });
    expect(updated?.active).toBe(false);

    await setUserActive(user._id.toString(), true);
    const reactivated = await users.findOne({ _id: user._id });
    expect(reactivated?.active).toBe(true);
  });
});
