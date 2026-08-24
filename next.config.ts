import path from "node:path";
import type { NextConfig } from "next";

// Next.js resolves `distDir` relative to the project root, so an absolute
// NEXT_TEST_DIST_DIR (as exported by the test-server scripts) must be
// normalized to a project-relative path or builds land under a bogus
// <root>/root/projects/livemaid/tmp/... tree inside the repository.
const requestedDistDir = process.env.NEXT_TEST_DIST_DIR;

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Use a unique distDir per test server so multiple Next.js dev servers can run
  // concurrently without conflicting on the same project directory.
  distDir: requestedDistDir
    ? path.relative(process.cwd(), path.resolve(requestedDistDir)) || ".next"
    : ".next",
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
    : [],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
