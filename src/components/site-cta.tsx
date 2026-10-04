import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AGENCY_TRIAL_DAYS } from "@/lib/billing/plans";
import { authRoutes } from "@/lib/site";

export function SiteCta({
  kicker,
  title,
  body,
  actionLabel = "Start your first review",
  secondaryAction = { href: "/pricing", label: "See pricing" },
}: {
  kicker?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  secondaryAction?: { href: string; label: string } | null;
}) {
  return (
    <section aria-labelledby="site-cta-heading">
      <div className="site-shell section-space-end">
        <div className="relative isolate overflow-hidden rounded-3xl bg-card px-6 py-14 text-center ring-1 ring-foreground/10 elevation-md sm:px-12 lg:py-20">
          <div aria-hidden="true" className="hero-backdrop absolute inset-0 -z-10" />
          {kicker ? <p className="eyebrow">{kicker}</p> : null}
          <h2 id="site-cta-heading" className="section-title mx-auto mt-3 max-w-2xl">
            {title}
          </h2>
          {body ? <p className="section-lead mx-auto mt-4 max-w-xl">{body}</p> : null}
          <div className="mt-8 flex flex-col justify-center gap-3 min-[380px]:flex-row">
            <Button asChild size="lg" className="px-6 elevation-md">
              <Link href={authRoutes.signUp}>
                {actionLabel} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {secondaryAction ? (
              <Button asChild size="lg" variant="outline" className="px-6">
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : null}
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            {AGENCY_TRIAL_DAYS} days on Agency, no card required.
          </p>
        </div>
      </div>
    </section>
  );
}
