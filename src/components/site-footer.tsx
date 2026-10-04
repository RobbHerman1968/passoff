import Link from "next/link";

import { Logo } from "@/components/logo";
import { publicFooterGroups } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="site-shell grid gap-10 py-14 lg:grid-cols-12 lg:gap-8 lg:py-16">
        <div className="max-w-sm lg:col-span-5">
          <Link
            href="/"
            aria-label="Passoff home"
            className="inline-flex rounded-md text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <Logo className="flex items-center gap-2.5" />
          </Link>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Clear feedback for real websites and videos. No screenshot scavenger hunt required.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
          {publicFooterGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-semibold">{group.title}</h2>
              <ul className="mt-3 grid gap-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="site-shell py-6 text-xs leading-5 text-muted-foreground">
          © {year} Passoff. Keep the good work moving.
        </p>
      </div>
    </footer>
  );
}
