import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Keep the workspace root here (avoids picking up ~/package-lock.json)
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "figma-alpha-api.s3.us-west-2.amazonaws.com" },
      { protocol: "https", hostname: "s3-alpha-sig.figma.com" },
      { protocol: "https", hostname: "s3-alpha.figma.com" },
    ],
  },
  experimental: {
    // Plugin imports send frame PNGs + REST JSON; batches can exceed the 10MB default.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
