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

export async function ensureDefaultWorkspace(
  profile: OidcProfile,
): Promise<{ user: DbUser; workspace: DbWorkspace; membership: DbMembership }> {
  const user = await findOrCreateUser(profile);
  const memberships = await getMembershipsCollection();
  const workspaces = await getWorkspacesCollection();

  const existingMembership = await memberships.findOne({
    userId: user._id,
    status: "active",
  });

  if (existingMembership) {
    const workspace = await workspaces.findOne({ _id: existingMembership.workspaceId });
    if (!workspace) {
      throw new Error("Membership references a missing workspace");
    }
    return { user, workspace, membership: existingMembership };
  }

  const workspace = await createDefaultWorkspace(user._id);
  const membership = await createAdminMembership(user._id, workspace._id);
  return { user, workspace, membership };
}
