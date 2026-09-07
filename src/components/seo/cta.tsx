"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";

import { track } from "@/lib/analytics/events";
import { SEO_PRIMARY_CTA } from "@/lib/seo/inventory";

type Placement = "header" | "hero" | "mid" | "footer" | "inline";

export function PrimaryCtaLink({
  placement,
  path,
  className,
  intent,
  pageType,
}: {
  placement: Placement;
  path: string;
  className?: string;
  intent?: string;
  pageType?: "commercial" | "resource" | "hub" | "home" | "pricing";
}) {
  useEffect(() => {
    if (!pageType) return;
    track("seo_landing_page_view", { path, intent, pageType });
  }, [path, intent, pageType]);

  return (
    <Link
      href={SEO_PRIMARY_CTA.href}
      onClick={() =>
        track("primary_cta_click", {
          path,
          cta: SEO_PRIMARY_CTA.label,
          placement,
        })
      }
      className={
        className ??
        "inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-surface)] px-5 text-sm font-semibold text-[var(--brand-soft)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-deep)]"
      }
    >
      {SEO_PRIMARY_CTA.label}
      <ArrowRight className="size-4" />
    </Link>
  );
}

export function CtaBand({
  path,
  heading,
  body,
  secondary,
}: {
  path: string;
  heading: string;
  body: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="bg-[var(--brand-surface)] text-[var(--brand-soft)] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:py-20">
        <div className="max-w-xl">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 text-base leading-7 text-white/55">{body}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryCtaLink
            path={path}
            placement="footer"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--brand-strong)]"
          />
          {secondary ? (
            <Link
              href={secondary.href}
              className="inline-flex h-12 items-center rounded-xl px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
