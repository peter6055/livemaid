import type { NextConfig } from "next";

const DEV_ORIGINS_DEFAULTS = [
  "*.tail1f8d1a.ts.net",
  "devenv-ubuntu-a.tail1f8d1a.ts.net",
  "127.0.0.1",
  "localhost",
  "0.0.0.0",
];

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
    : DEV_ORIGINS_DEFAULTS,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
