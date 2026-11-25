import { appUrl } from "./url";

declare global {
  interface Window {
    __appRedirecting?: boolean;
  }
}

/**
 * Fetch wrapper for LiveMaid API routes, applying the session policy once:
 * - 401: no valid session (expired or cleared) → ask the user to sign in again.
 * - 403: signed in, but the token does not grant this workspace → restricted page.
 * - anything else: returned to the caller untouched.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (typeof window === "undefined") return response;

  if (response.status === 401) {
    redirectTo("/login?reason=expired");
  } else if (response.status === 403) {
    redirectTo("/restricted");
  }
  return response;
}

// A provider on the destination page (e.g. PreferencesProvider on /login) can itself get a 401 and
// land here again; navigating to the page we are already on would reload it forever. Concurrent
// failures (several requests expiring at once) also produce one navigation, not one each.
function redirectTo(path: string): void {
  if (window.__appRedirecting) return;
  const target = appUrl(path);
  if (new URL(target, window.location.href).pathname === window.location.pathname) return;
  window.__appRedirecting = true;
  window.location.assign(target);
}
