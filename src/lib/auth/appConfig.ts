import { isDemoMode } from "@/lib/env";

function envTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function mongoUriConfigured(): boolean {
  return !!process.env.MONGODB_URI;
}

export function areOidcCredentialsConfigured(): boolean {
  return !!(
    process.env.AUTH_OIDC_ISSUER &&
    process.env.AUTH_OIDC_CLIENT_ID &&
    process.env.AUTH_OIDC_CLIENT_SECRET
  );
}

export function isAuthEnabled(): boolean {
  // Demo mode is read-only and never uses the user layer.
  if (isDemoMode()) return false;
  return (
    envTruthy(process.env.WORKSPACES_ENABLED) &&
    mongoUriConfigured() &&
    areOidcCredentialsConfigured()
  );
}
