import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Film,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  Image as ImageIcon,
  X,
} from "lucide-react";

import { HomeWorkflow } from "@/components/home-workflow";
import { ReviewPreview } from "@/components/review-preview";
import { SectionIntro } from "@/components/section-intro";
import { SiteCta } from "@/components/site-cta";
import { Button } from "@/components/ui/button";
import { absoluteUrl, authRoutes, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Website & Video Feedback Without the Mess",
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: `Passoff — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: "/",
    type: "website",
  },
};

const trustPoints = [
  "One review link",
  "No client account required",
  "Free for every client reviewer",
] as const;

const differentiators = [
  {
    icon: MonitorSmartphone,
    title: "The real website, not a flattened copy",
    body: "Clients review the page you built—including staged and signed-in experiences—while your team keeps the context needed to act.",
    href: "/website-feedback-tool",
    linkLabel: "Website review",
  },
  {
    icon: Film,
    title: "One rhythm for websites and video",
    body: "A page location or a video timestamp changes the context, not the client experience. Share, comment, reply, and review again.",
    href: "/video-review-software",
    linkLabel: "Video review",
  },
  {
    icon: BadgeCheck,
    title: "A yes attached to the work",
    body: "Approval lives with the round the client reviewed, instead of buried in a meeting or a chat thread.",
    href: "/client-approval-software",
    linkLabel: "Client approval",
  },
] as const;

const scatteredFeedback = [
  { icon: Mail, source: "Email", note: "“Can we change the button?”", placement: "sm:-rotate-2" },
  { icon: ImageIcon, source: "Screenshot", note: "“This is the version I meant.”", placement: "sm:ml-10 sm:rotate-1" },
  { icon: MessageSquare, source: "Chat", note: "“Looks approved to me.”", placement: "sm:ml-4 sm:-rotate-1" },
] as const;

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
        logo: absoluteUrl("/brand/passoff-mark.svg"),
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
        publisher: { "@id": `${siteConfig.url}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: siteConfig.name,
        url: siteConfig.url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: siteConfig.description,
        featureList: [
          "On-page website feedback",
          "Short video as issue evidence",
          "Guest review links",
          "Approvals tied to a recorded version",
        ],
      },
    ],
  };
}

export default function Home() {
  return (
    <main id="main-content" className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }} />

      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />
        <div className="site-shell relative pb-16 pt-16 sm:pt-20 lg:pb-20 lg:pt-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-medium ring-1 ring-foreground/10 elevation-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              Website review with issue evidence
            </p>
            <h1 className="display-title mx-auto mt-6">
              Turn client feedback into a clear, recorded approval.
            </h1>
            <p className="section-lead mx-auto mt-6 max-w-2xl">
              Comments stay pinned to the page or moment they’re about, so your workspace can resolve each issue without chasing screenshots, messages, or mystery versions.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 min-[380px]:flex-row">
              <Button asChild size="lg" className="px-6 elevation-md">
                <Link href={authRoutes.signUp}>
                  Start your first review <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-6">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {trustPoints.map((point) => (
                <li key={point} className="inline-flex items-center gap-2">
                  <Check aria-hidden="true" className="size-4 text-success" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto mt-14 max-w-6xl lg:mt-20">
            <div
              aria-hidden="true"
              className="absolute -inset-x-6 -inset-y-6 -z-10 rounded-[2rem] bg-[radial-gradient(50%_50%_at_50%_50%,var(--brand-glow),transparent_70%)] blur-2xl"
            />
            <ReviewPreview stage="reply" compact className="lg:hidden" />
            <ReviewPreview stage="reply" className="hidden lg:block" />
          </div>
        </div>
      </section>

      <section aria-labelledby="problem-heading" className="bg-surface">
        <div className="site-shell section-space-major">
          <SectionIntro
            align="center"
            kicker="Why feedback gets messy"
            titleId="problem-heading"
            title="The work is in one place. The feedback rarely is."
          >
            A screenshot, a message, and an approving nod can all point at different versions. Passoff turns those fragments into one trail attached to the work.
          </SectionIntro>
          <div className="mx-auto mt-14 grid max-w-5xl items-stretch gap-6 lg:grid-cols-2">
            <article className="flex flex-col rounded-2xl border border-dashed border-input/60 p-6 sm:p-8">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <X aria-hidden="true" className="size-4" />
                Without Passoff
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em]">Feedback without context</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">The team has to piece together what the client meant.</p>
              <ul className="mt-6 grid gap-3">
                {scatteredFeedback.map(({ icon: Icon, source, note, placement }) => (
                  <li
                    key={source}
                    className={cn(
                      "flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10 elevation-sm",
                      placement,
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{source}</span>
                    <span className="min-w-0 text-muted-foreground">{note}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="flex flex-col rounded-2xl bg-card p-6 ring-2 ring-primary elevation-lg sm:p-8">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                <Check aria-hidden="true" className="size-4" />
                With Passoff
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em]">One review with a trail</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">The place, conversation, round, and next step stay together.</p>
              <div className="mt-6 flex flex-1 flex-col rounded-xl bg-muted/60 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Homepage · Hero button</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">Round 2</p>
                  </div>
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-status-resolved px-2.5 py-1 text-xs font-medium text-status-resolved-foreground">
                    <Check aria-hidden="true" className="size-3.5" />
                    Ready for another look
                  </p>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
                  <div><dt className="text-muted-foreground">Location</dt><dd className="mt-1 font-medium">Button</dd></div>
                  <div><dt className="text-muted-foreground">Conversation</dt><dd className="mt-1 font-medium">2 replies</dd></div>
                  <div><dt className="text-muted-foreground">Next step</dt><dd className="mt-1 font-medium">Client review</dd></div>
                </dl>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="workflow-heading" className="scroll-mt-20">
        <div className="site-shell section-space-major">
          <SectionIntro
            kicker="How it works"
            titleId="workflow-heading"
            title="One review. Three moves."
          >
            Share the work, resolve feedback in context, and keep approval with the round the client actually reviewed. Pick a step to see it.
          </SectionIntro>
          <HomeWorkflow />
        </div>
      </section>

      <section aria-labelledby="difference-heading" className="bg-brand-dark text-brand-dark-foreground">
        <div className="site-shell section-space-major">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-brand-dark-accent">Why Passoff</p>
            <h2 id="difference-heading" className="mt-3 text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.03em] sm:text-4xl">
              Built around the work clients actually review.
            </h2>
            <p className="mt-4 text-pretty text-lg leading-8 text-brand-dark-muted">
              Every detail is there to make feedback actionable and approval dependable.
            </p>
          </div>
          <ul className="mt-14 grid gap-5 md:grid-cols-3">
            {differentiators.map(({ icon: Icon, title, body, href, linkLabel }) => (
              <li
                key={title}
                className="flex flex-col rounded-2xl bg-brand-dark-surface p-6 ring-1 ring-brand-dark-border sm:p-7"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-brand-dark-muted">{body}</p>
                <Link
                  href={href}
                  className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-brand-dark-accent underline-offset-4 hover:underline"
                >
                  {linkLabel} <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SiteCta
        kicker="Ready for a cleaner handoff?"
        title="Give the next review one clear path to yes."
        body="Share the work, keep the conversation in context, and record approval on the version your client saw."
      />
    </main>
  );
}
