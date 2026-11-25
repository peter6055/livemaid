import { NextResponse } from "next/server";
import { auth, isAuthEnabled, AuthorizationError, requireMemberRole } from "@/lib/auth";
import type { Session } from "@/lib/auth";

export class RouteAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "RouteAuthError";
  }
}

export async function getSessionOrNull(): Promise<Session | null> {
  if (!(await isAuthEnabled())) return null;
  try {
    return await auth();
  } catch {
    return null;
  }
}

export type RequiredSession = Session & { user: { id: string } };

export async function getRequiredSession(): Promise<RequiredSession> {
  const session = await getSessionOrNull();
  if (!session?.user?.id) {
    throw new RouteAuthError("Unauthorized", 401);
  }

  return session as RequiredSession;
}

export function getUserWorkspaceId(session: RequiredSession): string | undefined {
  return session.user.workspaceId;
}

// Visibility rule. Every diagram/folder records who created it (`createdBy`); ownership is never
// rewritten, so a record keeps its creator when the app switches between standalone and workspace
// mode. Members only see what they created themselves — living in the same workspace is not enough.
export interface VisibilityScope {
  userId: string;
  role: "admin" | "member";
}

export async function getVisibilityScope(
  session: RequiredSession,
  workspaceId: string,
): Promise<VisibilityScope> {
  const role = await requireMemberRole(session.user.id, workspaceId);
  return { userId: session.user.id, role };
}

// - Standalone mode: callers skip this filter, so the single local user sees everything.
// - Every role: their own records (`createdBy` matches).
// - Admin, additionally: records with no creator — created before accounts existed or while the app
//   ran in standalone mode. Another member's records stay private even from an admin.
export function canAccessResource(
  scope: VisibilityScope,
  resource: { createdBy?: string },
): boolean {
  if (resource.createdBy === scope.userId) return true;
  return scope.role === "admin" && !resource.createdBy;
}

export function filterVisibleResources<T extends { createdBy?: string }>(
  resources: T[],
  scope: VisibilityScope,
): T[] {
  return resources.filter((resource) => canAccessResource(scope, resource));
}

function assertResourceAccess(
  scope: VisibilityScope,
  resource: { createdBy?: string },
  message: string,
): void {
  if (!canAccessResource(scope, resource)) throw new RouteAuthError(message, 404);
}

export function assertDiagramAccess(scope: VisibilityScope, diagram: { createdBy?: string }): void {
  assertResourceAccess(scope, diagram, "Diagram not found");
}

export function assertFolderAccess(scope: VisibilityScope, folder: { createdBy?: string }): void {
  assertResourceAccess(scope, folder, "Folder not found");
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof RouteAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
