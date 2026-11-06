"use server";

import { validateOidcDiscovery, generateAuthSecret } from "@/lib/auth/setup";
import { setAuthEnabled } from "@/lib/auth/appConfig";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";

export interface OidcSetupResult {
  ok: boolean;
  wroteFile?: boolean;
  env?: {
    AUTH_SECRET: string;
    AUTH_OIDC_ISSUER: string;
    AUTH_OIDC_CLIENT_ID: string;
    AUTH_OIDC_CLIENT_SECRET: string;
  };
  composeSnippet?: string;
  error?: string;
}

function escapeEnvValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

function buildComposeSnippet(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `      - ${key}=${value}`)
    .join("\n");
}

async function setSetupCookie(result: OidcSetupResult) {
  const cookieStore = await cookies();
  cookieStore.set("livemaid_setup_result", JSON.stringify(result), {
    httpOnly: true,
    maxAge: 10,
    path: "/admin/setup",
    sameSite: "strict",
  });
}

export async function submitOidcSetup(formData: FormData): Promise<void> {
  const issuer = String(formData.get("issuer") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();

  if (!issuer || !clientId || !clientSecret) {
    await setSetupCookie({ ok: false, error: "Issuer, Client ID, and Client Secret are required" });
    redirect("/admin/setup");
  }

  const normalizedIssuer = issuer.replace(/\/$/, "");

  const discovery = await validateOidcDiscovery(normalizedIssuer);
  if (!discovery.ok) {
    await setSetupCookie({ ok: false, error: discovery.error });
    redirect("/admin/setup");
  }

  const authSecret = process.env.AUTH_SECRET || generateAuthSecret();
  const env = {
    AUTH_SECRET: authSecret,
    AUTH_OIDC_ISSUER: normalizedIssuer,
    AUTH_OIDC_CLIENT_ID: clientId,
    AUTH_OIDC_CLIENT_SECRET: clientSecret,
  };

  const envPath = path.join(process.cwd(), ".env");
  let wroteFile = false;
  try {
    let existing = "";
    try {
      existing = await fs.readFile(envPath, "utf-8");
    } catch {
      // .env may not exist yet
    }

    const lines = existing.split("\n");
    const updated = new Map<string, string>();
    for (const line of lines) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) {
        updated.set(match[1], match[2]);
      }
    }

    for (const [key, value] of Object.entries(env)) {
      updated.set(key, `"${escapeEnvValue(value)}"`);
    }

    const newContent = Array.from(updated.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    await fs.writeFile(envPath, newContent + "\n", "utf-8");
    wroteFile = true;
  } catch {
    wroteFile = false;
  }

  // Apply the credentials to the running process so auth becomes effective
  // immediately without requiring a server restart.
  process.env.AUTH_SECRET = env.AUTH_SECRET;
  process.env.AUTH_OIDC_ISSUER = env.AUTH_OIDC_ISSUER;
  process.env.AUTH_OIDC_CLIENT_ID = env.AUTH_OIDC_CLIENT_ID;
  process.env.AUTH_OIDC_CLIENT_SECRET = env.AUTH_OIDC_CLIENT_SECRET;

  const result: OidcSetupResult = wroteFile
    ? { ok: true, wroteFile: true, env }
    : { ok: true, wroteFile: false, env, composeSnippet: buildComposeSnippet(env) };

  await setSetupCookie(result);

  // Enable auth automatically once credentials are present so the toggle takes
  // effect immediately.
  await setAuthEnabled(true);

  redirect("/admin/setup");
}
