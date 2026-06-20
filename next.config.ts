import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: ["100.118.120.*", "100.104.12.35"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
