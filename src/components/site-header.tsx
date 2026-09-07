import Link from "next/link";

import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-[color-mix(in_srgb,var(--brand-muted)_88%,white)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl flex-nowrap items-center justify-between gap-2 px-4 sm:gap-3 sm:px-8">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 text-[1.05rem] font-semibold tracking-[-0.04em] text-[var(--brand-deep)] transition-opacity hover:opacity-80 sm:gap-2.5"
        >
          <BrandMark size={28} />
          <span className="font-[family-name:var(--font-display)] whitespace-nowrap">Pass-Off</span>
        </Link>
        <nav
          aria-label="Primary"
          className="flex min-w-0 shrink items-center justify-end gap-0.5 overflow-x-auto whitespace-nowrap sm:gap-2"
        >
          <Link
            href="/solutions"
            className="hidden h-10 items-center justify-center rounded-xl px-2.5 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] sm:inline-flex sm:px-3"
          >
            Solutions
          </Link>
          <Link
            href="/resources"
            className="hidden h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] md:inline-flex"
          >
            Resources
          </Link>
          <Link
            href="/pricing"
            className="hidden h-10 items-center justify-center rounded-xl px-2.5 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] sm:inline-flex sm:px-3"
          >
            Pricing
          </Link>
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-surface)] px-3 text-sm font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)] sm:px-4"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-2.5 text-sm font-semibold text-[var(--brand-ink)] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] sm:px-3"
              >
                Sign In
              </Link>
              <Link
                href="/login?mode=signup"
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-surface)] px-3 text-sm font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)] sm:px-4"
              >
                <span className="sm:hidden">Trial</span>
                <span className="hidden sm:inline">Start Free Trial</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
