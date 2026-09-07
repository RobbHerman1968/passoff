import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";

const footerLinks = [
  { href: "/solutions", label: "Solutions" },
  { href: "/resources", label: "Resources" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/login", label: "Sign in" },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#f5f2ff] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-medium text-[var(--brand-deep)]">
          <BrandMark size={20} />
          Pass-Off
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-[var(--brand-ink)] hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function MarketingShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <main className={`overflow-x-hidden bg-[#f5f2ff] text-[var(--brand-deep)] ${className}`}>
        {children}
        <MarketingFooter />
      </main>
    </>
  );
}
