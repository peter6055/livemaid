import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import type { ObjectId } from "mongodb";

const auditLogs: Array<{
  _id: ObjectId;
  actorId: string;
  workspaceId?: string;
  action: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipHash: string | null;
  createdAt: Date;
}> = [];

vi.mock("@/lib/db/client", () => ({
  getMongoClient: () =>
    Promise.resolve({
      db: () => ({
        collection: () => ({
          insertOne: (doc: (typeof auditLogs)[number]) => {
            auditLogs.push(doc);
            return Promise.resolve({ acknowledged: true, insertedId: doc._id });
          },
          find: () => ({
            toArray: () => Promise.resolve([...auditLogs]),
          }),
        }),
      }),
    }),
}));

import {
  hashIp,
  getClientIp,
  writeAuditLog,
  type AuditAction,
  type AuditLog,
} from "@/lib/auth/audit";

describe("audit", () => {
  beforeEach(() => {
    auditLogs.length = 0;
    delete process.env.DEMO_MODE;
    delete process.env.AUDIT_IP_PEPPER;
  });

  afterEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.AUDIT_IP_PEPPER;
  });

  it("hashes an IP with sha256 and the configured pepper", () => {
    process.env.AUDIT_IP_PEPPER = "secret-pepper";
    const expected = crypto.createHash("sha256").update("192.168.1.1secret-pepper").digest("hex");
    expect(hashIp("192.168.1.1")).toBe(expected);
  });

  it("reads x-forwarded-for first when extracting client IP", () => {
    const request = new Request("http://localhost/", {
      headers: {
        "x-forwarded-for": "203.0.113.1, 70.41.3.18, 150.172.238.178",
        "x-real-ip": "10.0.0.1",
      },
    });
    expect(getClientIp(request)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("10.0.0.1");
  });

  it("returns null when no IP header is present", () => {
    const request = new Request("http://localhost/");
    expect(getClientIp(request)).toBeNull();
  });

  it("writes an audit log with hashed IP when pepper is set", async () => {
    process.env.AUDIT_IP_PEPPER = "secret-pepper";
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });

    await writeAuditLog({
      actorId: "user-1",
      workspaceId: "workspace-1",
      action: "diagram.create",
      targetId: "diagram-1",
      metadata: { source: "test" },
      request,
    });

    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0] as AuditLog;
    expect(log.actorId).toBe("user-1");
    expect(log.workspaceId).toBe("workspace-1");
    expect(log.action).toBe("diagram.create" as AuditAction);
    expect(log.targetId).toBe("diagram-1");
    expect(log.metadata).toEqual({ source: "test" });
    expect(log.ipHash).toBe(hashIp("192.168.1.1"));
  });

  it("stores a null IP hash when the pepper is missing", async () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });

    await writeAuditLog({ actorId: "user-1", action: "user.login", request });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].ipHash).toBeNull();
  });

  it("stores a null IP hash when no request is provided", async () => {
    await writeAuditLog({ actorId: "user-1", action: "user.logout" });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].ipHash).toBeNull();
  });

  it("skips writing audit logs in demo mode", async () => {
    process.env.DEMO_MODE = "true";
    await writeAuditLog({ actorId: "user-1", action: "user.login" });
    expect(auditLogs).toHaveLength(0);
  });
});
