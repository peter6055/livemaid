import crypto from "crypto";
import { ObjectId, type Collection } from "mongodb";
import { getMongoClient } from "@/lib/db/client";
import { isDemoMode } from "@/lib/env";

export type AuditAction =
  | `user.${"login" | "logout"}`
  | `workspace.${"create" | "update" | "delete"}`
  | `membership.${"invite" | "accept" | "remove" | "role_change"}`
  | `diagram.${"create" | "update" | "delete" | "duplicate"}`
  | `folder.${"create" | "update" | "delete"}`
  | `comment.${"create" | "update" | "resolve" | "delete"}`;

export interface AuditLog {
  _id: ObjectId;
  actorId: string;
  workspaceId?: string;
  action: AuditAction;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipHash: string | null;
  createdAt: Date;
}

async function getAuditLogsCollection(): Promise<Collection<AuditLog>> {
  const client = await getMongoClient();
  return client.db().collection<AuditLog>("auditLogs");
}

export function hashIp(ip: string): string {
  const pepper = process.env.AUDIT_IP_PEPPER ?? "";
  return crypto
    .createHash("sha256")
    .update(ip + pepper)
    .digest("hex");
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return null;
}

export async function writeAuditLog(args: {
  actorId: string;
  workspaceId?: string;
  action: AuditAction;
  targetId?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}): Promise<void> {
  if (isDemoMode()) {
    return;
  }

  const ip = args.request ? getClientIp(args.request) : null;
  const ipHash = ip && process.env.AUDIT_IP_PEPPER ? hashIp(ip) : null;

  const auditLogs = await getAuditLogsCollection();
  await auditLogs.insertOne({
    _id: new ObjectId(),
    actorId: args.actorId,
    workspaceId: args.workspaceId,
    action: args.action,
    targetId: args.targetId,
    metadata: args.metadata,
    ipHash,
    createdAt: new Date(),
  });
}
