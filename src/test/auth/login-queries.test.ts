import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Collection } from "mongodb";
import type { Profile } from "@auth/core/types";
import type { DbUser, DbWorkspace, DbMembership } from "@/lib/db/collections";

vi.mock("@/lib/db/collections", async () => {
  const { ObjectId } = await vi.importActual<typeof import("mongodb")>("mongodb");

  const users: DbUser[] = [];
  const workspaces: DbWorkspace[] = [];
  const memberships: DbMembership[] = [];

  function matches(item: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      const itemValue = item[key];
      if (value instanceof ObjectId && itemValue instanceof ObjectId) {
        return value.equals(itemValue);
      }
      return itemValue === value;
    });
  }

  function createCollection<T extends { _id: ObjectId }>(items: T[]) {
    return {
      findOne: vi.fn(async (filter: Record<string, unknown>) => {
        return items.find((item) => matches(item as Record<string, unknown>, filter)) ?? null;
      }),
      find: vi.fn((filter: Record<string, unknown>) => ({
        toArray: async () =>
          items.filter((item) => matches(item as Record<string, unknown>, filter)),
      })),
      insertOne: vi.fn(async (doc: T) => {
        items.push(doc);
        return { acknowledged: true, insertedId: doc._id };
      }),
      updateOne: vi.fn(async (filter: Record<string, unknown>, update: { $set: Partial<T> }) => {
        const index = items.findIndex((item) => matches(item as Record<string, unknown>, filter));
        if (index >= 0) {
          items[index] = { ...items[index], ...update.$set };
          return { acknowledged: true, modifiedCount: 1 };
        }
        return { acknowledged: true, modifiedCount: 0 };
      }),
      deleteMany: vi.fn(async () => {
        const deletedCount = items.length;
        items.length = 0;
        return { acknowledged: true, deletedCount };
      }),
      // Minimal in-memory $match / $lookup / $limit so the aggregate route is observable.
      aggregate: vi.fn((pipeline: Record<string, unknown>[]) => {
        let rows = items.map((item) => ({ ...(item as object) })) as Record<string, unknown>[];
        for (const stage of pipeline) {
          if ("$match" in stage) {
            rows = rows.filter((row) => matches(row, stage.$match as Record<string, unknown>));
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
                matches(doc, { [lookup.foreignField]: row[lookup.localField] }),
              ),
            }));
          }
        }
        return { toArray: async () => rows };
      }),
    };
  }

  const collections = {
    users: createCollection(users),
    workspaces: createCollection(workspaces),
    memberships: createCollection(memberships),
  };

  return {
    getUsersCollection: () => Promise.resolve(collections.users as unknown as Collection<DbUser>),
    getWorkspacesCollection: () =>
      Promise.resolve(collections.workspaces as unknown as Collection<DbWorkspace>),
    getMembershipsCollection: () =>
      Promise.resolve(collections.memberships as unknown as Collection<DbMembership>),
  };
});

import { createAuthConfig } from "@/lib/auth/config";
import { cachedDiscoveryFetch } from "@/lib/auth/oidcDiscovery";
import {
  getUsersCollection,
  getWorkspacesCollection,
  getMembershipsCollection,
} from "@/lib/db/collections";

type Mock = ReturnType<typeof vi.fn>;

function spy(collection: unknown, method: string): Mock {
  return (collection as unknown as Record<string, Mock>)[method];
}

function callsMatching(
  collection: unknown,
  method: string,
  predicate: (filter: Record<string, unknown>) => boolean,
): number {
  return spy(collection, method).mock.calls.filter((args) =>
    predicate((args[0] ?? {}) as Record<string, unknown>),
  ).length;
}

function resetSpies(collections: unknown[]): void {
  for (const collection of collections) {
    for (const method of ["findOne", "find", "insertOne", "updateOne", "deleteMany", "aggregate"]) {
      spy(collection, method).mockClear();
    }
  }
}

async function countDocuments(collection: unknown): Promise<number> {
  const typed = collection as Collection;
  return (await typed.find({}).toArray()).length;
}

