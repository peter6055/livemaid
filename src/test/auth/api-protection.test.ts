import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { Session } from "@/lib/auth";
import type { DiagramDocument, Folder } from "@/lib/api/storage";

vi.mock("@/lib/env", () => ({
  isDemoMode: vi.fn(() => false),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  isAuthEnabled: vi.fn(() => true),
  requireMember: vi.fn(),
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    code = "FORBIDDEN" as const;
    constructor(message = "Forbidden") {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

vi.mock("@/lib/api/storage", () => ({
  getDiagrams: vi.fn(),
  saveDiagram: vi.fn(),
  deleteDiagram: vi.fn(),
  getFolders: vi.fn(),
  saveFolder: vi.fn(),
  deleteFolderCascade: vi.fn(),
  getFolder: vi.fn(),
  getDiagram: vi.fn(),
  IS_DEMO_MODE: false,
}));

import * as auth from "@/lib/auth";
import * as storage from "@/lib/api/storage";
import * as env from "@/lib/env";

import { GET as getDiagrams, POST as postDiagram } from "@/app/api/diagrams/route";
import {
  GET as getDiagram,
  PUT as putDiagram,
  DELETE as deleteDiagramById,
} from "@/app/api/diagrams/[id]/route";
import {
  GET as getComments,
  POST as postComment,
  PATCH as patchComment,
} from "@/app/api/diagrams/[id]/comments/route";
import { GET as getFolders, POST as postFolder } from "@/app/api/folders/route";
import {
  GET as getFolder,
  PUT as putFolder,
  DELETE as deleteFolderById,
} from "@/app/api/folders/[id]/route";
import {
  GET as getMembers,
  POST as inviteMemberRoute,
} from "@/app/api/workspace/[id]/members/route";
import {
  PATCH as patchMember,
  DELETE as deleteMember,
} from "@/app/api/workspace/[id]/members/[memberId]/route";

const mockedAuth = {
  auth: auth.auth as unknown as Mock<() => Promise<Session | null>>,
  isAuthEnabled: auth.isAuthEnabled as unknown as Mock<() => boolean>,
  requireMember: auth.requireMember as unknown as Mock<
    (userId: string, workspaceId: string) => Promise<void>
  >,
  requireAdmin: auth.requireAdmin as unknown as Mock<
    (userId: string, workspaceId: string) => Promise<void>
  >,
  writeAuditLog: auth.writeAuditLog as unknown as Mock,
  getWorkspaceMembers: auth.getWorkspaceMembers as unknown as Mock<
    (workspaceId: string) => Promise<unknown[]>
  >,
  inviteMember: auth.inviteMember as unknown as Mock,
  updateMemberRole: auth.updateMemberRole as unknown as Mock,
  removeMember: auth.removeMember as unknown as Mock,
};
const mockedStorage = vi.mocked(storage);
const mockedEnv = vi.mocked(env);

function makeSession(workspaceId: string, userId = "user-1"): Session {
  return {
    user: { id: userId, email: "test@example.com", name: "Test User", workspaceId },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } as Session;
}

function makeDiagram(
  workspaceId: string,
  overrides: Partial<DiagramDocument> = {},
): DiagramDocument {
  const now = new Date().toISOString();
  return {
    id: "diagram-1",
    name: "Test Diagram",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    code: "flowchart TD\nA-->B",
    type: "flowchart",
    folderId: null,
    workspaceId,
    starred: false,
    starredAt: null,
    subPages: [],
    comments: [],
    versionHistory: [],
    ...overrides,
  };
}

function makeFolder(workspaceId: string, overrides: Partial<Folder> = {}): Folder {
  const now = new Date().toISOString();
  return {
    id: "folder-1",
    name: "Test Folder",
    parentId: null,
    workspaceId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    starred: false,
    starredAt: null,
    ...overrides,
  };
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("API route protection and workspace scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnv.isDemoMode.mockReturnValue(false);
    mockedAuth.isAuthEnabled.mockReturnValue(true);
  });

  describe("diagram list", () => {
    it("filters diagrams to the user's workspace", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getDiagrams.mockResolvedValue([
        makeDiagram("ws-1", { id: "d1", name: "Mine" }),
        makeDiagram("ws-2", { id: "d2", name: "Other" }),
      ]);

      const res = await getDiagrams(new Request("http://localhost/api/diagrams"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toHaveLength(1);
      expect(json.items[0].id).toBe("d1");
    });

    it("returns 401 when there is no session", async () => {
      mockedAuth.auth.mockResolvedValue(null);

      const res = await getDiagrams(new Request("http://localhost/api/diagrams"));

      expect(res.status).toBe(401);
    });
  });

  describe("diagram CRUD", () => {
    it("creates a diagram in the user's workspace and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.saveDiagram.mockResolvedValue(undefined);

      const res = await postDiagram(
        jsonRequest("http://localhost/api/diagrams", "POST", { name: "New", type: "flowchart" }),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.workspaceId).toBe("ws-1");
      expect(mockedStorage.saveDiagram).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
      );
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "diagram.create", workspaceId: "ws-1" }),
      );
    });

    it("returns a diagram in the user's workspace", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getDiagram.mockResolvedValue(makeDiagram("ws-1"));

      const res = await getDiagram(new Request("http://localhost/api/diagrams/diagram-1"), {
        params: Promise.resolve({ id: "diagram-1" }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.id).toBe("diagram-1");
    });

    it("returns 404 when the diagram belongs to another workspace", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getDiagram.mockResolvedValue(makeDiagram("ws-2"));

      const res = await getDiagram(new Request("http://localhost/api/diagrams/diagram-1"), {
        params: Promise.resolve({ id: "diagram-1" }),
      });

      expect(res.status).toBe(404);
    });

    it("updates a diagram in the user's workspace and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getDiagram.mockResolvedValue(makeDiagram("ws-1"));
      mockedStorage.saveDiagram.mockResolvedValue(undefined);

      const res = await putDiagram(
        jsonRequest("http://localhost/api/diagrams/diagram-1", "PUT", { name: "Renamed" }),
        { params: Promise.resolve({ id: "diagram-1" }) },
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.name).toBe("Renamed");
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "diagram.update", workspaceId: "ws-1" }),
      );
    });

    it("deletes a diagram in the user's workspace and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getDiagram.mockResolvedValue(makeDiagram("ws-1"));
      mockedStorage.deleteDiagram.mockResolvedValue(true);

      const res = await deleteDiagramById(new Request("http://localhost/api/diagrams/diagram-1"), {
        params: Promise.resolve({ id: "diagram-1" }),
      });

      expect(res.status).toBe(204);
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "diagram.delete", workspaceId: "ws-1" }),
      );
    });
  });

  describe("comments", () => {
    it("uses session.user.id as authorId for new comments", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1", "user-session"));
      mockedStorage.getDiagram.mockResolvedValue(makeDiagram("ws-1"));
      mockedStorage.saveDiagram.mockResolvedValue(undefined);

      const res = await postComment(
        jsonRequest("http://localhost/api/diagrams/diagram-1/comments", "POST", {
          content: "Hello",
          authorId: "malicious-user",
        }),
        { params: Promise.resolve({ id: "diagram-1" }) },
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.messages[0].authorId).toBe("user-session");
    });

    it("uses session.user.id as authorId for comment replies", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1", "user-session"));
      mockedStorage.getDiagram.mockResolvedValue(
        makeDiagram("ws-1", {
          comments: [
            {
              id: "comment-1",
              anchor: { type: "canvas", position: { x: 0.5, y: 0.5 } },
              messages: [],
              resolved: false,
              starred: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      );
      mockedStorage.saveDiagram.mockResolvedValue(undefined);

      const res = await patchComment(
        jsonRequest("http://localhost/api/diagrams/diagram-1/comments", "PATCH", {
          commentId: "comment-1",
          content: "Reply",
          authorId: "malicious-user",
        }),
        { params: Promise.resolve({ id: "diagram-1" }) },
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.messages[json.messages.length - 1].authorId).toBe("user-session");
    });

    it("returns 404 when fetching comments for a diagram in another workspace", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getDiagram.mockResolvedValue(makeDiagram("ws-2"));

      const res = await getComments(
        new Request("http://localhost/api/diagrams/diagram-1/comments"),
        { params: Promise.resolve({ id: "diagram-1" }) },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("folder CRUD", () => {
    it("filters folders to the user's workspace", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getFolders.mockResolvedValue([
        makeFolder("ws-1", { id: "f1" }),
        makeFolder("ws-2", { id: "f2" }),
      ]);

      const res = await getFolders(new Request("http://localhost/api/folders"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toHaveLength(1);
      expect(json[0].id).toBe("f1");
    });

    it("returns 404 when the folder belongs to another workspace", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getFolder.mockResolvedValue(makeFolder("ws-2"));

      const res = await getFolder(new Request("http://localhost/api/folders/folder-1"), {
        params: Promise.resolve({ id: "folder-1" }),
      });

      expect(res.status).toBe(404);
    });

    it("creates a folder in the user's workspace and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.saveFolder.mockResolvedValue(undefined);

      const res = await postFolder(
        jsonRequest("http://localhost/api/folders", "POST", { name: "New Folder" }),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.workspaceId).toBe("ws-1");
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "folder.create" as const, workspaceId: "ws-1" }),
      );
    });

    it("updates a folder in the user's workspace and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getFolder.mockResolvedValue(makeFolder("ws-1"));
      mockedStorage.getFolders.mockResolvedValue([]);
      mockedStorage.saveFolder.mockResolvedValue(undefined);

      const res = await putFolder(
        jsonRequest("http://localhost/api/folders/folder-1", "PUT", { name: "Renamed" }),
        { params: Promise.resolve({ id: "folder-1" }) },
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.name).toBe("Renamed");
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "folder.update" as const, workspaceId: "ws-1" }),
      );
    });

    it("deletes a folder in the user's workspace and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedStorage.getFolder.mockResolvedValue(makeFolder("ws-1"));
      mockedStorage.deleteFolderCascade.mockResolvedValue(true);

      const res = await deleteFolderById(new Request("http://localhost/api/folders/folder-1"), {
        params: Promise.resolve({ id: "folder-1" }),
      });

      expect(res.status).toBe(204);
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "folder.delete" as const, workspaceId: "ws-1" }),
      );
    });
  });

  describe("workspace admin endpoints", () => {
    it("allows members to list workspace members", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedAuth.requireMember.mockResolvedValue(undefined);
      mockedAuth.getWorkspaceMembers.mockResolvedValue([]);

      const res = await getMembers(new Request("http://localhost/api/workspace/ws-1/members"), {
        params: Promise.resolve({ id: "ws-1" }),
      });

      expect(res.status).toBe(200);
      expect(mockedAuth.requireMember).toHaveBeenCalledWith("user-1", "ws-1");
    });

    it("blocks members from inviting users", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedAuth.requireAdmin.mockRejectedValue(
        new auth.AuthorizationError("Admin access required"),
      );

      const res = await inviteMemberRoute(
        jsonRequest("http://localhost/api/workspace/ws-1/members", "POST", {
          email: "new@example.com",
        }),
        { params: Promise.resolve({ id: "ws-1" }) },
      );

      expect(res.status).toBe(403);
    });

    it("allows admins to invite members and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedAuth.requireAdmin.mockResolvedValue(undefined);
      mockedAuth.inviteMember.mockResolvedValue({
        _id: { toString: () => "membership-1" } as unknown as import("mongodb").ObjectId,
        workspaceId: { toString: () => "ws-1" } as unknown as import("mongodb").ObjectId,
        userId: null,
        role: "member",
        invitedEmail: "new@example.com",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await inviteMemberRoute(
        jsonRequest("http://localhost/api/workspace/ws-1/members", "POST", {
          email: "new@example.com",
        }),
        { params: Promise.resolve({ id: "ws-1" }) },
      );

      expect(res.status).toBe(201);
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "membership.invite", workspaceId: "ws-1" }),
      );
    });

    it("allows admins to change roles and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedAuth.requireAdmin.mockResolvedValue(undefined);
      mockedAuth.updateMemberRole.mockResolvedValue(undefined);

      const res = await patchMember(
        jsonRequest("http://localhost/api/workspace/ws-1/members/m1", "PATCH", { role: "admin" }),
        { params: Promise.resolve({ id: "ws-1", memberId: "m1" }) },
      );

      expect(res.status).toBe(204);
      expect(mockedAuth.updateMemberRole).toHaveBeenCalledWith("ws-1", "m1", "admin");
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "membership.role_change", workspaceId: "ws-1" }),
      );
    });

    it("allows admins to remove members and writes an audit log", async () => {
      mockedAuth.auth.mockResolvedValue(makeSession("ws-1"));
      mockedAuth.requireAdmin.mockResolvedValue(undefined);
      mockedAuth.removeMember.mockResolvedValue(undefined);

      const res = await deleteMember(
        new Request("http://localhost/api/workspace/ws-1/members/m1"),
        { params: Promise.resolve({ id: "ws-1", memberId: "m1" }) },
      );

      expect(res.status).toBe(204);
      expect(mockedAuth.removeMember).toHaveBeenCalledWith("ws-1", "m1");
      expect(mockedAuth.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "membership.remove", workspaceId: "ws-1" }),
      );
    });
  });
});
