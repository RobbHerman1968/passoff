import type { Metadata } from "next";

import { PricingPage } from "@/components/pricing-page";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing for Website Review",
  description:
    "Simple Passoff pricing for website review with unlimited client reviewers, unlimited issues and comments, and short video evidence attached to issues.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Passoff pricing — every client reviews free",
    description:
      "Choose a plan for your workspace and invite as many client reviewers as the work needs.",
    url: "/pricing",
    type: "website",
  },
};

function pricingJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    url: absoluteUrl("/pricing"),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Studio annual", price: "348", priceCurrency: "USD" },
      { "@type": "Offer", name: "Studio monthly", price: "35", priceCurrency: "USD" },
      { "@type": "Offer", name: "Agency annual", price: "1068", priceCurrency: "USD" },
      { "@type": "Offer", name: "Agency monthly", price: "109", priceCurrency: "USD" },
    ],
  };
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd()) }}
      />
      <PricingPage />
    </>
  );
}
