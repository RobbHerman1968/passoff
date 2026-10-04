import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SectionIntro } from "@/components/section-intro";
import { SiteCta } from "@/components/site-cta";
import { comparisonPages } from "@/lib/comparisons";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Compare Website and Video Feedback Tools",
  description:
    "Compare Passoff with Pastel, Marker.io, and Frame.io. Find the right fit for website feedback, video review, client approval, or professional media work.",
  alternates: { canonical: "/alternatives" },
  openGraph: {
    title: "Compare Feedback and Approval Tools | Passoff",
    description:
      "Plain-English comparisons for choosing a website feedback, video review, or client approval tool.",
    url: "/alternatives",
    type: "website",
  },
};

function jsonLd() {
  const url = absoluteUrl("/alternatives");
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#webpage`,
    url,
    name: "Compare website and video feedback tools",
    description:
      "Plain-English comparisons for choosing a website feedback, video review, or client approval tool.",
    isPartOf: { "@id": `${siteConfig.url}/#website` },
    hasPart: comparisonPages.map((page) => ({
      "@type": "WebPage",
      name: page.title,
      url: absoluteUrl(`/compare/${page.slug}`),
    })),
  };
}

export default function AlternativesPage() {
  return (
    <main id="main-content" className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }} />

      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[32rem]" />
        <div className="site-shell section-space relative">
          <div className="section-intro">
            <div className="section-intro-heading lg:col-span-5">
              <p className="eyebrow">A useful little compass</p>
              <h1 className="display-title">Compare feedback tools without the checkbox confetti.</h1>
            </div>
            <p className="section-lead section-intro-copy">
              Every tool is good at something. These plain-English comparisons show where Passoff fits, where another tool goes further, and which choice is less likely to make your team grumble later.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="comparisons-heading" className="site-shell section-space">
        <SectionIntro
          kicker="Pick the closest match"
          titleId="comparisons-heading"
          title="Three honest head-to-heads."
        >
          Start with the tool already on your shortlist. We checked each comparison against the company’s own public product pages.
        </SectionIntro>
        <div className="mt-10 grid gap-5">
          {comparisonPages.map((page) => (
            <article
              key={page.slug}
              className="group relative grid gap-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 transition-shadow duration-[var(--motion-duration)] outline-ring has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 hover:elevation-md sm:p-8 lg:grid-cols-12 lg:gap-10"
            >
              <div className="lg:col-span-4">
                <h3 className="text-xl font-semibold tracking-[-0.02em]">
                  <Link
                    href={`/compare/${page.slug}`}
                    className="outline-none after:absolute after:inset-0 after:rounded-2xl"
                  >
                    Passoff vs {page.competitor}
                  </Link>
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">What kind of work leads the way?</p>
                <p className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">
                  Read the fair comparison
                  <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-[var(--motion-duration)] group-hover:translate-x-0.5" />
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
                <div className="rounded-xl bg-muted/60 p-5">
                  <p className="font-semibold">Choose Passoff for</p>
                  <p className="mt-2 leading-7 text-muted-foreground">{page.bestFor.passoff}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-5">
                  <p className="font-semibold">Choose {page.competitor} for</p>
                  <p className="mt-2 leading-7 text-muted-foreground">{page.bestFor.competitor}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="method-heading" className="bg-surface">
        <div className="site-shell section-space">
          <SectionIntro
            kicker="How we compare"
            titleId="method-heading"
            title="Fair first. Useful always."
          >
            <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
              {[
                "Competitor details come from official public pages.",
                "Every page shows when its facts were last checked.",
                "We say when another tool is the better fit.",
                "We skip star ratings, mystery scores, and made-up winners.",
              ].map((item) => (
                <li key={item} className="border-t border-border pt-4 leading-7">
                  {item}
                </li>
              ))}
            </ul>
          </SectionIntro>
        </div>
      </section>

      <SiteCta
        kicker="Still leaning toward the clean pass?"
        title="Try the tool on real work. It is a better test than any comparison page."
      />
    </main>
  );
}
