function bytesToBase64(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin);
}

export function generateAuthSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

export async function validateOidcDiscovery(
  issuer: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  } catch {
    return { ok: false, error: "Invalid issuer URL" };
  }

  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { ok: false, error: `Discovery endpoint returned ${res.status}` };
    }
    const data = await res.json();
    if (
      typeof data.authorization_endpoint !== "string" ||
      typeof data.token_endpoint !== "string" ||
      typeof data.userinfo_endpoint !== "string"
    ) {
      return { ok: false, error: "Discovery document is missing required OIDC endpoints" };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to fetch discovery document",
    };
  }
}
