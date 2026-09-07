import type { Metadata } from "next";

import { getSiteUrl, siteConfig } from "@/lib/site";

export type SeoLink = {
  href: string;
  label: string;
  description?: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type BreadcrumbItem = {
  name: string;
  href: string;
};

export type CommercialPageId =
  | "design-approval-software"
  | "client-approval-software"
  | "figma-design-approval"
  | "website-design-approval"
  | "approval-workflow-for-agencies";

export type ResourcePageId =
  | "design-approval-checklist"
  | "client-sign-off-template"
  | "design-feedback-checklist"
  | "design-approval-email-template"
  | "website-handoff-checklist";

export type ProductPreviewVariant =
  | "approval-room"
  | "client-link"
  | "figma-export"
  | "website-screens"
  | "agency-handoff";

export type CommercialPageContent = {
  id: CommercialPageId;
  path: `/${CommercialPageId}`;
  primaryIntent: string;
  title: string;
  description: string;
  h1: string;
  heroLead: string;
  problemHeading: string;
  problemBody: string;
  exampleHeading: string;
  exampleBody: string;
  exampleSteps: readonly { title: string; detail: string }[];
  previewVariant: ProductPreviewVariant;
  previewAlt: string;
  revisionHeading: string;
  revisionBody: string;
  workflowNote?: string;
  useCasesHeading: string;
  useCases: readonly { title: string; body: string }[];
  comparisonHeading: string;
  comparisonIntro: string;
  comparisonRows: readonly {
    criterion: string;
    informal: string;
    passOff: string;
  }[];
  secondaryCta: SeoLink;
  resourceLinks: readonly SeoLink[];
  relatedCommercial: readonly SeoLink[];
  faq: readonly FaqItem[];
  keywords: readonly string[];
};

export type ResourceSection =
  | {
      id: string;
      title: string;
      kind: "prose";
      paragraphs: readonly string[];
    }
  | {
      id: string;
      title: string;
      kind: "checklist";
      intro?: string;
      items: readonly { label: string; detail: string }[];
    }
  | {
      id: string;
      title: string;
      kind: "template";
      intro?: string;
      copyLabel: string;
      body: string;
    }
  | {
      id: string;
      title: string;
      kind: "examples";
      intro?: string;
      useful: readonly { title: string; example: string }[];
      unhelpful: readonly { title: string; example: string }[];
    };

export type ResourcePageContent = {
  id: ResourcePageId;
  path: `/resources/${ResourcePageId}`;
  primaryIntent: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  publishedAt: string; // ISO date YYYY-MM-DD
  updatedAt: string;
  author: { name: string; role: string };
  commercialLink: SeoLink;
  relatedResources: readonly SeoLink[];
  passOffBridge: { heading: string; body: string };
  sections: readonly ResourceSection[];
  keywords: readonly string[];
};

export function absoluteUrl(path: string) {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
}): Metadata {
  const url = absoluteUrl(input.path);
  return {
    title: {
      absolute: input.title,
    },
    description: input.description,
    keywords: [...(input.keywords ?? siteConfig.keywords)],
    alternates: { canonical: input.path },
    openGraph: {
      title: input.title,
      description: input.description,
      url: input.path,
      type: "website",
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
    robots: { index: true, follow: true },
    other: {
      "og:url": url,
    },
  };
}

export function softwareApplicationJsonLd(input: {
  path: string;
  name: string;
  description: string;
  featureList: readonly string[];
}) {
  const url = getSiteUrl();
  return {
    "@type": "SoftwareApplication",
    "@id": `${absoluteUrl(input.path)}#software`,
    name: input.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Client design approval and handoff",
    operatingSystem: "Web",
    url: absoluteUrl(input.path),
    description: input.description,
    featureList: [...input.featureList],
    offers: [
      {
        "@type": "Offer",
        name: "Trial",
        price: "0",
        priceCurrency: "USD",
        description: "14-day free trial of Pass-Off Approval Rooms",
      },
      {
        "@type": "Offer",
        name: "Solo",
        price: "19",
        priceCurrency: "USD",
        description: "Solo plan at $19 per month",
      },
    ],
    publisher: {
      "@type": "Organization",
      "@id": `${url}/#organization`,
      name: siteConfig.name,
      url,
    },
  };
}

export function breadcrumbListJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export function articleJsonLd(input: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
}) {
  const url = getSiteUrl();
  return {
    "@type": "Article",
    "@id": `${absoluteUrl(input.path)}#article`,
    headline: input.headline,
    description: input.description,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: {
      "@type": "Person",
      name: input.authorName,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${url}/#organization`,
      name: siteConfig.name,
      url,
      logo: {
        "@type": "ImageObject",
        url: `${url}/brand/passoff-mark.png`,
      },
    },
    mainEntityOfPage: absoluteUrl(input.path),
    inLanguage: "en-US",
  };
}

export function webPageJsonLd(input: {
  path: string;
  name: string;
  description: string;
}) {
  const url = getSiteUrl();
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(input.path)}#webpage`,
    url: absoluteUrl(input.path),
    name: input.name,
    description: input.description,
    isPartOf: { "@id": `${url}/#website` },
    inLanguage: "en-US",
  };
}
