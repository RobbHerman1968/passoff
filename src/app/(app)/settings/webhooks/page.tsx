import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { WebhookSettings } from "@/components/webhooks/webhook-settings";
import { listWebhookDeliveries, listWebhookEndpoints } from "@/lib/webhooks/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

type WebhookDeliveryRow = Extract<
  Awaited<ReturnType<typeof listWebhookDeliveries>>,
  { ok: true }
>["deliveries"][number];

export const metadata: Metadata = {
  title: "Webhooks",
  description: "Send signed review events to your own endpoint.",
};

export default async function WebhooksSettingsPage() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/settings/webhooks");
    }
    redirect("/onboarding");
  }

  if (auth.context.role !== "owner") {
    return (
      <>
        <PageHeader
          title="Webhooks"
          description="Only workspace owners can add or change webhook endpoints."
        />
        <p className="max-w-xl text-sm text-muted-foreground">
          Ask a workspace owner if your delivery workflow needs Passoff events.
          Members can still export issues from a review.
        </p>
      </>
    );
  }

  const listed = await listWebhookEndpoints(auth.context);
  const endpoints = listed.ok ? listed.endpoints : [];
  const deliveriesByEndpoint: Record<string, WebhookDeliveryRow[]> = {};
  for (const endpoint of endpoints) {
    const history = await listWebhookDeliveries(auth.context, endpoint.id);
    if (history.ok) deliveriesByEndpoint[endpoint.id] = history.deliveries;
  }

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Notify another system when review work changes. Passoff signs every delivery and retries temporary failures."
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: "Webhooks" },
        ]}
      />
      <div className="mb-6 max-w-2xl text-sm text-muted-foreground">
        <p>
          Verify signatures using HMAC-SHA256 of <code>{"{timestamp}.{raw body}"}</code>{" "}
          with header <code>Passoff-Signature</code> in the form{" "}
          <code>t=TIMESTAMP,v1=HEX</code>. Reject timestamps older than five minutes.
        </p>
      </div>
      <WebhookSettings endpoints={endpoints} deliveriesByEndpoint={deliveriesByEndpoint} />
    </>
  );
}
