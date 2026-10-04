"use client";

import Link from "next/link";
import * as React from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  FolderKanban,
  HardDrive,
  Minus,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";

import { SiteCta } from "@/components/site-cta";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PLAN_ENTITLEMENTS,
  ANNUAL_SAVINGS_USD,
  AGENCY_TRIAL_DAYS,
  formatDurationMinutes,
  formatUsd,
} from "@/lib/billing/plans";
import { authRoutes } from "@/lib/site";
import { cn } from "@/lib/utils";

function videoEvidenceCopy(plan: keyof typeof PLAN_ENTITLEMENTS) {
  const policy = PLAN_ENTITLEMENTS[plan].videoEvidence;
  if (policy.status !== "approved") {
    return "Video evidence limits are not published yet";
  }

  return `${formatDurationMinutes(policy.limits.newUploadMinutesPerCalendarMonth)} new video / month · ${formatDurationMinutes(policy.limits.retainedMinutes)} retained`;
}

const plans = [
  {
    name: "Free",
    description: "For trying the full review rhythm on real work.",
    annualPrice: "$0",
    monthlyPrice: "$0",
    annualCadence: "Free for as long as you need it",
    monthlyCadence: "Free for as long as you need it",
    members: `${PLAN_ENTITLEMENTS.free.workspaceMembers} workspace member`,
    projects: "1 active review website",
    storage: videoEvidenceCopy("free"),
    action: "Start free",
    featured: false,
    features: [
      "Website reviews on a recorded version",
      "Approvals tied to a recorded deployment",
      "Password-protected review links",
      "Markdown and CSV exports",
    ],
  },
  {
    name: "Studio",
    description: "For independent studios and small client teams.",
    annualPrice: "$29",
    monthlyPrice: "$35",
    annualCadence: "per month, billed $348 yearly",
    monthlyCadence: "per month, billed monthly",
    members: `${PLAN_ENTITLEMENTS.studio.workspaceMembers} workspace members`,
    projects: `${PLAN_ENTITLEMENTS.studio.activeReviewWebsites} active review websites`,
    storage: videoEvidenceCopy("studio"),
    action: "Try Studio free",
    featured: false,
    features: [
      "Everything in Free",
      "Private workspace replies",
      "Assignments, labels, and mentions",
      "Issue deadlines and reminders",
    ],
  },
  {
    name: "Agency",
    description: "For agencies running several client reviews at once.",
    annualPrice: "$89",
    monthlyPrice: "$109",
    annualCadence: "per month, billed $1,068 yearly",
    monthlyCadence: "per month, billed monthly",
    members: `${PLAN_ENTITLEMENTS.agency.workspaceMembers} workspace members`,
    projects: "Unlimited active review websites",
    storage: videoEvidenceCopy("agency"),
    action: "Try Agency free",
    featured: true,
    features: [
      "Everything in Studio",
      "Your logo on shared reviews",
      "Signed webhook handoff",
      "Priority help when work gets stuck",
      "Short video evidence attached to issues",
    ],
  },
] as const;

const planLimitRows = [
  { label: "Workspace members", key: "members" },
  { label: "Active review websites", key: "projects" },
  { label: "Video evidence", key: "storage" },
] as const;

const planFeatureRows = plans.flatMap((plan, fromPlan) =>
  plan.features
    .filter((feature) => !feature.startsWith("Everything in"))
    .map((feature) => ({ feature, fromPlan })),
);

const sharedFeatures = [
  "Unlimited client reviewers",
  "Unlimited issues and comments",
  "Unlimited reviewer playback",
  "Website review on a recorded version",
  "Approvals tied to a recorded deployment or version",
  "Short videos as issue evidence, not a separate review type",
  "No automatic video overage charges",
] as const;

