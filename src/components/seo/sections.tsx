import Link from "next/link";

import type { FaqItem, SeoLink } from "@/lib/seo/types";

export function FaqSection({ items }: { items: readonly FaqItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="faq-heading" className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-20">
        <h2
          id="faq-heading"
          className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
        >
          FAQ
        </h2>
        <dl className="mt-8 space-y-6">
          {items.map((item) => (
            <div key={item.question}>
              <dt className="font-semibold tracking-[-0.02em]">{item.question}</dt>
              <dd className="mt-2 text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function RelatedContent({
  heading,
  links,
}: {
  heading: string;
  links: readonly SeoLink[];
}) {
  if (!links.length) return null;
  return (
    <section
      aria-labelledby="related-heading"
      className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff] print:break-inside-avoid"
    >
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <h2
          id="related-heading"
          className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]"
        >
          {heading}
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.href} className="min-w-0">
              <Link
                href={link.href}
                className="group block rounded-xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white/70 px-4 py-4 transition hover:border-[color-mix(in_srgb,var(--brand)_35%,transparent)]"
              >
                <p className="font-semibold tracking-[-0.02em] text-[var(--brand-deep)] group-hover:text-[var(--brand-ink)]">
                  {link.label}
                </p>
                {link.description ? (
                  <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_60%,transparent)]">
                    {link.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
