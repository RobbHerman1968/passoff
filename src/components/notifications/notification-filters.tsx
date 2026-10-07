import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NotificationFilters({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <fieldset className="mb-4 grid min-w-0 gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Show</legend>
      <div className="flex max-w-full overflow-x-auto rounded-lg ring-1 ring-input ring-inset">
        <Button
          asChild
          variant="ghost"
          className={
            !unreadOnly
              ? "rounded-none bg-secondary font-medium first:rounded-l-lg"
              : "rounded-none first:rounded-l-lg"
          }
        >
          <Link href="/notifications" aria-current={!unreadOnly ? "page" : undefined}>
            All
          </Link>
        </Button>
        <Button
          asChild
          variant="ghost"
          className={
            unreadOnly
              ? "rounded-none bg-secondary font-medium last:rounded-r-lg"
              : "rounded-none last:rounded-r-lg"
          }
        >
          <Link
            href="/notifications?show=unread"
            aria-current={unreadOnly ? "page" : undefined}
          >
            Unread
          </Link>
        </Button>
      </div>
    </fieldset>
  );
}
