import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  markNotificationRead,
  getNotificationForUser,
  notificationTargetAccessible,
} from "@/lib/notifications/service";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireWorkspaceContext } from "@/lib/workspaces/context";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Notification",
};

export default async function NotificationOpenPage({
  params,
}: {
  params: Promise<{ notificationId: string }>;
}) {
  const { notificationId } = await params;
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect(`/sign-in?callbackUrl=/notifications/${notificationId}`);
    }
    redirect("/onboarding");
  }

  const notification = await getNotificationForUser(
    auth.context.userId,
    notificationId,
  );
  if (!notification) {
    return (
      <>
        <PageHeader title="This update isn’t available" />
        <EmptyState
          title="This update isn’t available"
          description="It may have been removed, or you no longer have access. Nothing else is shown so protected work stays private."
          action={
            <Button asChild>
              <Link href="/notifications">Back to notifications</Link>
            </Button>
          }
        />
      </>
    );
  }

  const accessible = await notificationTargetAccessible(
    auth.context,
    notification,
  );
  if (!accessible) {
    return (
      <>
        <PageHeader title="This update isn’t available" />
        <EmptyState
          title="This update isn’t available"
          description="It may have been removed, or you no longer have access. Nothing else is shown so protected work stays private."
          action={
            <Button asChild>
              <Link href="/notifications">Back to notifications</Link>
            </Button>
          }
        />
      </>
    );
  }

  await markNotificationRead(auth.context.userId, notificationId);
  redirect(notification.hrefPath);
}
