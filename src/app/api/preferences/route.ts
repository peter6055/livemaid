import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { isAuthEnabled } from "@/lib/auth";
import { getSessionOrNull, handleRouteError, RouteAuthError } from "@/lib/auth/routeAuth";
import { PREFERENCE_DEFAULTS, sanitizePreferences } from "@/lib/preferences/core";
import {
  preferencesStorageConfigured,
  readPreferences,
  resolvePreferenceOwner,
  writePreferences,
} from "@/lib/preferences/store";

// Reads the session and the database on every request.
export const dynamic = "force-dynamic";

async function requireOwner(): Promise<string> {
  if (!(await isAuthEnabled())) return resolvePreferenceOwner(null);
  const session = await getSessionOrNull();
  if (!session?.user?.id) throw new RouteAuthError("Unauthorized", 401);
  return resolvePreferenceOwner(session.user.id);
}

function requireStorage(): void {
  if (!preferencesStorageConfigured()) {
    throw new RouteAuthError("MongoDB is required to store user preferences", 503);
  }
}

export async function GET() {
  try {
    // Demo mode is read-only and has no database; defaults keep the settings UI functional.
    if (isDemoMode()) {
      return NextResponse.json({ preferences: PREFERENCE_DEFAULTS, stored: false });
    }
    requireStorage();
    const ownerId = await requireOwner();
    return NextResponse.json(await readPreferences(ownerId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ error: "Read-only in demo mode" }, { status: 403 });
    }
    requireStorage();
    const ownerId = await requireOwner();

    const patch = sanitizePreferences(await request.json().catch(() => null));
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid preference fields" }, { status: 400 });
    }

    const preferences = await writePreferences(ownerId, patch);
    return NextResponse.json({ preferences, stored: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
