import { ObjectId } from "mongodb";
import type { DbMembership } from "@/lib/db/collections";
import { getMembershipsCollection, getUsersCollection } from "@/lib/db/collections";

export class AuthorizationError extends Error {
  code = "FORBIDDEN" as const;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getMembership(
  userId: string,
  workspaceId: string,
): Promise<DbMembership | null> {
  const memberships = await getMembershipsCollection();
  return memberships.findOne({
    userId: new ObjectId(userId),
    workspaceId: new ObjectId(workspaceId),
    status: "active",
  });
}

export async function isUserActive(userId: string): Promise<boolean> {
  const users = await getUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(userId) });
  return !!user && user.active !== false;
}

export async function isAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await getMembership(userId, workspaceId);
  return membership?.role === "admin";
}

export async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await getMembership(userId, workspaceId);
  return (
    membership?.status === "active" && (membership.role === "admin" || membership.role === "member")
  );
}

export async function requireAdmin(userId: string, workspaceId: string): Promise<void> {
  if (!(await isAdmin(userId, workspaceId))) {
    throw new AuthorizationError("Admin access required");
  }
}

export async function requireMemberRole(
  userId: string,
  workspaceId: string,
): Promise<"admin" | "member"> {
  const membership = await getMembership(userId, workspaceId);
  if (!membership || (membership.role !== "admin" && membership.role !== "member")) {
    throw new AuthorizationError("Workspace membership required");
  }
  return membership.role;
}

export async function requireMember(userId: string, workspaceId: string): Promise<void> {
  await requireMemberRole(userId, workspaceId);
}
