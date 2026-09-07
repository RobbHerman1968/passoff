import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Lock, Shield } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { MarketingFooter } from "@/components/seo/marketing-shell";
import { ProductProofSection } from "@/components/seo/product-proof";
import { SiteHeader } from "@/components/site-header";
import { getSiteUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pass-Off Approval Rooms — Get client sign-off on the exact design revision",
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  alternates: { canonical: "/" },
  openGraph: {
    title: `${siteConfig.productName} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: "/",
    type: "website",
  },
};

const steps = [
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

const audiences = [
  {
    title: "Freelancers",
    body: "Close projects with a clear yes on the right revision—not a vague Slack thread.",
  },
  {
    title: "Studios",
    body: "Keep client review, approval, and file delivery in one branded approval room.",
  },
  {
    title: "Agencies",
    body: "Track what each client approved so handoff stays auditable across projects.",
  },
] as const;

function jsonLd() {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: siteConfig.name,
        url,
        description: siteConfig.description,
        logo: `${url}/brand/passoff-mark.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: siteConfig.productName,
        url,
        description: siteConfig.description,
        publisher: { "@id": `${url}/#organization` },
        inLanguage: "en-US",
      },
      {
        "@type": "WebPage",
        "@id": `${url}/#webpage`,
        url,
        name: `${siteConfig.productName} — ${siteConfig.tagline}`,
        description: siteConfig.description,
        isPartOf: { "@id": `${url}/#website` },
        about: { "@id": `${url}/#software` },
        primaryImageOfPage: `${url}/brand/passoff-mark.png`,
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}/#software`,
        name: siteConfig.productName,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Client design approval and handoff",
        operatingSystem: "Web",
        url,
        description: siteConfig.description,
        featureList: steps.map((step) => step.title),
        offers: [
          {
            "@type": "Offer",
            name: "Trial",
            price: "0",
            priceCurrency: "USD",
          },
          {
            "@type": "Offer",
            name: "Solo",
            price: "19",
            priceCurrency: "USD",
          },
        ],
        publisher: { "@id": `${url}/#organization` },
      },
      {
        "@type": "HowTo",
        "@id": `${url}/#howto`,
        name: "How Pass-Off Approval Rooms work",
        description: siteConfig.description,
        step: steps.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: step.title,
          text: step.description,
          url: `${url}/#how-it-works`,
        })),
      },
    ],
  };
}

