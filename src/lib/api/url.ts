declare global {
  interface Window {
    __APP_BASE__?: string;
  }
}

/**
 * Prefix a path with the public base URL (`BASE_URL`), which includes any
 * reverse-proxy prefix, e.g. `https://example.com/livemaid` + `/api/x`.
 *
 * The client reads the value injected by the root layout; the server reads the
 * runtime env var. With `BASE_URL` unset paths stay root-relative (local dev).
 */
export function appUrl(path: string): string {
  const base =
    typeof window !== "undefined"
      ? (window.__APP_BASE__ ?? "")
      : (process.env.BASE_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}