const faqs = [
  {
    question: "Does every client need a paid seat?",
    answer:
      "No. Client reviewers are always free and unlimited. You only pay for the workspace members who create projects, manage issues, and prepare work for verification.",
  },
  {
    question: "What is an active review website?",
    answer:
      "An active review website is a live website environment that can receive review. Archive completed work whenever you like; comments, decisions, and version-specific approvals stay available.",
  },
  {
    question: "Does unlimited active review websites mean unlimited usage?",
    answer:
      "No. Unlimited active review websites does not mean unlimited infrastructure usage. New and retained video evidence still follows the Agency allowance. Reviewer playback is unlimited, and Passoff does not add automatic video overage charges.",
  },
  {
    question: "What happens after the free trial?",
    answer:
      `Your ${AGENCY_TRIAL_DAYS}-day Agency trial does not require a card. If you do not choose a paid plan, your workspace moves to Free and your work stays safe. We will show you what to archive if you are over a Free limit.`,
  },
  {
    question: "How does video evidence work?",
    answer:
      "Video is short evidence attached to an issue, not a separate video-review project. Each clip can be up to 3 minutes, 250 MB, and 1080p. Your plan sets how many new minutes the workspace can upload each month and how many minutes can remain available at once. Playback for reviewers is unlimited, and there are no automatic video overage charges.",
  },
  {
    question: "When is video evidence removed?",
    answer:
      "Video stays available while its issue is active, as long as the workspace remains within its retained-video allowance. After the issue is closed, Passoff keeps the video for 30 days. The written issue history remains after the video expires.",
  },
  {
    question: "Can I change or cancel my plan?",
    answer:
      "Yes. You can change plans as your workload changes. Cancel before your next renewal and you will keep paid access through the end of the billing period.",
  },
] as const;

function BillingCadence({ cadence, onDark = false }: { cadence: string; onDark?: boolean }) {
  const [lead, billingDetail] = cadence.split(", ");

  if (!billingDetail) {
    return cadence;
  }

  return (
    <>
      {lead},{" "}
      <strong className={cn("font-semibold", onDark ? "text-white" : "text-foreground")}>
        {billingDetail}
      </strong>
    </>
  );
}

