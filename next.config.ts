import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
