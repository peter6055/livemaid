import { ObjectId } from "mongodb";
import type { DbUser, DbWorkspace, DbMembership } from "@/lib/db/collections";
import {
  getUsersCollection,
  getWorkspacesCollection,
  getMembershipsCollection,
} from "@/lib/db/collections";

export interface OidcProfile {
  sub: string;
  email?: string;
  name?: string;
  image?: string;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function findOrCreateUser(profile: OidcProfile): Promise<DbUser> {
  if (!profile.email) {
    throw new Error("OIDC profile is missing email");
  }

  const email = normalizeEmail(profile.email);
  const users = await getUsersCollection();
  const now = new Date();

  const existing = await users.findOne({ email });
  if (existing) {
    const updates: Partial<DbUser> = { updatedAt: now };
    if (profile.name !== undefined && profile.name !== existing.name) {
      updates.name = profile.name;
    }
    if (profile.image !== undefined && profile.image !== existing.image) {
      updates.image = profile.image;
    }

    if (Object.keys(updates).length > 1) {
      await users.updateOne({ _id: existing._id }, { $set: updates });
      return { ...existing, ...updates };
    }

    return existing;
  }

  const user: DbUser = {
    _id: new ObjectId(),
    email,
    name: profile.name,
    image: profile.image,
    createdAt: now,
    updatedAt: now,
  };

  await users.insertOne(user);
  return user;
}

export async function createDefaultWorkspace(
  userId: ObjectId,
  name?: string,
): Promise<DbWorkspace> {
  const workspaces = await getWorkspacesCollection();
  const now = new Date();

  const workspace: DbWorkspace = {
    _id: new ObjectId(),
    name: name || "My Workspace",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };

  await workspaces.insertOne(workspace);
  return workspace;
}

export async function createAdminMembership(
  userId: ObjectId,
  workspaceId: ObjectId,
): Promise<DbMembership> {
  const memberships = await getMembershipsCollection();
  const now = new Date();

  const membership: DbMembership = {
    _id: new ObjectId(),
    userId,
    workspaceId,
    role: "admin",
    invitedEmail: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await memberships.insertOne(membership);
  return membership;
}

export async function getWorkspaceById(
  workspaceId: string | ObjectId,
): Promise<DbWorkspace | null> {
  const workspaces = await getWorkspacesCollection();
  return workspaces.findOne({ _id: new ObjectId(workspaceId) });
}

/**
 * Resolves a user's active membership and its workspace in one round trip.
 * `workspaces._id` is always indexed, so the $lookup is cheap.
 */
export async function getActiveWorkspace(
  userId: string | ObjectId,
): Promise<{ workspace: DbWorkspace; membership: DbMembership } | null> {
  const memberships = await getMembershipsCollection();
  const [row] = await memberships
    .aggregate<DbMembership & { workspace: DbWorkspace[] }>([
      { $match: { userId: new ObjectId(userId), status: "active" } },
      {
        $lookup: {
          from: "workspaces",
          localField: "workspaceId",
          foreignField: "_id",
          as: "workspace",
        },
      },
      { $limit: 1 },
    ])
    .toArray();

  const workspace = row?.workspace[0];
  if (!row || !workspace) return null;
  return { workspace, membership: row };
}

export async function ensureDefaultWorkspace(
  user: DbUser,
): Promise<{ user: DbUser; workspace: DbWorkspace; membership: DbMembership }> {
  const existing = await getActiveWorkspace(user._id);
  if (existing) {
    return { user, ...existing };
  }

  // getActiveWorkspace returns null for both "no membership" and "membership
  // without a workspace"; only the latter must fail instead of creating one.
  const memberships = await getMembershipsCollection();
  const danglingMembership = await memberships.findOne({
    userId: user._id,
    status: "active",
  });
  if (danglingMembership) {
    throw new Error("Membership references a missing workspace");
  }

  // Invite-only while the deployment has a single workspace (multi-workspace
  // support will replace this gate with explicit create/join). Creating one here
  // would make every OIDC account an admin of its own workspace, with
  // system-wide visibility.
  const workspaces = await getWorkspacesCollection();
  if (await workspaces.findOne({})) {
    throw new Error("Workspace already exists; an invite is required");
  }

  const workspace = await createDefaultWorkspace(user._id);
  const membership = await createAdminMembership(user._id, workspace._id);
  return { user, workspace, membership };
}
