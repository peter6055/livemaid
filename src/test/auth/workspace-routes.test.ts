import { describe, it, expect } from "vitest";
import type { Session } from "@/lib/auth";

// These helpers mirror the redirect decision logic in the workspace-scoped route
// pages (src/app/page.tsx and src/app/editor/[id]/page.tsx). They are duplicated
// here so the unit tests can run without importing Next.js server-only modules.

function getHomeRedirect(
  session: Session | null,
  isDemo: boolean,
  authEnabled: boolean,
): string | null {
  if (isDemo || !authEnabled) return null;
  if (session?.user?.workspaceId) return `/workspace/${session.user.workspaceId}`;
  return null;
}

function getEditorRedirect(
  session: Session | null,
  isDemo: boolean,
  authEnabled: boolean,
  diagramId: string,
): string | null {
  if (isDemo || !authEnabled) return null;
  if (session?.user?.workspaceId)
    return `/workspace/${session.user.workspaceId}/editor/${diagramId}`;
  return null;
}

function makeSession(workspaceId?: string): Session {
  return {
    user: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      workspaceId,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } as Session;
}

describe("workspace route redirects", () => {
  describe("getHomeRedirect", () => {
    it("redirects to the user's workspace when authenticated", () => {
      const session = makeSession("ws-abc123");
      expect(getHomeRedirect(session, false, true)).toBe("/workspace/ws-abc123");
    });

    it("does not redirect in demo mode", () => {
      const session = makeSession("ws-abc123");
      expect(getHomeRedirect(session, true, true)).toBeNull();
    });

    it("does not redirect when auth is disabled", () => {
      const session = makeSession("ws-abc123");
      expect(getHomeRedirect(session, false, false)).toBeNull();
    });

    it("does not redirect when there is no session", () => {
      expect(getHomeRedirect(null, false, true)).toBeNull();
    });

    it("does not redirect when the session lacks a workspace id", () => {
      expect(getHomeRedirect(makeSession(undefined), false, true)).toBeNull();
    });
  });

  describe("getEditorRedirect", () => {
    it("redirects to the workspace-scoped editor when authenticated", () => {
      const session = makeSession("ws-abc123");
      expect(getEditorRedirect(session, false, true, "diagram-1")).toBe(
        "/workspace/ws-abc123/editor/diagram-1",
      );
    });

    it("does not redirect in demo mode", () => {
      const session = makeSession("ws-abc123");
      expect(getEditorRedirect(session, true, true, "diagram-1")).toBeNull();
    });

    it("does not redirect when auth is disabled", () => {
      const session = makeSession("ws-abc123");
      expect(getEditorRedirect(session, false, false, "diagram-1")).toBeNull();
    });

    it("does not redirect when there is no session", () => {
      expect(getEditorRedirect(null, false, true, "diagram-1")).toBeNull();
    });
  });
});
