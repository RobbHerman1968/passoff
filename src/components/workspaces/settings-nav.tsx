"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type SettingsNavItem = { href: string; label: string };

export function settingsNavItems(role: "owner" | "member"): SettingsNavItem[] {
  return [
    { href: "/settings/workspace", label: "Workspace" },
    { href: "/settings/members", label: "Members" },
    // Everyone can see the plan and usage; only the owner gets the buttons.
    { href: "/settings/billing", label: "Billing" },
    { href: "/settings/account", label: "Your account" },
    { href: "/settings/notifications", label: "Notifications" },
    // Only owners can change webhooks, so members are not sent to a page they can’t use.
    ...(role === "owner" ? [{ href: "/settings/webhooks", label: "Webhooks" }] : []),
  ];
}

/** Section links shared by every settings page. */
export function SettingsNav({ role }: { role: "owner" | "member" }) {
  const pathname = usePathname() ?? "";
  const items = settingsNavItems(role);

  return (
    <nav aria-label="Settings" className="mb-6">
      <ul className="flex flex-wrap gap-1 border-b border-border pb-2">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  current && "bg-muted text-foreground underline decoration-2 underline-offset-8",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
