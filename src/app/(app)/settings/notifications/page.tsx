import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationSettingsForm } from "@/components/notifications/notification-settings-form";
import { PageHeader } from "@/components/page-header";
import { getUserNotificationSettings } from "@/lib/notifications/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Notification preferences",
  description: "Choose which emails Passoff sends you.",
};

export default async function NotificationSettingsPage() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/settings/notifications");
    }
    redirect("/onboarding");
  }

  const settings = await getUserNotificationSettings(auth.context.userId);

  return (
    <>
      <PageHeader
        title="Notification preferences"
        description="Choose which emails you get. In-app notifications for assignments, verification, and approval stay on so work doesn’t sit unnoticed."
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: "Notification preferences" },
        ]}
      />
      <NotificationSettingsForm settings={settings} />
    </>
  );
}
