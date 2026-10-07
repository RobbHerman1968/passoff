import type { MetadataRoute } from "next";

import { absoluteUrl, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/projects/",
        "/dev/",
        "/r/",
        "/invite/",
        "/reset-password/",
        "/settings/",
        "/notifications/",
        "/usability/",
        "/onboarding/",
        "/admin/",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteConfig.url,
  };
}
