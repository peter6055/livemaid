import { NextResponse } from "next/server";
import { auth, isAuthEnabled } from "@/lib/auth";
import {
  areOidcCredentialsConfigured,
  getAppConfigDoc,
  setAuthEnabled,
} from "@/lib/auth/appConfig";

export async function GET() {
  const appConfig = await getAppConfigDoc();
  return NextResponse.json({
    authFlagEnabled: appConfig.authEnabled,
    oidcConfigured: areOidcCredentialsConfigured(),
  });
}

export async function POST(request: Request) {
  let body: { enabled?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const enabled = body.enabled === true;
  const currentlyEnabled = await isAuthEnabled();
  let userId: string | undefined;

  if (currentlyEnabled) {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;
  }

  await setAuthEnabled(enabled, userId);

  const authEnabled = await isAuthEnabled();
  const oidcConfigured =
    !!process.env.AUTH_SECRET &&
    !!process.env.AUTH_OIDC_ISSUER &&
    !!process.env.AUTH_OIDC_CLIENT_ID &&
    !!process.env.AUTH_OIDC_CLIENT_SECRET;

  return NextResponse.json({ ok: true, authEnabled, oidcConfigured });
}
