import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Starter terms of service for Pass-Off Approval Rooms.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-[#f5f2ff] text-[var(--brand-deep)]">
        <article className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
            Starter terms
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em]">
            Terms of service
          </h1>
          <p className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)] bg-white/70 px-4 py-3 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_70%,transparent)]">
            These are starter terms for the first Pass-Off release. They are not a complete legal
            agreement and should be reviewed by counsel before production use.
          </p>
          <div className="mt-10 space-y-8 text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_72%,transparent)]">
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                The service
              </h2>
              <p className="mt-3">
                Pass-Off provides Approval Rooms for sharing design revisions, collecting feedback,
                recording approval, and releasing handoff files. Features may change during early
                release.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                Your content
              </h2>
              <p className="mt-3">
                You retain ownership of designs and files you upload. You grant Pass-Off permission
                to host and process that content as needed to operate the product and share it with
                people you invite via review links.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                Acceptable use
              </h2>
              <p className="mt-3">
                Do not misuse the service, attempt unauthorized access, upload unlawful content, or
                interfere with other customers. We may suspend accounts that violate these terms.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                Billing
              </h2>
              <p className="mt-3">
                Paid plans are billed per workspace as described on the pricing page. Trial access
                may expire; archived rooms may remain readable subject to product limits.
              </p>
            </section>
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                Contact
              </h2>
              <p className="mt-3">
                Questions about these terms:{" "}
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