export function PricingPage() {
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">("annual");

  return (
    <main id="main-content" className="flex-1">
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[32rem]" />
        <div className="site-shell relative pb-12 pt-16 text-center sm:pt-20 lg:pb-16 lg:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-medium ring-1 ring-foreground/10 elevation-sm">
            <Clock3 aria-hidden="true" className="size-4 text-primary" />
            {AGENCY_TRIAL_DAYS} days on Agency, free
          </p>
          <h1 className="display-title mx-auto mt-6 max-w-4xl">
            Your workspace pays. Every client reviews free.
          </h1>
          <p className="section-lead mx-auto mt-6 max-w-2xl">
            Review real websites, attach short video evidence to issues, and invite every client
            without counting guest seats.
          </p>
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["No card required", "Then Free if you do not upgrade", "Cancel anytime"].map((point) => (
              <li key={point} className="inline-flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-success" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="plans-heading" className="bg-surface">
        <div className="site-shell section-space">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="eyebrow">Plans</p>
              <h2 id="plans-heading" className="section-title mt-2">
                Start small. Move up when the client work does.
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
              <fieldset>
                <legend className="sr-only">Billing schedule</legend>
                <div className="inline-flex rounded-xl border border-border bg-card p-1 elevation-sm">
                  <Button
                    type="button"
                    size="sm"
                    variant={billingCycle === "monthly" ? "default" : "ghost"}
                    aria-pressed={billingCycle === "monthly"}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    Monthly
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={billingCycle === "annual" ? "default" : "ghost"}
                    aria-pressed={billingCycle === "annual"}
                    onClick={() => setBillingCycle("annual")}
                  >
                    Annual
                  </Button>
                </div>
              </fieldset>
              <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-right">
                {billingCycle === "annual"
                  ? `Annual pricing saves up to 18%—that is ${formatUsd(ANNUAL_SAVINGS_USD)} a year.`
                  : "Month-to-month plans can be changed or canceled before the next renewal."}
              </p>
            </div>
          </div>

          <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={cn(
                  "relative gap-0 rounded-2xl py-0 elevation-sm",
                  !plan.featured && "ring-border dark:bg-background",
                  plan.featured &&
                    "bg-brand-dark text-brand-dark-foreground ring-2 ring-primary elevation-lg lg:-my-3 lg:py-3",
                )}
              >
                {plan.featured ? (
                  <Badge className="absolute right-4 top-4 bg-primary text-primary-foreground">
                    Best for client work
                  </Badge>
                ) : null}

                <CardHeader className="gap-3 px-5 pb-5 pt-6 sm:px-6 sm:pt-7">
                  <div className={plan.featured ? "pr-32" : undefined}>
                    <CardTitle className="text-xl font-semibold">{plan.name}</CardTitle>
                  </div>
                  <CardDescription
                    className={cn(
                      "min-h-12 max-w-sm text-sm leading-6",
                      plan.featured && "text-brand-dark-muted",
                    )}
                  >
                    {plan.description}
                  </CardDescription>
                  <div className="pt-2">
                    <p className="flex items-end gap-1.5">
                      <span className="text-5xl font-semibold tracking-[-0.04em] tabular-nums">
                        {billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice}
                      </span>
                      {plan.annualPrice !== "$0" ? (
                        <span className={plan.featured ? "pb-1 text-brand-dark-muted" : "pb-1 text-muted-foreground"}>
                          /mo
                        </span>
                      ) : null}
                    </p>
                    <p className={cn("mt-2 text-sm leading-6 text-muted-foreground", plan.featured && "text-brand-dark-muted")}>
                      <BillingCadence
                        cadence={billingCycle === "annual" ? plan.annualCadence : plan.monthlyCadence}
                        onDark={plan.featured}
                      />
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col px-5 pb-6 sm:px-6">
                  <dl className={cn("grid gap-3 border-y border-border py-5", plan.featured && "border-brand-dark-border")}>
                    <div className="flex items-center gap-3">
                      <Users aria-hidden="true" className={cn("size-4 text-primary", plan.featured && "text-brand-dark-accent")} />
                      <dt className="sr-only">Workspace members</dt>
                      <dd className="font-medium">{plan.members}</dd>
                    </div>
                    <div className="flex items-center gap-3">
                      <FolderKanban aria-hidden="true" className={cn("size-4 text-primary", plan.featured && "text-brand-dark-accent")} />
                      <dt className="sr-only">Active review websites</dt>
                      <dd className="font-medium">{plan.projects}</dd>
                    </div>
                    <div className="flex items-center gap-3">
                      <HardDrive aria-hidden="true" className={cn("size-4 text-primary", plan.featured && "text-brand-dark-accent")} />
                      <dt className="sr-only">Video evidence</dt>
                      <dd className="font-medium">{plan.storage}</dd>
                    </div>
                  </dl>

                  <ul className="mt-5 grid gap-3" aria-label={`${plan.name} features`}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-6">
                        <Check aria-hidden="true" className={cn("mt-1 size-4 shrink-0 text-success", plan.featured && "text-brand-dark-success")} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className={cn("border-t border-border bg-transparent p-5 sm:p-6", plan.featured && "border-brand-dark-border")}>
                  <Button asChild size="lg" variant={plan.featured ? "default" : "outline"} className={cn("w-full", plan.featured && "elevation-md")}>
                    <Link href={authRoutes.signUp}>
                      {plan.action} <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <p className="mt-8 text-center text-sm leading-6 text-muted-foreground">
            Prices are in US dollars. Applicable taxes are added at checkout.
          </p>
        </div>
      </section>

      <section aria-labelledby="compare-plans-heading">
        <div className="site-shell section-space">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">Compare plans</p>
            <h2 id="compare-plans-heading" className="section-title mt-3">
              Every plan, side by side.
            </h2>
          </div>
          <div
            role="region"
            aria-label="Plan comparison table"
            tabIndex={0}
            className="relative mt-10 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10 elevation-sm"
          >
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">What each Passoff plan includes</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-2/5 px-5 py-4 font-medium text-muted-foreground sm:px-6">
                    Plan details
                  </th>
                  {plans.map((plan) => (
                    <th key={plan.name} scope="col" className="px-5 py-4 text-base font-semibold sm:px-6">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planLimitRows.map((row) => (
                  <tr key={row.label} className="border-b border-border">
                    <th scope="row" className="px-5 py-4 font-medium sm:px-6">{row.label}</th>
                    {plans.map((plan) => (
                      <td key={plan.name} className="px-5 py-4 text-muted-foreground sm:px-6">
                        {plan[row.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {planFeatureRows.map((row) => (
                  <tr key={row.feature} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-5 py-4 font-medium sm:px-6">{row.feature}</th>
                    {plans.map((plan, index) => (
                      <td key={plan.name} className="px-5 py-4 sm:px-6">
                        {index >= row.fromPlan ? (
                          <>
                            <Check aria-hidden="true" className="size-4 text-success" />
                            <span className="sr-only">Included</span>
                          </>
                        ) : (
                          <>
                            <Minus aria-hidden="true" className="size-4 text-muted-foreground" />
                            <span className="sr-only">Not included</span>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="included-heading" className="bg-surface">
        <div className="site-shell section-space">
          <div className="section-intro">
            <div className="section-intro-heading">
              <p className="eyebrow">Included on every plan</p>
              <h2 id="included-heading" className="section-title">
                The review stays generous where it matters.
              </h2>
            </div>
            <div className="section-intro-copy">
              <p className="section-lead">
                Clients should never have to wonder whether one more comment will cost your team money.
              </p>
            </div>
          </div>

          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sharedFeatures.map((feature) => (
              <li key={feature} className="flex min-h-20 items-center gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-resolved text-status-resolved-foreground">
                  <Check aria-hidden="true" className="size-4" />
                </span>
                <span className="text-sm font-medium leading-6">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="storage-heading" className="bg-brand-dark text-brand-dark-foreground">
        <div className="site-shell section-space grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-7">
            <p className="text-sm font-semibold text-brand-dark-accent">Video with a clear job</p>
            <h2 id="storage-heading" className="mt-3 text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.03em] sm:text-4xl">
              Show the issue without starting a separate video-review project.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-brand-dark-muted">
              Attach a clip of up to 3 minutes and 250 MB directly to an issue. Passoff keeps it
              while the issue is active, then removes the video 30 days after the issue closes
              while preserving the written history.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            <div className="flex gap-4 rounded-2xl bg-brand-dark-surface p-5 ring-1 ring-brand-dark-border">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Play aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="font-medium">Unlimited reviewer playback</p>
                <p className="mt-1 text-sm leading-6 text-brand-dark-muted">
                  Clients can replay evidence when they need it without using a visible playback
                  allowance.
                </p>
              </div>
            </div>
            <div className="flex gap-4 rounded-2xl bg-brand-dark-surface p-5 ring-1 ring-brand-dark-border">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="font-medium">No surprise video bill</p>
                <p className="mt-1 text-sm leading-6 text-brand-dark-muted">
                  We warn before an upload reaches a limit. Passoff never adds an automatic video
                  overage charge.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-heading">
        <div className="site-shell section-space grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <p className="eyebrow">Pricing questions</p>
            <h2 id="faq-heading" className="section-title mt-3">
              The useful details, before checkout.
            </h2>
            <p className="section-lead mt-4">
              No guest-seat arithmetic, surprise review limits, or disappearing work.
            </p>
          </div>

          <Accordion type="multiple" className="rounded-2xl bg-card px-5 ring-1 ring-foreground/10 sm:px-6 lg:col-span-8">
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question} className="border-border">
                <AccordionTrigger className="min-h-16 items-center py-4 text-base font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent forceMount className="pb-5 pr-8 text-base leading-7 text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <SiteCta
        kicker="Try the whole workflow"
        title="Put one real client review through its paces."
        body="No card, no setup call, and no client accounts required."
        actionLabel="Start your free trial"
        secondaryAction={null}
      />
    </main>
  );
}
