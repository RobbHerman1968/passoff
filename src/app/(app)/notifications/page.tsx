import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationFilters } from "@/components/notifications/notification-filters";
import { NotificationList } from "@/components/notifications/notification-list";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listNotificationsForUser } from "@/lib/notifications/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Work that needs your attention.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/notifications");
    }
    redirect("/onboarding");
  }

  const params = await searchParams;
  const unreadOnly = params.show === "unread";
  const pageRaw = typeof params.p === "string" ? Number(params.p) : 1;
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const result = await listNotificationsForUser(auth.context.userId, {
    unreadOnly,
    page,
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, verification, and approval updates for this workspace."
      />
      <NotificationFilters unreadOnly={unreadOnly} />
      {result.items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? "No unread notifications" : "No notifications yet"}
          description={
            unreadOnly
              ? "You’re all caught up. New work will show up here."
              : "You’ll see assignments, replies, verification, and approval updates here."
          }
          action={
            <Button asChild>
              <Link href="/dashboard">Go to projects</Link>
            </Button>
          }
        />
      ) : (
        <NotificationList
          items={result.items}
          page={result.page}
          pageCount={result.pageCount}
          unreadOnly={unreadOnly}
        />
      )}
    </>
  );
}
