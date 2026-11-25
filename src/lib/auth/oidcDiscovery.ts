/**
 * Auth.js fetches the OIDC discovery document on both the sign-in redirect and
 * the callback. This fetch caches just that document for 5 minutes, so a login
 * does one upstream discovery request instead of two (or one per attempt).
 * Every other provider request passes straight through untouched.
 */
const DISCOVERY_PATH = "/.well-known/openid-configuration";
const TTL_MS = 5 * 60 * 1000;

type CachedDiscovery = {
  text: string;
  status: number;
  contentType: string | null;
  fetchedAt: number;
};

const cache = new Map<string, CachedDiscovery>();

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export const cachedDiscoveryFetch: typeof fetch = async (input, init) => {
  const url = requestUrl(input);
  if (!url.includes(DISCOVERY_PATH)) {
    return fetch(input, init);
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return new Response(cached.text, {
      status: cached.status,
      headers: cached.contentType ? { "content-type": cached.contentType } : undefined,
    });
  }

  const response = await fetch(input, init);
  if (response.ok) {
    // Store text, not the Response: a body can only be consumed once.
    cache.set(url, {
      text: await response.clone().text(),
      status: response.status,
      contentType: response.headers.get("content-type"),
      fetchedAt: Date.now(),
    });
  }
  return response;
};
