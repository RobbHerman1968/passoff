import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BillingNotices } from "@/components/billing/billing-notices";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { PlanPicker } from "@/components/billing/plan-picker";
import { PlanSummary } from "@/components/billing/plan-summary";
import { UsageSection } from "@/components/billing/usage-section";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { BILLING_MESSAGES, getBillingOverview } from "@/lib/billing/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Billing and plan",
  description: "See your plan and what your workspace is using, and change or manage your plan.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/settings/billing");
    }
    redirect("/onboarding");
  }
  const { context } = auth;

  const params = await searchParams;
  const rawCheckout = typeof params.checkout === "string" ? params.checkout : null;
  const checkout = rawCheckout === "success" || rawCheckout === "cancelled" ? rawCheckout : null;

  let overview;
  try {
    overview = await getBillingOverview(context);
  } catch {
    overview = null;
  }

  if (!overview) {
    return (
      <>
        <PageHeader title="Billing and plan" />
        <ErrorState
          title="We couldn’t load your plan"
          description="Check your connection and try again. Your work isn’t affected."
        />
      </>
    );
  }

  const showPicker = overview.canManage && !overview.hasSubscription;
  const showInvoices = overview.canManage && overview.canOpenPortal && !overview.hasSubscription;

  return (
    <>
      <PageHeader
        title="Billing and plan"
        description={`The plan, limits, and payment details for ${overview.workspaceName}.`}
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: "Billing and plan" },
        ]}
      />
      <div className="grid gap-6">
        <BillingNotices overview={{ ...overview, checkout }} />
        <PlanSummary overview={overview} />
        {showPicker ? (
          <section aria-label="Choose a plan" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <PlanPicker
              trialEligible={overview.trial.eligible}
              unavailableReason={overview.billingConfigured ? undefined : BILLING_MESSAGES.notConfigured}
              heading={overview.state === "free" ? "Choose a plan" : "Choose a plan to restore more room"}
            />
          </section>
        ) : null}
        <UsageSection overview={overview} />
        {showInvoices ? (
          <section
            aria-labelledby="invoices-heading"
            className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <h2 id="invoices-heading" className="type-section-title">
              Invoices and payment details
            </h2>
            <p className="type-supporting max-w-prose">
              Past invoices and saved payment details are kept on a secure page hosted by our
              payment provider.
            </p>
            <ManageBillingButton
              label="View invoices and payment details"
              variant="outline"
              unavailableReason={overview.billingConfigured ? undefined : BILLING_MESSAGES.notConfigured}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
