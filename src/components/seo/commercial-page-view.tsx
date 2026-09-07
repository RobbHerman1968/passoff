import Link from "next/link";
import { Lock } from "lucide-react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { CtaBand, PrimaryCtaLink } from "@/components/seo/cta";
import { MarketingShell } from "@/components/seo/marketing-shell";
import { ProductPreview } from "@/components/seo/product-preview";
import { FaqSection, JsonLd, RelatedContent } from "@/components/seo/sections";
import {
  absoluteUrl,
  breadcrumbListJsonLd,
  softwareApplicationJsonLd,
  webPageJsonLd,
} from "@/lib/seo/types";
import type { CommercialPageContent } from "@/lib/seo/types";
import { getSiteUrl, siteConfig } from "@/lib/site";

const workflowSteps = [
  {
    number: "01",
    title: "Publish a revision",
    description:
      "Upload the designs for this round into an approval room. Each revision is frozen so feedback and approval stay attached to that exact set of files.",
  },
  {
    number: "02",
    title: "Collect feedback and approval",
    description:
      "Share one review link. Clients leave visual comments, request changes, or record approval—without another account.",
  },
  {
    number: "03",
    title: "Release the handoff",
    description:
      "After sign-off, deliver final files from the same room. Everyone can see what was approved and what was released.",
  },
] as const;

export function CommercialPageView({ page }: { page: CommercialPageContent }) {
  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Solutions", href: "/solutions" },
    { name: page.h1, href: page.path },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      webPageJsonLd({
        path: page.path,
        name: page.title,
        description: page.description,
      }),
      breadcrumbListJsonLd(breadcrumbs),
      softwareApplicationJsonLd({
        path: page.path,
        name: siteConfig.productName,
        description: page.description,
        featureList: workflowSteps.map((step) => step.title),
      }),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <MarketingShell>
        <section className="passoff-atmosphere relative overflow-hidden border-b border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] pt-16">
          <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-12 lg:py-16">
            <div className="min-w-0">
              <Breadcrumbs
                items={[
                  { name: "Home", href: "/" },
                  { name: "Solutions", href: "/solutions" },
                  { name: page.primaryIntent, href: page.path },
                ]}
              />
              <h1 className="mt-6 max-w-xl font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.12] tracking-[-0.04em] sm:text-4xl lg:text-[2.35rem]">
                {page.h1}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)] sm:text-lg sm:leading-8">
                {page.heroLead}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PrimaryCtaLink
                  path={page.path}
                  placement="hero"
                  intent={page.primaryIntent}
                  pageType="commercial"
                />
                <Link
                  href={page.secondaryCta.href}
                  className="inline-flex h-12 items-center rounded-xl px-4 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                >
                  {page.secondaryCta.label}
                </Link>
              </div>
            </div>
            <ProductPreview variant={page.previewVariant} alt={page.previewAlt} />
          </div>
        </section>

        <section
          aria-labelledby="problem-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff]"
        >
          <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-20">
            <h2
              id="problem-heading"
              className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
            >
              {page.problemHeading}
            </h2>
            <p className="mt-5 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
              {page.problemBody}
            </p>
          </div>
        </section>

        <section aria-labelledby="example-heading">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
              Example workflow
            </p>
            <h2
              id="example-heading"
              className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em]"
            >
              {page.exampleHeading}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
              {page.exampleBody}
            </p>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {page.exampleSteps.map((step, index) => (
                <li key={step.title} className="min-w-0">
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.08em] text-[var(--brand)]">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                    {step.detail}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="workflow-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff]"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
              Three-step workflow
            </p>
            <h2
              id="workflow-heading"
              className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em]"
            >
              Publish, approve, hand off.
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {workflowSteps.map((step) => (
                <li key={step.number} className="min-w-0">
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.08em] text-[var(--brand)]">
                    {step.number}
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="revision-heading">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:py-20">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
                Revision-specific approval
              </p>
              <h2
                id="revision-heading"
                className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em]"
              >
                {page.revisionHeading}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
                {page.revisionBody}
              </p>
              {page.workflowNote ? (
                <p className="mt-4 max-w-xl rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/70 px-4 py-3 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                  {page.workflowNote}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/70 px-5 py-6">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" aria-hidden />
                <div>
                  <p className="font-semibold tracking-[-0.02em]">Immutable revision digest</p>
                  <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_62%,transparent)]">
                    Workspace → Approval room → Revision → Review link → Handoff. Approval attaches to
                    the published revision, not a moving chat thread.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="usecases-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff]"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <h2
              id="usecases-heading"
              className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em]"
            >
              {page.useCasesHeading}
            </h2>
            <ul className="mt-10 grid gap-8 sm:grid-cols-3">
              {page.useCases.map((item) => (
                <li key={item.title} className="min-w-0">
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-[-0.03em]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="compare-heading">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <h2
              id="compare-heading"
              className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em]"
            >
              {page.comparisonHeading}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
              {page.comparisonIntro}
            </p>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Comparison of informal approval versus Pass-Off for {page.primaryIntent}
                </caption>
                <thead>
                  <tr className="border-b border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)]">
                    <th scope="col" className="py-3 pr-4 font-semibold">
                      Criterion
                    </th>
                    <th scope="col" className="py-3 pr-4 font-semibold">
                      Informal (email, chat, comments)
                    </th>
                    <th scope="col" className="py-3 font-semibold">
                      Pass-Off
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.comparisonRows.map((row) => (
                    <tr
                      key={row.criterion}
                      className="border-b border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] align-top"
                    >
                      <th scope="row" className="py-4 pr-4 font-semibold">
                        {row.criterion}
                      </th>
                      <td className="py-4 pr-4 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                        {row.informal}
                      </td>
                      <td className="py-4 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                        {row.passOff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff] print:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="max-w-xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
              Ready to record approval on an exact revision?
            </p>
            <PrimaryCtaLink path={page.path} placement="mid" />
          </div>
        </section>

        <RelatedContent
          heading="Helpful resources"
          links={page.resourceLinks}
        />

        <FaqSection items={page.faq} />

        <RelatedContent
          heading="Related solutions"
          links={[
            ...page.relatedCommercial,
            { href: "/solutions", label: "All solutions", description: "Browse the full solutions hub." },
            { href: "/pricing", label: "Pricing", description: "Trial and Solo plans available now." },
          ]}
        />

        <CtaBand
          path={page.path}
          heading="Start a free trial."
          body="Open your first approval room and send a review link in minutes."
          secondary={page.secondaryCta}
        />
      </MarketingShell>
      {/* Keep absolute URL available for debugging canonical origin in server output */}
      <span className="hidden" data-canonical={absoluteUrl(page.path)} data-site={getSiteUrl()} />
    </>
  );
}
