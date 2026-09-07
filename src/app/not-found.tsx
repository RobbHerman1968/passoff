import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f5f2ff] px-5 text-[var(--brand-deep)]">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <BrandMark size={28} />
        Pass-Off
      </Link>
      <h1 className="mt-8 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.04em]">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-center text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
        That URL does not exist. Try the homepage, solutions, or resources.
      </p>
      <nav className="mt-8 flex flex-wrap justify-center gap-4 text-sm font-semibold">
        <Link href="/" className="text-[var(--brand-ink)] hover:underline">
          Home
        </Link>
        <Link href="/solutions" className="text-[var(--brand-ink)] hover:underline">
          Solutions
        </Link>
        <Link href="/resources" className="text-[var(--brand-ink)] hover:underline">
          Resources
        </Link>
        <Link href="/pricing" className="text-[var(--brand-ink)] hover:underline">
          Pricing
        </Link>
      </nav>
    </main>
  );
}
