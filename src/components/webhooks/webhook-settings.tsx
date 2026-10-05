"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  retryWebhookDeliveryAction,
  rotateWebhookSecretAction,
  sendTestWebhookAction,
  toggleWebhookEndpointAction,
} from "@/app/(app)/settings/webhooks/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "@/lib/webhooks/types";

type Endpoint = {
  id: string;
  url: string;
  subscribedEvents: string[];
  isEnabled: boolean;
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastHttpStatus: number | null;
  lastError: string | null;
  availableAt: Date | string;
  createdAt: Date | string;
  payload: Record<string, unknown>;
};

export function WebhookSettings({
  endpoints,
  deliveriesByEndpoint,
}: {
  endpoints: Endpoint[];
  deliveriesByEndpoint: Record<string, Delivery[]>;
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>(["issue.created"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createEndpoint() {
    setPending(true);
    setError(null);
    const result = await createWebhookEndpointAction({ url, events });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "We couldn’t save that endpoint.");
      return;
    }
    setSecret(result.secret);
    setUrl("");
    toast.success("Webhook endpoint added.");
  }

  return (
    <div className="grid gap-8">
      <section className="grid max-w-2xl gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Add an endpoint</h2>
        <p className="text-sm text-muted-foreground">
          Passoff will send signed JSON when subscribed review work changes. Secrets
          are shown once. Rotating a secret immediately invalidates the previous one.
        </p>
        {error ? <FormAlert title="Check this endpoint" description={error} /> : null}
        {secret ? (
          <div className="grid gap-2 rounded-lg bg-muted p-3">
            <p className="text-sm font-medium">Signing secret</p>
            <p className="break-all font-mono text-sm">{secret}</p>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                toast.success("Signing secret copied.");
              }}
            >
              Copy secret
            </Button>
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input
            id="webhook-url"
            type="url"
            inputMode="url"
            placeholder="https://example.com/passoff-webhooks"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Events</legend>
          {WEBHOOK_EVENT_TYPES.map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={events.includes(type)}
                onChange={(event) => {
                  setEvents((current) =>
                    event.target.checked
                      ? [...current, type]
                      : current.filter((value) => value !== type),
                  );
                }}
              />
              {WEBHOOK_EVENT_LABELS[type]}
            </label>
          ))}
        </fieldset>
        <Button type="button" onClick={() => void createEndpoint()} disabled={pending}>
          {pending ? "Saving…" : "Add endpoint"}
        </Button>
      </section>

      {endpoints.map((endpoint) => (
        <section
          key={endpoint.id}
          className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-all text-sm font-semibold">{endpoint.url}</h3>
              <p className="text-sm text-muted-foreground">
                {endpoint.subscribedEvents
                  .map((event) => WEBHOOK_EVENT_LABELS[event as WebhookEventType] ?? event)
                  .join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`enabled-${endpoint.id}`}>Enabled</Label>
              <Switch
                id={`enabled-${endpoint.id}`}
                checked={endpoint.isEnabled}
                onCheckedChange={(checked) => {
                  void toggleWebhookEndpointAction(endpoint.id, checked);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const result = await sendTestWebhookAction(endpoint.id);
                if (!result.ok) toast.error(result.message);
                else toast.success("Test delivery queued.");
              }}
            >
              Send test
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const result = await rotateWebhookSecretAction(endpoint.id);
                if (result.ok) {
                  setSecret(result.secret);
                  toast.success("New signing secret created. The previous secret no longer works.");
                }
              }}
            >
              Rotate secret
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Delete this endpoint and its delivery history? This can’t be undone.",
                  )
                ) {
                  return;
                }
                await deleteWebhookEndpointAction(endpoint.id);
              }}
            >
              Delete endpoint
            </Button>
          </div>
          <DeliveryList deliveries={deliveriesByEndpoint[endpoint.id] ?? []} />
        </section>
      ))}
    </div>
  );
}

function DeliveryList({ deliveries }: { deliveries: Delivery[] }) {
  if (deliveries.length === 0) {
    return <p className="text-sm text-muted-foreground">No deliveries yet.</p>;
  }
  return (
    <ul className="grid gap-3">
      {deliveries.map((delivery) => (
        <li key={delivery.id} className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">
            {WEBHOOK_EVENT_LABELS[delivery.eventType as WebhookEventType] ?? delivery.eventType}
          </p>
          <p>
            <span className="sr-only">{delivery.status}. </span>
            {statusLabel(delivery.status)}
            {delivery.lastHttpStatus ? ` · HTTP ${delivery.lastHttpStatus}` : ""}
            {` · Attempt ${delivery.attemptCount}`}
          </p>
          {delivery.lastError ? (
            <p className="text-muted-foreground">{delivery.lastError}</p>
          ) : null}
          {delivery.status === "failed" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void retryWebhookDeliveryAction(delivery.id)}
            >
              Retry delivery
            </Button>
          ) : null}
          <details className="mt-2">
            <summary className="cursor-pointer">View payload</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </details>
        </li>
      ))}
    </ul>
  );
}

function statusLabel(status: string) {
  if (status === "delivered") return "Delivered";
  if (status === "pending") return "Waiting to send";
  if (status === "processing") return "Sending";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}
