import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import {
  WEBHOOK_SCHEMA_VERSION,
  type WebhookEnvelope,
  type WebhookEventType,
} from "@/lib/webhooks/types";

type DbLike = {
  select: typeof db.select;
  insert: typeof db.insert;
};

export async function enqueueWebhookEvent(
  event: Omit<WebhookEnvelope, "schemaVersion"> & {
    schemaVersion?: string;
    subscribedType: WebhookEventType;
  },
  client: DbLike = db,
): Promise<number> {
  const envelope: WebhookEnvelope = {
    schemaVersion: WEBHOOK_SCHEMA_VERSION,
    eventId: event.eventId,
    eventType: event.subscribedType,
    occurredAt: event.occurredAt,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    reviewId: event.reviewId,
    issueId: event.issueId,
    issueNumber: event.issueNumber,
    actor: event.actor,
    data: sanitizeWebhookData(event.data),
  };

  const endpoints = await client
    .select({
      id: webhookEndpoints.id,
      workspaceId: webhookEndpoints.workspaceId,
      subscribedEvents: webhookEndpoints.subscribedEvents,
    })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.workspaceId, event.workspaceId),
        eq(webhookEndpoints.isEnabled, true),
      ),
    );

  const matching = endpoints.filter((endpoint) =>
    (endpoint.subscribedEvents ?? []).includes(event.subscribedType),
  );
  if (matching.length === 0) return 0;

  const inserted = await client
    .insert(webhookDeliveries)
    .values(
      matching.map((endpoint) => ({
        workspaceId: event.workspaceId,
        endpointId: endpoint.id,
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        payload: envelope as unknown as Record<string, unknown>,
        status: "pending" as const,
        attemptCount: 0,
        availableAt: new Date(),
      })),
    )
    .onConflictDoNothing({
      target: [webhookDeliveries.endpointId, webhookDeliveries.eventId],
    })
    .returning({ id: webhookDeliveries.id });

  return inserted.length;
}

export async function enqueueWebhookEventSafely(
  event: Parameters<typeof enqueueWebhookEvent>[0],
  client?: Parameters<typeof enqueueWebhookEvent>[1],
): Promise<void> {
  try {
    await enqueueWebhookEvent(event, client);
  } catch {
    // Product actions must succeed even if webhook enqueue fails.
  }
}

function sanitizeWebhookData(data: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "ip",
    "rawEvents",
    "tabSession",
    "cookie",
    "visitorId",
    "email",
    "cssSelector",
    "domFingerprint",
    "storageKey",
    "screenshotUrl",
    "videoUrl",
    "token",
    "privateComment",
    "internalNote",
    "pngBase64",
    "storageKey",
    "selector",
    "rawError",
    "stack",
  ]);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (blocked.has(key)) continue;
    if (typeof value === "string" && value.length > 2_000) {
      cleaned[key] = `${value.slice(0, 2_000)}…`;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
