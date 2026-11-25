export async function register() {
  // Next.js compiles this file for the Edge runtime too. Keep Node-only work
  // behind the runtime check so the Edge bundle stays free of Node APIs.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export"
  )
    return;

  // BASE_URL is the full public site URL including any reverse-proxy prefix,
  // e.g. https://example.com/livemaid -> https://example.com/livemaid/api/auth.
  const baseUrl = (process.env.BASE_URL ?? "").replace(/\/$/, "");
  if (baseUrl) {
    process.env.AUTH_URL = `${baseUrl}/api/auth`;
  }
}
