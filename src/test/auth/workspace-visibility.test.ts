import { describe, it, expect, vi, beforeEach } from "vitest";

// routeAuth only needs these from the auth module; mocking keeps next-auth
// (and its Next.js server imports) out of the unit test.
const requireMemberRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  isAuthEnabled: vi.fn(() => Promise.resolve(true)),
  AuthorizationError: class AuthorizationError extends Error {},
  requireMemberRole: (...args: unknown[]) => requireMemberRole(...args),
}));

import {
  assertDiagramAccess,
  assertFolderAccess,
  filterVisibleResources,
  getVisibilityScope,
  RouteAuthError,
  type VisibilityScope,
} from "@/lib/auth/routeAuth";

const session = {
  user: { id: "user-1", email: "member@example.com", workspaceId: "ws-1", role: "member" },
} as unknown as Parameters<typeof getVisibilityScope>[0];

const member: VisibilityScope = { userId: "user-1", role: "member" };
const admin: VisibilityScope = { userId: "admin-1", role: "admin" };

const mine = { id: "mine", createdBy: "user-1" };
const otherMember = { id: "other-member", createdBy: "user-2" };
const noCreator = { id: "legacy", createdBy: undefined };
const resources = [mine, otherMember, noCreator];
const adminResources = [{ id: "admin-own", createdBy: "admin-1" }, ...resources];

describe("diagram and folder visibility", () => {
  beforeEach(() => requireMemberRole.mockReset());

  it("shows an admin their own records plus standalone-created (creator-less) ones", () => {
    expect(filterVisibleResources(adminResources, admin)).toEqual([
      adminResources[0], // admin's own
      noCreator, // created in standalone mode
    ]);
  });

  it("shows a member only the records they created", () => {
    expect(filterVisibleResources(resources, member)).toEqual([mine]);
  });

  it("hides another member's records even in the same workspace", () => {
    expect(filterVisibleResources(resources, member)).not.toContainEqual(otherMember);
  });

  it("shows creator-less standalone records to an admin only, never to a member", () => {
    expect(filterVisibleResources([noCreator], member)).toEqual([]);
    expect(filterVisibleResources([noCreator], admin)).toEqual([noCreator]);
  });

  it("lets an admin read and write their own and standalone-created records", () => {
    for (const resource of [adminResources[0], noCreator]) {
      expect(() => assertDiagramAccess(admin, resource)).not.toThrow();
      expect(() => assertFolderAccess(admin, resource)).not.toThrow();
    }
  });

  it("hides another member's records from an admin too", () => {
    expect(() => assertDiagramAccess(admin, otherMember)).toThrow(RouteAuthError);
    expect(() => assertFolderAccess(admin, otherMember)).toThrow(RouteAuthError);
  });

  it("lets a member read and write only their own records", () => {
    expect(() => assertDiagramAccess(member, mine)).not.toThrow();
    expect(() => assertFolderAccess(member, mine)).not.toThrow();

    for (const resource of [otherMember, noCreator]) {
      expect(() => assertDiagramAccess(member, resource)).toThrow(RouteAuthError);
      expect(() => assertFolderAccess(member, resource)).toThrow(RouteAuthError);
    }
  });

  it("builds a scope from the signed-in user and their workspace role", async () => {
    requireMemberRole.mockResolvedValue("member");
    expect(await getVisibilityScope(session, "ws-1")).toEqual({ userId: "user-1", role: "member" });

    requireMemberRole.mockResolvedValue("admin");
    expect(await getVisibilityScope(session, "ws-1")).toEqual({ userId: "user-1", role: "admin" });
  });
});
