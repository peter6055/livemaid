import { ObjectId } from "mongodb";
import type { DbMembership, DbUser } from "@/lib/db/collections";
import { getMembershipsCollection, getUsersCollection } from "@/lib/db/collections";
import { normalizeEmail } from "./workspace";

export async function inviteMember(
  workspaceId: string,
  invitedEmail: string,
  role: "admin" | "member" = "member",
): Promise<DbMembership> {
  const memberships = await getMembershipsCollection();
  const users = await getUsersCollection();
  const email = normalizeEmail(invitedEmail);

  const pending = await memberships.findOne({
    workspaceId: new ObjectId(workspaceId),
    invitedEmail: email,
    status: "pending",
  });
  if (pending) {
    throw new Error("An invite is already pending for this email");
  }

  const existingUser = await users.findOne({ email });
  if (existingUser) {
    const active = await memberships.findOne({
      workspaceId: new ObjectId(workspaceId),
      userId: existingUser._id,
      status: "active",
    });
    if (active) {
      throw new Error("User is already a member of this workspace");
    }
  }

  const membership: DbMembership = {
    _id: new ObjectId(),
    userId: null,
    workspaceId: new ObjectId(workspaceId),
    role,
    invitedEmail: email,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await memberships.insertOne(membership);
  return membership;
}

export async function acceptInviteByEmail(user: DbUser): Promise<DbMembership | null> {
  const memberships = await getMembershipsCollection();
  const email = normalizeEmail(user.email);

  const pending = await memberships.findOne({
    invitedEmail: email,
    status: "pending",
  });
  if (!pending) {
    return null;
  }

  await memberships.updateOne(
    { _id: pending._id },
    {
      $set: {
        userId: user._id,
        status: "active",
        updatedAt: new Date(),
      },
    },
  );

  return { ...pending, userId: user._id, status: "active" };
}

// DbMembership.status is typed as "active" | "pending", so a soft-delete via
// "inactive" would violate the schema. We hard-delete memberships on removal;
// the audit log retains the history of the action.
export async function removeMember(workspaceId: string, membershipId: string): Promise<void> {
  const memberships = await getMembershipsCollection();
  await memberships.deleteOne({
    _id: new ObjectId(membershipId),
    workspaceId: new ObjectId(workspaceId),
  });
}

export async function updateMemberRole(
  workspaceId: string,
  membershipId: string,
  role: "admin" | "member",
): Promise<void> {
  const memberships = await getMembershipsCollection();
  await memberships.updateOne(
    { _id: new ObjectId(membershipId), workspaceId: new ObjectId(workspaceId) },
    { $set: { role, updatedAt: new Date() } },
  );
}

export async function getWorkspaceMembers(workspaceId: string): Promise<DbMembership[]> {
  const memberships = await getMembershipsCollection();
  return memberships
    .find({
      workspaceId: new ObjectId(workspaceId),
      status: "active",
    })
    .toArray();
}
