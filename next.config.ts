import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: ["100.118.120.*"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
