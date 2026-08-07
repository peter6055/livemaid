import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Use a unique distDir per test server so multiple Next.js dev servers can run
  // concurrently without conflicting on the same project directory.
  distDir: process.env.NEXT_TEST_DIST_DIR || ".next",
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
    : [],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
