import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: [
    "*.tail1f8d1a.ts.net",
    "devenv-ubuntu-a.tail1f8d1a.ts.net",
    "172.23.86.34",
    "127.0.0.1",
    "localhost",
    "0.0.0.0",
    "100.118.120.*",
    "100.104.12.35",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
