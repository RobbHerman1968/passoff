"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "@/app/(app)/notifications/actions";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import type { NotificationListItem } from "@/lib/notifications/types";

export function NotificationList({
  items,
  page,
  pageCount,
  unreadOnly,
}: {
  items: NotificationListItem[];
  page: number;
  pageCount: number;
  unreadOnly: boolean;
}) {
  const router = useRouter();

  return (
    <div className="grid gap-4">
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await markAllNotificationsReadAction();
            router.refresh();
          }}
        >
          Mark all as read
        </Button>
      </div>
      <div className="grid gap-3">
        {items.map((item) => (
          <div key={item.id} className="grid gap-2">
            <NotificationItem {...item} />
            <div className="flex flex-wrap gap-2 pl-4">
              {item.readAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await markNotificationUnreadAction(item.id);
                    router.refresh();
                  }}
                >
                  Mark as unread
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await markNotificationReadAction(item.id);
                    router.refresh();
                  }}
                >
                  Mark as read
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {pageCount > 1 ? (
        <nav
          aria-label="Notification pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" disabled={page <= 1}>
              <Link
                href={pageHref(unreadOnly, Math.max(1, page - 1))}
                aria-disabled={page <= 1}
              >
                Previous
              </Link>
            </Button>
            <Button asChild variant="outline" disabled={page >= pageCount}>
              <Link
                href={pageHref(unreadOnly, Math.min(pageCount, page + 1))}
                aria-disabled={page >= pageCount}
              >
                Next
              </Link>
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function pageHref(unreadOnly: boolean, page: number) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("show", "unread");
  if (page > 1) params.set("p", String(page));
  const query = params.toString();
  return query ? `/notifications?${query}` : "/notifications";
}
