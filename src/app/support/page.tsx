import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact Pass-Off support for Approval Rooms help.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-[#f5f2ff] text-[var(--brand-deep)]">
        <section className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
            Support
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em]">
            We are here to help.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[color-mix(in_srgb,var(--brand-deep)_68%,transparent)]">
            For billing questions, account access, or Approval Rooms issues, email the Pass-Off
            team. Include your account email and room name when you can.
          </p>

          <a
            href="mailto:support@pass-off.com"
            className="mt-10 inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-surface)] px-5 text-sm font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)]"
          >
            <Mail className="size-4" />
            support@pass-off.com
          </a>

          <div className="mt-12 space-y-3 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
            <p>
              Looking for plans?{" "}
              <Link href="/pricing" className="font-semibold text-[var(--brand-ink)] hover:underline">
                View pricing
              </Link>
              .
            </p>
            <p>
              Need an account?{" "}
              <Link
                href="/login?mode=signup"
                className="font-semibold text-[var(--brand-ink)] hover:underline"
              >
                Start free trial
              </Link>
              .
            </p>
          </div>

          <Link href="/" className="mt-12 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-ink)]">
            <BrandMark size={18} />
            Back to Pass-Off
          </Link>
        </section>
      </main>
    </>
  );
}
