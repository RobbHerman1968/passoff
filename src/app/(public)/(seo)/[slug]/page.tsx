import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronRight } from "lucide-react";

import { ReviewPreview } from "@/components/review-preview";
import { SectionIntro } from "@/components/section-intro";
import { SiteCta } from "@/components/site-cta";
import { Button } from "@/components/ui/button";
import { getSeoPage, seoPages } from "@/lib/seo-pages";
import { absoluteUrl, authRoutes, siteConfig } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return seoPages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoPage(slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `/${page.slug}`,
      type: "website",
    },
  };
}

function pageJsonLd(page: NonNullable<ReturnType<typeof getSeoPage>>) {
  const url = absoluteUrl(`/${page.slug}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        isPartOf: { "@id": `${siteConfig.url}/#website` },
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
          { "@type": "ListItem", position: 2, name: page.eyebrow, item: url },
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

function SeoHeroActions() {
  return (
    <div className="mt-8 flex flex-col gap-3 min-[380px]:flex-row">
      <Button asChild size="lg" className="px-6 elevation-md">
        <Link href={authRoutes.signUp}>
          Start a review <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="px-6">
        <Link href="#how-it-works">How it works</Link>
      </Button>
    </div>
  );
}

export default async function SeoContentPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getSeoPage(slug);
  if (!page) notFound();

  const related = seoPages.filter((item) => item.slug !== page.slug).slice(0, 3);
  const previewKind = page.slug === "video-review-software" ? "video" : "website";
  const showPreview = page.slug === "website-feedback-tool" || page.slug === "video-review-software";

  return (
    <main id="main-content" className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }} />

      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[32rem]" />
        <div className="site-shell section-space relative">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/" className="min-h-11 py-3 underline-offset-4 hover:text-foreground hover:underline">Home</Link>
            <ChevronRight aria-hidden="true" className="size-4" />
            <span aria-current="page">{page.eyebrow}</span>
          </nav>
          <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-12">
            {showPreview ? (
              <>
                <div className="lg:col-span-5">
                  <p className="eyebrow">{page.eyebrow}</p>
                  <h1 className="display-title mt-3">{page.h1}</h1>
                  <p className="section-lead mt-5">{page.lead}</p>
                  <SeoHeroActions />
                </div>
                <div className="min-w-0 lg:col-span-7">
                  <ReviewPreview kind={previewKind} />
                  <p className="mt-4 leading-7 text-muted-foreground">{page.note}</p>
                </div>
              </>
            ) : (
              <>
                <div className="lg:col-span-5">
                  <p className="eyebrow">{page.eyebrow}</p>
                  <h1 className="display-title mt-3">{page.h1}</h1>
                </div>
                <div className="lg:col-span-7">
                  <p className="section-lead">{page.lead}</p>
                  <p className="mt-5 leading-7 text-muted-foreground">{page.note}</p>
                  <SeoHeroActions />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="problem-heading" className="site-shell section-space">
        <SectionIntro
          kicker={page.problem.eyebrow}
          titleId="problem-heading"
          title={page.problem.title}
        >
          {page.problem.body}
        </SectionIntro>
        <div className="mt-8">
          {page.problem.points.map((point, index) => (
            <article key={point.title} className="grid gap-2 border-t border-border py-5 md:grid-cols-12 md:gap-10">
              <p className="font-mono text-sm text-muted-foreground md:col-span-2">0{index + 1}</p>
              <div className="md:col-span-10 lg:col-span-9">
                <h3 className="text-xl font-semibold tracking-[-0.02em]">{point.title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">{point.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="steps-heading" className="scroll-mt-20 bg-surface">
        <div className="site-shell section-space">
          <SectionIntro
            align="center"
            kicker="Four small steps"
            titleId="steps-heading"
            title="A review flow people can follow on the first try."
          />
          <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {page.steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10 elevation-sm">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary font-mono text-sm font-medium text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="payoff-heading" className="site-shell section-space">
        <div className="section-intro">
          <div className="section-intro-heading">
            <p className="eyebrow">What gets better</p>
            <h2 id="payoff-heading" className="section-title">{page.payoff.title}</h2>
            <p className="section-lead mt-4">{page.payoff.body}</p>
          </div>
          <ul className="section-intro-copy grid gap-3">
            {page.payoff.items.map((item) => (
              <li key={item} className="flex gap-3 rounded-xl bg-card p-4 leading-7 ring-1 ring-foreground/10">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-status-resolved text-status-resolved-foreground">
                  <Check aria-hidden="true" className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="bg-surface">
        <div className="site-shell section-space">
          <SectionIntro
            kicker="A few fair questions"
            titleId="faq-heading"
            title="The useful bits, without the fine-print fog."
          />
          <div className="mt-8 grid gap-x-16 lg:grid-cols-2">
            {page.faq.map((item) => (
              <article key={item.question} className="border-t border-border py-4">
                <h3 className="text-lg font-semibold">{item.question}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="related-heading" className="site-shell section-space">
        <h2 id="related-heading" className="section-title">Keep poking around.</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {related.map((item) => (
            <Link
              key={item.slug}
              href={`/${item.slug}`}
              className="group flex flex-col rounded-2xl bg-card p-6 ring-1 ring-foreground/10 transition-shadow duration-[var(--motion-duration)] hover:elevation-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <p className="font-semibold">{item.eyebrow}</p>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
              <span className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">
                Explore <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-[var(--motion-duration)] group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <SiteCta
        kicker="One link. One clear next step."
        title="Ready to make the next review a little less wiggly?"
      />
    </main>
  );
}
