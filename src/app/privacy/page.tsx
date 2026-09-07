import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Starter privacy policy for Pass-Off Approval Rooms.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-[#f5f2ff] text-[var(--brand-deep)]">
        <article className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
            Starter policy
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em]">
            Privacy policy
          </h1>
          <p className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)] bg-white/70 px-4 py-3 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_70%,transparent)]">
            This is a starter privacy notice for the first Pass-Off release. It is not legal advice
            and should be reviewed by counsel before production use.
          </p>
          <div className="mt-10 space-y-8 text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_72%,transparent)]">
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                What we collect
              </h2>
              <p className="mt-3">
                Account details (name, email, password hash), workspace settings, approval room
                content you upload, review-link activity, comments, approval records, and basic
                operational logs needed to run the service.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                How we use it
              </h2>
              <p className="mt-3">
                We use this information to provide Pass-Off Approval Rooms, send transactional
                emails (review invites, comments, approvals, password resets), process billing, and
                keep the product secure and reliable.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                Sharing
              </h2>
              <p className="mt-3">
                We do not sell personal data. We may use infrastructure providers (hosting, email,
                payments, storage) that process data only to operate Pass-Off. Review links expose
                the designs and status you choose to share with recipients.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                Contact
              </h2>
              <p className="mt-3">
                Questions about privacy:{" "}
                <a
                  href="mailto:support@pass-off.com"
                  className="font-semibold text-[var(--brand-ink)] hover:underline"
                >
                  support@pass-off.com
                </a>
                .
              </p>
            </section>
          </div>
          <Link href="/" className="mt-12 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-ink)]">
            <BrandMark size={18} />
            Back to Pass-Off
          </Link>
        </article>
      </main>
    </>
  );
}
