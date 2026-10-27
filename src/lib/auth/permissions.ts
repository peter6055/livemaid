import { ObjectId } from "mongodb";
import type { DbMembership } from "@/lib/db/collections";
import { getMembershipsCollection } from "@/lib/db/collections";

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

export async function requireMember(userId: string, workspaceId: string): Promise<void> {
  if (!(await isMember(userId, workspaceId))) {
    throw new AuthorizationError("Workspace membership required");
  }
}