function ApprovalRoomPreview() {
  return (
    <div
      aria-hidden="true"
      className="passoff-rise passoff-rise-delay-3 relative mx-auto mt-12 w-full max-w-xl lg:mx-0 lg:mt-0 lg:max-w-none"
    >
      <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)] bg-[var(--brand-surface)] shadow-[0_28px_80px_rgba(46,38,84,0.28)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-glow)]">
              Approval room
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[var(--brand-soft)]">
              Harbor & Co. Website
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--brand)_28%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
            Revision 2
          </span>
        </div>

        <div className="grid gap-0 sm:grid-cols-[1.15fr_0.85fr]">
          <div className="relative aspect-[4/3] bg-[linear-gradient(160deg,#2a2340_0%,#1a1625_55%,#12101a_100%)] p-4 sm:aspect-auto sm:min-h-[280px]">
            <div className="absolute inset-4 rounded-xl border border-white/10 bg-[color-mix(in_srgb,var(--brand-deep)_55%,#0f0d14)] p-3">
              <div className="h-2 w-24 rounded-full bg-white/20" />
              <div className="mt-4 space-y-2">
                <div className="h-2 w-full rounded-full bg-white/12" />
                <div className="h-2 w-[82%] rounded-full bg-white/10" />
                <div className="h-2 w-[64%] rounded-full bg-white/8" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="aspect-square rounded-lg bg-[var(--brand)]/35" />
                <div className="aspect-square rounded-lg bg-white/8" />
                <div className="aspect-square rounded-lg bg-white/8" />
              </div>
              <div className="absolute left-[38%] top-[42%] size-3 rounded-full border-2 border-white bg-[var(--brand)] shadow-[0_0_0_4px_rgba(124,108,240,0.35)]" />
            </div>
          </div>

          <div className="border-t border-white/10 p-4 sm:border-l sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Client feedback
            </p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-white/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-white/80">Alex · Client</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Soften the hero headline on mobile?
                </p>
              </div>
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--brand-soft)]">
                  <Check className="size-3.5" />
                  Approved · Revision 2
                </div>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Receipt bound to this frozen revision digest.
                </p>
              </div>
            </div>
            <div className="mt-4 flex h-9 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-semibold text-white">
              Release handoff
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <SiteHeader />
      <main className="overflow-x-hidden bg-[#f5f2ff] text-[var(--brand-deep)]">
        <section className="passoff-atmosphere relative overflow-hidden pt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden lg:block"
          >
            <div className="absolute -right-24 top-24 size-[420px] rounded-full bg-[color-mix(in_srgb,var(--brand-glow)_22%,transparent)] blur-3xl" />
            <div className="absolute bottom-10 right-[18%] size-40 rounded-full bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] blur-2xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-4 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-12 lg:py-20">
            <div className="passoff-rise min-w-0 max-w-xl">
              <div className="flex items-center gap-3.5 sm:gap-4">
                <BrandMark size={52} />
                <p className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                  Pass-Off
                </p>
              </div>
              <h1 className="passoff-rise passoff-rise-delay-1 mt-8 font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.12] tracking-[-0.035em] text-[color-mix(in_srgb,var(--brand-deep)_88%,transparent)] sm:text-3xl lg:text-[2.15rem]">
                {siteConfig.tagline}
              </h1>
              <p className="passoff-rise passoff-rise-delay-2 mt-5 max-w-lg text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)] sm:text-lg sm:leading-8">
                {siteConfig.description}
              </p>
              <div className="passoff-rise passoff-rise-delay-3 mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-surface)] px-5 text-sm font-semibold text-[var(--brand-soft)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-deep)]"
                >
                  Start Free Trial
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#product-proof"
                  className="inline-flex h-12 items-center rounded-xl px-4 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                >
                  See the Closeout Loop
                </a>
              </div>
            </div>

            <ApprovalRoomPreview />
          </div>
        </section>

        <ProductProofSection />

        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
              How it works
            </p>
            <h2
              id="how-heading"
              className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
            >
              One review link from revision to handoff.
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((step) => (
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

        <section
          aria-labelledby="revision-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:py-20">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
                Immutable revisions
              </p>
              <h2
                id="revision-heading"
                className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
              >
                Approval is tied to a frozen revision—not a moving target.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
                When a client signs off, Pass-Off records the decision against that exact revision.
                Later edits become a new revision, so you never lose track of what was approved.
              </p>
            </div>
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/70 px-5 py-6">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" aria-hidden />
                <div>
                  <p className="font-semibold tracking-[-0.02em]">Revision digest on record</p>
                  <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_62%,transparent)]">
                    Hierarchy stays clear: Workspace → Approval room → Revision → Review link →
                    Handoff.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="audience-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff]"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <h2
              id="audience-heading"
              className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
            >
              Built for freelancers, studios, and agencies.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
              First release focuses on a single workspace owner running client approval rooms—no
              promised team features that are not shipping yet.
            </p>
            <ul className="mt-10 grid gap-8 sm:grid-cols-3">
              {audiences.map((item) => (
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

        <section
          aria-labelledby="trust-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]"
        >
          <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 lg:py-20">
            <Shield className="mx-auto size-6 text-[var(--brand)]" aria-hidden />
            <h2
              id="trust-heading"
              className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
            >
              Private rooms. Hashed review links. Clear records.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
              Approval rooms are limited to people with the review link. Tokens are stored hashed,
              and approval decisions stay attached to an immutable revision digest.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="explore-heading"
          className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff]"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <h2
              id="explore-heading"
              className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em]"
            >
              Explore solutions and resources
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
              Deep dives for design approval, client review links, Figma sign-off, website approval,
              and agency workflows—plus practical checklists and templates.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <li>
                <Link href="/solutions" className="font-semibold text-[var(--brand-ink)] hover:underline">
                  Solutions hub
                </Link>
              </li>
              <li>
                <Link
                  href="/design-approval-software"
                  className="font-semibold text-[var(--brand-ink)] hover:underline"
                >
                  Design approval software
                </Link>
              </li>
              <li>
                <Link
                  href="/client-approval-software"
                  className="font-semibold text-[var(--brand-ink)] hover:underline"
                >
                  Client approval software
                </Link>
              </li>
              <li>
                <Link href="/resources" className="font-semibold text-[var(--brand-ink)] hover:underline">
                  Resources hub
                </Link>
              </li>
              <li>
                <Link
                  href="/resources/design-approval-checklist"
                  className="font-semibold text-[var(--brand-ink)] hover:underline"
                >
                  Design approval checklist
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="font-semibold text-[var(--brand-ink)] hover:underline">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
        </section>

        <section className="bg-[var(--brand-surface)] text-[var(--brand-soft)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:py-20">
            <div className="max-w-xl">
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Start a free trial.
              </h2>
              <p className="mt-4 text-base leading-7 text-white/55">
                Open your first approval room and send a review link in minutes.
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
