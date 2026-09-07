import Link from "next/link";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { CtaBand, PrimaryCtaLink } from "@/components/seo/cta";
import { MarketingShell } from "@/components/seo/marketing-shell";
import { JsonLd, RelatedContent } from "@/components/seo/sections";
import { commercialPageList } from "@/lib/seo/commercial";
import { hubPages } from "@/lib/seo/inventory";
import { resourcePageList } from "@/lib/seo/resources";
import {
  breadcrumbListJsonLd,
  buildPageMetadata,
  webPageJsonLd,
} from "@/lib/seo/types";

const hub = hubPages[1];

export const metadata = buildPageMetadata({
  title: hub.title,
  description: hub.description,
  path: hub.path,
  keywords: [
    "design approval checklist",
    "client sign-off template",
    "website handoff checklist",
    "Pass-Off resources",
  ],
});

export default function ResourcesHubPage() {
  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Resources", href: "/resources" },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            webPageJsonLd({
              path: hub.path,
              name: hub.title,
              description: hub.description,
            }),
            breadcrumbListJsonLd(breadcrumbs),
          ],
        }}
      />
      <MarketingShell>
        <section className="passoff-atmosphere border-b border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] pt-16">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
            <Breadcrumbs items={breadcrumbs} />
            <h1 className="mt-6 max-w-3xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl lg:text-5xl">
              {hub.h1}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
              Original checklists and copyable templates for revision readiness, client sign-off,
              actionable feedback, review emails, and website handoff—written to match how Pass-Off
              Approval Rooms actually work.
            </p>
            <div className="mt-8">
              <PrimaryCtaLink
                path="/resources"
                placement="hero"
                intent={hub.primaryIntent}
                pageType="hub"
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="resources-list-heading" className="bg-[#faf8ff]">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <h2
              id="resources-list-heading"
              className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
            >
              Checklists and templates
            </h2>
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {resourcePageList.map((page) => (
                <li key={page.path}>
                  <Link
                    href={page.path}
                    className="group block h-full rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/80 px-5 py-6 transition hover:border-[color-mix(in_srgb,var(--brand)_35%,transparent)]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                      {page.primaryIntent}
                    </p>
                    <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] group-hover:text-[var(--brand-ink)]">
                      {page.h1}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                      {page.lead}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <RelatedContent
          heading="Related solutions"
          links={commercialPageList.slice(0, 3).map((page) => ({
            href: page.path,
            label: page.h1,
            description: page.primaryIntent,
          }))}
        />

        <CtaBand
          path="/resources"
          heading="Start a free trial."
          body="Use these templates inside a live Pass-Off approval room."
          secondary={{ href: "/solutions", label: "Browse Solutions" }}
        />
      </MarketingShell>
    </>
  );
}
