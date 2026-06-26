import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
    : ["localhost", "127.0.0.1", "0.0.0.0"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
