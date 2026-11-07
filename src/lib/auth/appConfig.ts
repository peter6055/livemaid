import { getExistingAuthSecret } from "./secrets";

export function areOidcCredentialsConfigured(): boolean {
  return !!(
    getExistingAuthSecret() &&
    process.env.AUTH_OIDC_ISSUER &&
    process.env.AUTH_OIDC_CLIENT_ID &&
    process.env.AUTH_OIDC_CLIENT_SECRET
  );
}

export async function isAuthEnabled(): Promise<boolean> {
  return areOidcCredentialsConfigured();
}
