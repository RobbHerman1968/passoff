import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { MarketingFooter } from "@/components/seo/marketing-shell";
import { SiteHeader } from "@/components/site-header";
import { publicPricingPlans } from "@/lib/pricing";
import { getSiteUrl, siteConfig } from "@/lib/site";

import { PricingPlans } from "./pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pass-Off Approval Rooms pricing: free Trial and Solo ($19/mo). Studio and Agency coming later. Clients and reviewers stay free.",
  keywords: [
    ...siteConfig.keywords,
    "Pass-Off pricing",
    "approval room pricing",
    "client design approval pricing",
  ],
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pass-Off pricing — Trial and Solo",
    description:
      "Workspace pricing for Pass-Off Approval Rooms. Trial and Solo available now; Studio and Agency coming later.",
    url: "/pricing",
    type: "website",
  },
};

function jsonLd() {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}/pricing#webpage`,
        url: `${url}/pricing`,
        name: "Pass-Off pricing",
        description:
          "Pass-Off Approval Rooms pricing for Trial and Solo. Studio and Agency coming later.",
        isPartOf: { "@id": `${url}/#website` },
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}/#software`,
        name: siteConfig.productName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url,
        offers: publicPricingPlans
          .filter((plan) => plan.purchasable)
          .map((plan) => ({
            "@type": "Offer",
            name: plan.name,
            price: String(plan.price.monthly ?? 0),
            priceCurrency: "USD",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: String(plan.price.monthly ?? 0),
              priceCurrency: "USD",
              billingDuration: "P1M",
            },
          })),
      },
    ],
  };
}

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <SiteHeader />
      <main className="bg-[#f5f2ff] text-[var(--brand-deep)]">
        <section className="passoff-atmosphere relative overflow-hidden border-b border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] pt-16">
          <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="passoff-rise max-w-2xl">
              <div className="flex items-center gap-3.5">
                <BrandMark size={44} />
                <p className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                  Pass-Off
                </p>
              </div>
              <h1 className="passoff-rise passoff-rise-delay-1 mt-8 font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.12] tracking-[-0.035em] text-[color-mix(in_srgb,var(--brand-deep)_88%,transparent)] sm:text-3xl">
                Simple workspace pricing for Approval Rooms.
              </h1>
              <p className="passoff-rise passoff-rise-delay-2 mt-5 max-w-xl text-lg leading-8 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
                Start with a free trial, then Solo at $19/mo. Studio and Agency are listed for
                later—clients and reviewers stay free.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="plans-heading" className="bg-[#faf8ff]">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
              Plans
            </p>
            <h2
              id="plans-heading"
              className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
            >
              Trial and Solo available now
            </h2>
            <div className="mt-10">
              <PricingPlans />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="pricing-explore-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]"
        >
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <h2
              id="pricing-explore-heading"
              className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]"
            >
              Learn how Approval Rooms work
            </h2>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
              <li>
                <Link href="/solutions" className="text-[var(--brand-ink)] hover:underline">
                  Solutions
                </Link>
              </li>
              <li>
                <Link
                  href="/design-approval-software"
                  className="text-[var(--brand-ink)] hover:underline"
                >
                  Design approval software
                </Link>
              </li>
              <li>
                <Link
                  href="/client-approval-software"
                  className="text-[var(--brand-ink)] hover:underline"
                >
                  Client approval software
                </Link>
              </li>
              <li>
                <Link href="/resources" className="text-[var(--brand-ink)] hover:underline">
                  Resources
                </Link>
              </li>
              <li>
                <Link
                  href="/resources/design-approval-checklist"
                  className="text-[var(--brand-ink)] hover:underline"
                >
                  Approval checklist
                </Link>
              </li>
            </ul>
          </div>
        </section>

        <section className="bg-[var(--brand-surface)] text-[var(--brand-soft)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:py-20">
            <div className="max-w-xl">
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Start with a 14-day trial.
              </h2>
              <p className="mt-4 text-base leading-7 text-white/55">
                Run live approval rooms on the full product, then choose Solo when you are ready.
              </p>
            </div>
            <Link
              href="/login?mode=signup"
              className="inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--brand-strong)]"
            >
              Start Free Trial
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </>
  );
}
