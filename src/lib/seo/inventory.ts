import { commercialPageList } from "@/lib/seo/commercial";
import { resourcePageList } from "@/lib/seo/resources";

export const SEO_PRIMARY_CTA = {
  label: "Start free trial" as const,
  href: "/login?mode=signup",
};

export const hubPages = [
  {
    path: "/solutions",
    title: "Solutions — Pass-Off Approval Rooms",
    description:
      "Explore Pass-Off solutions for design approval, client review links, Figma sign-off, website approval, and agency workflows.",
    primaryIntent: "Pass-Off solutions hub",
    h1: "Solutions for revision-specific design approval",
    pageType: "hub" as const,
  },
  {
    path: "/resources",
    title: "Resources — Checklists and Templates | Pass-Off",
    description:
      "Practical Pass-Off resources: design approval checklists, client sign-off templates, feedback guides, email templates, and website handoff checklists.",
    primaryIntent: "Pass-Off resources hub",
    h1: "Checklists and templates for design approval",
    pageType: "hub" as const,
  },
] as const;

/** Flat inventory for sitemap, QA, and internal linking audits. */
export function getSeoPageInventory() {
  return [
    ...hubPages.map((page) => ({
      url: page.path,
      primaryIntent: page.primaryIntent,
      title: page.title,
      description: page.description,
      h1: page.h1,
      primaryCta: SEO_PRIMARY_CTA.label,
      pageType: page.pageType,
      internalLinks: [] as string[],
    })),
    ...commercialPageList.map((page) => ({
      url: page.path,
      primaryIntent: page.primaryIntent,
      title: page.title,
      description: page.description,
      h1: page.h1,
      primaryCta: SEO_PRIMARY_CTA.label,
      pageType: "commercial" as const,
      internalLinks: [
        page.secondaryCta.href,
        ...page.resourceLinks.map((l) => l.href),
        ...page.relatedCommercial.map((l) => l.href),
        "/solutions",
        "/resources",
        "/pricing",
      ],
    })),
    ...resourcePageList.map((page) => ({
      url: page.path,
      primaryIntent: page.primaryIntent,
      title: page.title,
      description: page.description,
      h1: page.h1,
      primaryCta: SEO_PRIMARY_CTA.label,
      pageType: "resource" as const,
      internalLinks: [
        page.commercialLink.href,
        ...page.relatedResources.map((l) => l.href),
        "/resources",
        "/solutions",
      ],
    })),
  ];
}
