import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, ExternalLink } from "lucide-react";

import { SectionIntro } from "@/components/section-intro";
import { Button } from "@/components/ui/button";
import { comparisonPages, getComparisonPage } from "@/lib/comparisons";
import { absoluteUrl, authRoutes, siteConfig } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return comparisonPages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparisonPage(slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.description,
    keywords: [
      `Passoff vs ${page.competitor}`,
      `${page.competitor} alternative`,
      "client feedback tool comparison",
      "review and approval software",
    ],
    alternates: { canonical: `/compare/${page.slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `/compare/${page.slug}`,
      type: "article",
    },
  };
}

function jsonLd(page: NonNullable<ReturnType<typeof getComparisonPage>>) {
  const url = absoluteUrl(`/compare/${page.slug}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: page.title,
        description: page.description,
        dateModified: "2026-10-03",
        datePublished: "2026-10-03",
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: siteConfig.name },
        publisher: { "@id": `${siteConfig.url}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
          { "@type": "ListItem", position: 2, name: "Compare", item: absoluteUrl("/alternatives") },
          { "@type": "ListItem", position: 3, name: `Passoff vs ${page.competitor}`, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

function ChoiceList({ heading, items }: { heading: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{heading}</h3>
      <ul className="mt-5 space-y-4">
        {items.map((item) => (
          <li key={item} className="border-t border-border pt-4 leading-7 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ComparisonPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getComparisonPage(slug);
  if (!page) notFound();

  return (
    <main id="main-content" className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(page)) }} />

      <section className="border-b border-border">
        <div className="site-shell section-space">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <Link href="/" className="min-h-11 py-3 underline-offset-4 hover:text-foreground hover:underline">Home</Link>
            <ChevronRight aria-hidden="true" className="size-4" />
            <Link href="/alternatives" className="min-h-11 py-3 underline-offset-4 hover:text-foreground hover:underline">Compare</Link>
            <ChevronRight aria-hidden="true" className="size-4" />
            <span aria-current="page">Passoff vs {page.competitor}</span>
          </nav>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Facts last checked {page.checkedOn}. Competitor details come from official public pages linked below.
          </p>
          <div className="section-intro mt-8">
            <div className="section-intro-heading">
              <p className="eyebrow">Passoff vs {page.competitor}</p>
              <h1 className="display-title">{page.h1}</h1>
            </div>
            <p className="section-lead section-intro-copy">{page.lead}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="short-answer-heading" className="site-shell section-space">
        <div className="section-intro">
          <div className="section-intro-heading">
            <p className="eyebrow">The short answer</p>
            <h2 id="short-answer-heading" className="section-title">Which tool should you choose?</h2>
          </div>
          <p className="section-intro-copy text-xl font-semibold leading-8 tracking-[-0.02em] sm:text-2xl sm:leading-9">
            {page.shortAnswer}
          </p>
        </div>
      </section>

      <section aria-labelledby="best-for-heading" className="border-y border-border bg-surface">
        <div className="site-shell section-space">
          <SectionIntro titleId="best-for-heading" title="The quick fit check." />
          <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-12">
            <article className="border-t border-border pt-5">
              <h3 className="font-semibold">Passoff is best for</h3>
              <p className="mt-3 text-lg leading-8">{page.bestFor.passoff}</p>
            </article>
            <article className="border-t border-border pt-5">
              <h3 className="font-semibold">{page.competitor} is best for</h3>
              <p className="mt-3 text-lg leading-8">{page.bestFor.competitor}</p>
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="comparison-heading" className="site-shell section-space">
        <SectionIntro
          kicker="Side by side"
          titleId="comparison-heading"
          title="The differences that actually change the work."
        />
        <dl className="mt-8 border-y border-border">
          {page.rows.map((row) => (
            <div key={row.topic} className="grid gap-4 border-b border-border py-5 last:border-0 md:grid-cols-12 md:gap-8">
              <dt className="font-semibold md:col-span-3">{row.topic}</dt>
              <dd className="md:col-span-4">
                <span className="text-sm font-medium">Passoff</span>
                <p className="mt-2 leading-7 text-muted-foreground">{row.passoff}</p>
              </dd>
              <dd className="md:col-span-5">
                <span className="text-sm font-medium text-muted-foreground">{page.competitor}</span>
                <p className="mt-2 leading-7 text-muted-foreground">{row.competitor}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="choice-heading" className="border-y border-border bg-surface">
        <div className="site-shell section-space">
          <SectionIntro
            kicker="Choose without the drumroll"
            titleId="choice-heading"
            title="Which one belongs in your toolkit?"
          />
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <ChoiceList heading="Choose Passoff if…" items={page.choosePassoff} />
            <ChoiceList heading={`Choose ${page.competitor} if…`} items={page.chooseCompetitor} />
          </div>
        </div>
      </section>

      <section aria-labelledby="verdict-heading" className="border-b border-border">
        <div className="site-shell section-space">
          <div className="section-intro lg:items-end">
            <div className="section-intro-heading">
              <p className="eyebrow">The no-fanfare verdict</p>
              <h2 id="verdict-heading" className="section-title">{page.verdict}</h2>
            </div>
            <div className="section-intro-copy">
              <p className="text-lg font-semibold">The best test is your own work.</p>
              <p className="mt-3 leading-7 text-muted-foreground">Open a review, invite one client, and see whether the clean pass fits your team.</p>
              <Button asChild size="lg" className="mt-4">
                <Link href={authRoutes.signUp}>Try Passoff <ArrowRight aria-hidden="true" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="site-shell section-space">
        <SectionIntro
          kicker="Questions worth asking"
          titleId="faq-heading"
          title="The bits people usually wonder next."
        />
        <div className="mt-8 grid gap-x-16 lg:grid-cols-2">
          {page.faq.map((item) => (
            <article key={item.question} className="border-t border-border py-4">
              <h3 className="text-lg font-semibold">{item.question}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="sources-heading" className="border-t border-border bg-surface">
        <div className="site-shell grid gap-6 py-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h2 id="sources-heading" className="text-lg font-semibold">How we checked the comparison</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">We reviewed the official pages on {page.checkedOn}. Products change, sometimes before the coffee gets cold, so confirm a must-have feature before buying.</p>
            <Link href="/alternatives" className="mt-5 inline-flex min-h-11 items-center gap-2 py-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">See all comparisons <ArrowRight aria-hidden="true" className="size-4" /></Link>
          </div>
          <ul className="flex flex-wrap content-start gap-3 lg:col-span-7 lg:justify-end">
            {page.sources.map((source) => (
              <li key={source.href}>
                <a href={source.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-border px-4 py-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  {source.label} <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
