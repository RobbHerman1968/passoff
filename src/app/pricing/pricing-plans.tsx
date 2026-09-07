"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

import {
  formatPlanPrice,
  pricingNotes,
  publicPricingPlans,
  type BillingInterval,
  type PricingPlan,
} from "@/lib/pricing";

export function PricingPlans() {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: PricingPlan) {
    if (!plan.purchasable || plan.comingLater) return;
    if (plan.id === "trial") {
      router.push(plan.cta.href);
      return;
    }
    setBusyPlan(plan.id);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, interval }),
      });
      const payload = (await response.json()) as {
        url?: string;
        mode?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Checkout failed.");
      }
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      router.push(`/dashboard?billing=${payload.mode || "ok"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_62%,transparent)]">
          Billed per workspace. Switch to annual for a lower effective monthly rate on Solo.
        </p>
        <div
          role="group"
          aria-label="Billing interval"
          className="inline-flex rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)] bg-white/70 p-1 text-sm font-semibold"
        >
          {(
            [
              { id: "monthly", label: "Monthly" },
              { id: "annual", label: "Annual" },
            ] as const
          ).map((option) => {
            const active = interval === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setInterval(option.id)}
                className={`rounded-lg px-3.5 py-2 transition ${
                  active
                    ? "bg-[var(--brand-surface)] text-[var(--brand-soft)]"
                    : "text-[var(--brand-ink)] hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-10 divide-y divide-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] border-y border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]">
        {publicPricingPlans.map((plan) => {
          const price = formatPlanPrice(plan, interval);
          const comingLater = Boolean(plan.comingLater) || !plan.purchasable;
          return (
            <article
              key={plan.id}
              className={`grid gap-6 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_auto] lg:items-start lg:gap-10 ${
                plan.highlighted ? "bg-[color-mix(in_srgb,var(--brand)_5%,transparent)]" : ""
              }`}
            >
              <div className="px-1 lg:px-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
                    {plan.name}
                  </h2>
                  {plan.highlighted && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                      Available now
                    </span>
                  )}
                  {comingLater && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--brand-deep)_45%,transparent)]">
                      Coming later
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[0.95rem] leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                  {plan.description}
                </p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-ink)]">
                  {plan.capacity}
                </p>
              </div>

              <div>
                <div className="flex items-end gap-2">
                  <p className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                    {price.amount}
                  </p>
                  {price.period && (
                    <p className="mb-1.5 text-sm text-[color-mix(in_srgb,var(--brand-deep)_55%,transparent)]">
                      {price.period}
                    </p>
                  )}
                </div>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-2.5 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--brand)]" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:pt-1">
                {comingLater ? (
                  <span className="inline-flex h-11 items-center rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_16%,transparent)] px-4 text-sm font-semibold text-[color-mix(in_srgb,var(--brand-deep)_45%,transparent)]">
                    Coming later
                  </span>
                ) : plan.id === "trial" ? (
                  <Link
                    href={plan.cta.href}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-surface)] px-4 text-sm font-semibold text-[var(--brand-soft)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-deep)]"
                  >
                    {plan.cta.label}
                    <ArrowRight className="size-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busyPlan === plan.id}
                    onClick={() => startCheckout(plan)}
                    className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:-translate-y-0.5 disabled:opacity-60 ${
                      plan.highlighted
                        ? "bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]"
                        : "bg-[var(--brand-surface)] text-[var(--brand-soft)] hover:bg-[var(--brand-deep)]"
                    }`}
                  >
                    {busyPlan === plan.id ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <>
                        {plan.cta.label}
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <ul className="mt-10 max-w-3xl space-y-3">
        {pricingNotes.map((note) => (
          <li
            key={note}
            className="flex gap-3 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_62%,transparent)]"
          >
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden />
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}
