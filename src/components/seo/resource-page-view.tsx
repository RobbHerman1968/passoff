import Link from "next/link";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { CopyableBlock } from "@/components/seo/copyable-block";
import { CtaBand, PrimaryCtaLink } from "@/components/seo/cta";
import { MarketingShell } from "@/components/seo/marketing-shell";
import { JsonLd, RelatedContent } from "@/components/seo/sections";
import {
  articleJsonLd,
  breadcrumbListJsonLd,
  webPageJsonLd,
} from "@/lib/seo/types";
import type { ResourcePageContent, ResourceSection } from "@/lib/seo/types";

function formatDisplayDate(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function ResourceSectionBlock({ section }: { section: ResourceSection }) {
  if (section.kind === "prose") {
    return (
      <section id={section.id} className="scroll-mt-24">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
          {section.title}
        </h2>
        <div className="mt-4 space-y-4 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_70%,transparent)]">
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>
      </section>
    );
  }

  if (section.kind === "checklist") {
    return (
      <section id={section.id} className="scroll-mt-24 print:break-inside-avoid">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
          {section.title}
        </h2>
        {section.intro ? (
          <p className="mt-3 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
            {section.intro}
          </p>
        ) : null}
        <ul className="mt-6 space-y-4">
          {section.items.map((item) => (
            <li
              key={item.label}
              className="rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/80 px-4 py-4"
            >
              <p className="font-semibold tracking-[-0.02em]">{item.label}</p>
              <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (section.kind === "template") {
    return (
      <section id={section.id} className="scroll-mt-24 print:break-inside-avoid">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
          {section.title}
        </h2>
        {section.intro ? (
          <p className="mt-3 mb-5 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
            {section.intro}
          </p>
        ) : (
          <div className="mb-5" />
        )}
        <CopyableBlock label={section.copyLabel} body={section.body} />
      </section>
    );
  }

  return (
    <section id={section.id} className="scroll-mt-24">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
        {section.title}
      </h2>
      {section.intro ? (
        <p className="mt-3 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
          {section.intro}
        </p>
      ) : null}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
            Useful
          </h3>
          <ul className="mt-4 space-y-4">
            {section.useful.map((item) => (
              <li
                key={item.title}
                className="rounded-xl border border-[color-mix(in_srgb,var(--brand)_28%,transparent)] bg-[color-mix(in_srgb,var(--brand)_6%,white)] px-4 py-4"
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_70%,transparent)]">
                  “{item.example}”
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--brand-deep)_45%,transparent)]">
            Unhelpful
          </h3>
          <ul className="mt-4 space-y-4">
            {section.unhelpful.map((item) => (
              <li
                key={item.title}
                className="rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/70 px-4 py-4"
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_60%,transparent)]">
                  “{item.example}”
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function ResourcePageView({ page }: { page: ResourcePageContent }) {
  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Resources", href: "/resources" },
    { name: page.h1, href: page.path },
  ];

  const showToc = page.sections.length >= 4;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      webPageJsonLd({
        path: page.path,
        name: page.title,
        description: page.description,
      }),
      breadcrumbListJsonLd(breadcrumbs),
      articleJsonLd({
        path: page.path,
        headline: page.h1,
        description: page.description,
        datePublished: page.publishedAt,
        dateModified: page.updatedAt,
        authorName: page.author.name,
      }),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <MarketingShell className="resource-print">
        <article>
          <header className="passoff-atmosphere border-b border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] pt-16">
            <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 lg:py-16">
              <Breadcrumbs
                items={[
                  { name: "Home", href: "/" },
                  { name: "Resources", href: "/resources" },
                  { name: page.primaryIntent, href: page.path },
                ]}
              />
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                Resource
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.12] tracking-[-0.04em] sm:text-4xl">
                {page.h1}
              </h1>
              <p className="mt-5 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)] sm:text-lg sm:leading-8">
                {page.lead}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[color-mix(in_srgb,var(--brand-deep)_55%,transparent)]">
                <p>
                  By {page.author.name}
                  <span className="text-[color-mix(in_srgb,var(--brand-deep)_35%,transparent)]">
                    {" "}
                    · {page.author.role}
                  </span>
                </p>
                <p>
                  {page.updatedAt !== page.publishedAt ? "Updated" : "Published"}{" "}
                  <time dateTime={page.updatedAt}>{formatDisplayDate(page.updatedAt)}</time>
                </p>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
                <PrimaryCtaLink
                  path={page.path}
                  placement="hero"
                  intent={page.primaryIntent}
                  pageType="resource"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-surface)] px-4 text-sm font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)]"
                />
                <Link
                  href={page.commercialLink.href}
                  className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                >
                  {page.commercialLink.label}
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
            {showToc ? (
              <aside className="print:hidden lg:sticky lg:top-24 lg:self-start">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                  On this page
                </p>
                <nav aria-label="Table of contents" className="mt-4">
                  <ol className="space-y-2 text-sm">
                    {page.sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)] hover:text-[var(--brand-ink)] hover:underline"
                        >
                          {section.title}
                        </a>
                      </li>
                    ))}
                    <li>
                      <a
                        href="#passoff-bridge"
                        className="text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)] hover:text-[var(--brand-ink)] hover:underline"
                      >
                        {page.passOffBridge.heading}
                      </a>
                    </li>
                  </ol>
                </nav>
              </aside>
            ) : (
              <div className="hidden lg:block" />
            )}

            <div className="mx-auto w-full max-w-3xl space-y-14 lg:mx-0">
              {page.sections.map((section) => (
                <ResourceSectionBlock key={section.id} section={section} />
              ))}

              <section
                id="passoff-bridge"
                className="scroll-mt-24 rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-[#faf8ff] px-5 py-6"
              >
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
                  {page.passOffBridge.heading}
                </h2>
                <p className="mt-4 text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
                  {page.passOffBridge.body}
                </p>
                <div className="mt-5 print:hidden">
                  <PrimaryCtaLink path={page.path} placement="inline" />
                </div>
              </section>
            </div>
          </div>
        </article>

        <RelatedContent
          heading="Continue Reading"
          links={[
            {
              href: page.commercialLink.href,
              label: page.commercialLink.label,
              description: "Related Pass-Off solution page.",
            },
            ...page.relatedResources.map((link) => ({
              ...link,
              description: "Related resource",
            })),
          ]}
        />

        <CtaBand
          path={page.path}
          heading="Start a free trial."
          body="Put these templates to work in a live approval room."
          secondary={{ href: page.commercialLink.href, label: page.commercialLink.label }}
        />
      </MarketingShell>
    </>
  );
}
