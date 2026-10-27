import { NextResponse } from "next/server";
import { auth, isAuthEnabled, AuthorizationError } from "@/lib/auth";
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
  if (!isAuthEnabled()) return null;
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

export function assertDiagramAccess(
  _userId: string,
  workspaceId: string,
  diagram: { workspaceId?: string },
): void {
  if (diagram.workspaceId !== workspaceId) {
    throw new RouteAuthError("Diagram not found", 404);
  }
}

export function assertFolderAccess(
  _userId: string,
  workspaceId: string,
  folder: { workspaceId?: string },
): void {
  if (folder.workspaceId !== workspaceId) {
    throw new RouteAuthError("Folder not found", 404);
  }
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
