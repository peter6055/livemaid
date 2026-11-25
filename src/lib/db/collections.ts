import type { Collection, ObjectId } from "mongodb";
import { getMongoClient } from "./client";

export interface DbUser {
  _id: ObjectId;
  email: string;
  name?: string;
  image?: string;
  /** When false, sign-in is rejected. Omitted/true means active. */
  active?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbWorkspace {
  _id: ObjectId;
  name: string;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbMembership {
  _id: ObjectId;
  userId: ObjectId | null;
  workspaceId: ObjectId;
  role: "admin" | "member";
  invitedEmail: string | null;
  status: "active" | "pending";
  createdAt: Date;
  updatedAt: Date;
}

async function getDb() {
  const client = await getMongoClient();
  return client.db();
}

export async function getUsersCollection(): Promise<Collection<DbUser>> {
  return (await getDb()).collection<DbUser>("users");
}

export async function getWorkspacesCollection(): Promise<Collection<DbWorkspace>> {
  return (await getDb()).collection<DbWorkspace>("workspaces");
}

export async function getMembershipsCollection(): Promise<Collection<DbMembership>> {
  return (await getDb()).collection<DbMembership>("memberships");
}
