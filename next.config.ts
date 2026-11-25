import path from "node:path";
import type { NextConfig } from "next";

// Next.js resolves `distDir` relative to the project root, so an absolute
// NEXT_TEST_DIST_DIR (as exported by the test-server scripts) must be
// normalized to a project-relative path or builds land in a nested
// `<root>/<root>/tmp/...` tree inside the repository.
const requestedDistDir = process.env.NEXT_TEST_DIST_DIR;

/** Pathname of BASE_URL, e.g. https://host/3434 -> /3434. Empty when unset/root. */
function basePathFromEnv(): string {
  const raw = (process.env.BASE_URL ?? "").trim();
  if (!raw) return "";
  try {
    const pathname = new URL(raw).pathname.replace(/\/$/, "");
    return pathname && pathname !== "/" ? pathname : "";
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Bake the reverse-proxy prefix into Next so /_next and app routes work when
  // the proxy forwards /<prefix>/... intact (no strip). Requires rebuild when
  // BASE_URL's path changes.
  basePath: basePathFromEnv(),
  // Use a unique distDir per test server so multiple Next.js dev servers can run
  // concurrently without conflicting on the same project directory.
  distDir: requestedDistDir
    ? path.relative(process.cwd(), path.resolve(requestedDistDir)) || ".next"
    : ".next",
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
    : [],
  experimental: {
    // The public origin comes from BASE_URL at runtime; server-action CSRF
    // checks trust the proxy via X-Forwarded-Host.
    serverActions: {
      allowedOrigins: process.env.ALLOWED_DEV_ORIGINS
        ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
        : undefined,
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
