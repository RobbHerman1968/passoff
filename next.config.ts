import type { NextConfig } from "next";

import { appSecurityHeaders, privateLinkHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // Baseline for every page and route. Later entries override earlier ones.
      {
        source: "/:path*",
        headers: appSecurityHeaders(),
      },
      // Private links carry a secret in the address. Never send it on as a referrer.
      ...["/r/:path*", "/invite/:path*", "/reset-password/:path*"].map((source) => ({
        source,
        headers: privateLinkHeaders(),
      })),
      {
        // The local SDK test harness embeds pages in frames on purpose. It does not
        // exist in production builds.
        source: "/dev/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      {
        source: "/sdk/v1/:path*",
        headers: [
          {
            key: "Cache-Control",
            // These filenames are stable rather than content-hashed. Browsers must
            // revalidate them so a deployment can publish an SDK fix immediately.
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
