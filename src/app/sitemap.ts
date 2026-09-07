import type { MetadataRoute } from "next";

import { getSeoPageInventory } from "@/lib/seo/inventory";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();

  const core: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/pricing`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/support`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const seoPages: MetadataRoute.Sitemap = getSeoPageInventory().map((page) => ({
    url: `${base}${page.url}`,
    lastModified,
    changeFrequency: page.pageType === "hub" ? "weekly" : "monthly",
    priority: page.pageType === "hub" ? 0.85 : page.pageType === "commercial" ? 0.8 : 0.7,
  }));

  return [...core, ...seoPages];
}