describe("login query cost", () => {
  let users: Collection<DbUser>;
  let workspaces: Collection<DbWorkspace>;
  let memberships: Collection<DbMembership>;

  beforeEach(async () => {
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "client-secret";
    delete process.env.DEMO_MODE;

    users = await getUsersCollection();
    workspaces = await getWorkspacesCollection();
    memberships = await getMembershipsCollection();
    for (const collection of [users, workspaces, memberships]) {
      await collection.deleteMany({});
    }
    resetSpies([users, workspaces, memberships]);
  });

  it("repeat login reads the user once and resolves workspace in at most two queries", async () => {
    const now = new Date();
    const user: DbUser = {
      _id: new ObjectId(),
      email: "repeat@example.com",
      name: "Repeat User",
      createdAt: now,
      updatedAt: now,
    };
    const workspace: DbWorkspace = {
      _id: new ObjectId(),
      name: "Existing Workspace",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };
    const membership: DbMembership = {
      _id: new ObjectId(),
      userId: user._id,
      workspaceId: workspace._id,
      role: "admin",
      invitedEmail: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(user);
    await workspaces.insertOne(workspace);
    await memberships.insertOne(membership);
    resetSpies([users, workspaces, memberships]);

    const profile = { sub: "oidc-repeat", email: user.email, name: user.name } as Profile;
    const adapterUser = { id: user._id.toString(), email: user.email, name: user.name };

    const config = await createAuthConfig();
    await config.callbacks!.signIn!({ user: adapterUser, profile });
    const token = await config.callbacks!.jwt!({
      token: { sub: user._id.toString() },
      user: adapterUser,
      profile,
      trigger: "signIn",
    });

    // Cause A: one email lookup for the whole login, no duplicate bootstrap.
    expect(callsMatching(users, "findOne", (filter) => filter.email === user.email)).toBe(1);

    // Workspace resolution: active-membership queries + workspace queries combined.
    const workspaceResolutionQueries =
      callsMatching(memberships, "findOne", (filter) => filter.status === "active") +
      spy(memberships, "aggregate").mock.calls.length +
      spy(workspaces, "findOne").mock.calls.length;
    expect(workspaceResolutionQueries).toBeLessThanOrEqual(2);

    expect(token?.workspaceId).toBe(workspace._id.toString());
    expect(token?.role).toBe("admin");
    expect(await countDocuments(workspaces)).toBe(1);
  });

  it("rejects an inactive user without creating a workspace", async () => {
    const now = new Date();
    const user: DbUser = {
      _id: new ObjectId(),
      email: "blocked@example.com",
      name: "Blocked User",
      active: false,
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(user);
    resetSpies([users, workspaces, memberships]);

    const config = await createAuthConfig();
    const accepted = await config.callbacks!.signIn!({
      user: { id: user._id.toString(), email: user.email, name: user.name },
      profile: { sub: "oidc-blocked", email: user.email, name: user.name } as Profile,
    });

    expect(accepted).toBe(false);
    expect(spy(memberships, "insertOne")).not.toHaveBeenCalled();
    expect(await countDocuments(workspaces)).toBe(0);
  });

  it("rejects an uninvited user instead of provisioning a second workspace", async () => {
    const now = new Date();
    const owner: DbUser = {
      _id: new ObjectId(),
      email: "owner@example.com",
      name: "Owner",
      createdAt: now,
      updatedAt: now,
    };
    const workspace: DbWorkspace = {
      _id: new ObjectId(),
      name: "My Workspace",
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(owner);
    await workspaces.insertOne(workspace);
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: owner._id,
      workspaceId: workspace._id,
      role: "admin",
      invitedEmail: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    resetSpies([users, workspaces, memberships]);

    const config = await createAuthConfig();
    const accepted = await config.callbacks!.signIn!({
      user: { id: "oidc-stranger", email: "stranger@example.com", name: "Stranger" },
      profile: { sub: "oidc-stranger", email: "stranger@example.com", name: "Stranger" } as Profile,
    });

    expect(accepted).toBe(false);
    expect(spy(workspaces, "insertOne")).not.toHaveBeenCalled();
    expect(spy(memberships, "insertOne")).not.toHaveBeenCalled();
    expect(await countDocuments(workspaces)).toBe(1);
  });

  it("keeps the invited workspace instead of creating a default one", async () => {
    const now = new Date();
    const user: DbUser = {
      _id: new ObjectId(),
      email: "invited@example.com",
      name: "Invited User",
      createdAt: now,
      updatedAt: now,
    };
    const invitedWorkspace: DbWorkspace = {
      _id: new ObjectId(),
      name: "Inviting Workspace",
      createdBy: new ObjectId(),
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(user);
    await workspaces.insertOne(invitedWorkspace);
    await memberships.insertOne({
      _id: new ObjectId(),
      userId: null,
      workspaceId: invitedWorkspace._id,
      role: "member",
      invitedEmail: user.email,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    resetSpies([users, workspaces, memberships]);

    const profile = { sub: "oidc-invited", email: user.email, name: user.name } as Profile;
    const adapterUser = { id: user._id.toString(), email: user.email, name: user.name };

    const config = await createAuthConfig();
    await config.callbacks!.signIn!({ user: adapterUser, profile });
    const token = await config.callbacks!.jwt!({
      token: { sub: user._id.toString() },
      user: adapterUser,
      profile,
      trigger: "signIn",
    });

    expect(token?.workspaceId).toBe(invitedWorkspace._id.toString());
    expect(token?.role).toBe("member");
    expect(await countDocuments(workspaces)).toBe(1);
    expect(spy(workspaces, "insertOne")).not.toHaveBeenCalled();
  });
});

describe("cachedDiscoveryFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a discovery document only once for repeated calls", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ issuer: "https://idp-discovery.example.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://idp-discovery.example.com/.well-known/openid-configuration";
    const first = await cachedDiscoveryFetch(url);
    const second = await cachedDiscoveryFetch(url);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual({ issuer: "https://idp-discovery.example.com" });
    expect(await second.json()).toEqual({ issuer: "https://idp-discovery.example.com" });
  });

  it("always re-fetches non-discovery endpoints such as the token endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://idp-discovery.example.com/oauth2/token";
    await cachedDiscoveryFetch(url);
    await cachedDiscoveryFetch(url);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
