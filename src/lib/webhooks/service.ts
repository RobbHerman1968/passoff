import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { enqueueWebhookEvent } from "@/lib/webhooks/enqueue";
import { encryptSecret, generateWebhookSecret } from "@/lib/webhooks/secrets";
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_TEST_RATE_LIMIT,
  WEBHOOK_TEST_RATE_WINDOW_MS,
  type WebhookEventType,
} from "@/lib/webhooks/types";
import { resolveWebhookDestination } from "@/lib/webhooks/url";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { canManageWebhooks } from "@/lib/workspaces/permissions";

function requireOwner(context: WorkspaceContext) {
  return canManageWebhooks(context);
}

export async function listWebhookEndpoints(context: WorkspaceContext) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const rows = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      subscribedEvents: webhookEndpoints.subscribedEvents,
      isEnabled: webhookEndpoints.isEnabled,
      createdAt: webhookEndpoints.createdAt,
      updatedAt: webhookEndpoints.updatedAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.workspaceId, context.workspaceId))
    .orderBy(desc(webhookEndpoints.createdAt));
  return { ok: true as const, endpoints: rows };
}

export async function createWebhookEndpoint(
  context: WorkspaceContext,
  input: { url: string; events: WebhookEventType[] },
) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const production = process.env.NODE_ENV === "production";
  const destination = await resolveWebhookDestination(input.url, production);
  if (!destination.ok) {
    return { ok: false as const, error: "validation" as const, message: destination.message };
  }
  const events = [...new Set(input.events)].filter((event) =>
    WEBHOOK_EVENT_TYPES.includes(event),
  );
  if (events.length === 0) {
    return {
      ok: false as const,
      error: "validation" as const,
      message: "Choose at least one event.",
    };
  }
  const secret = generateWebhookSecret();
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      workspaceId: context.workspaceId,
      url: destination.href,
      signingSecretEncrypted: encryptSecret(secret),
      subscribedEvents: events,
      isEnabled: true,
    })
    .returning({ id: webhookEndpoints.id, url: webhookEndpoints.url });
  return { ok: true as const, endpoint: row, secret };
}

export async function updateWebhookEndpoint(
  context: WorkspaceContext,
  input: {
    endpointId: string;
    url?: string;
    events?: WebhookEventType[];
    isEnabled?: boolean;
  },
) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const [existing] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, input.endpointId),
        eq(webhookEndpoints.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false as const, error: "not_found" as const };

  let url = existing.url;
  if (input.url) {
    const destination = await resolveWebhookDestination(
      input.url,
      process.env.NODE_ENV === "production",
    );
    if (!destination.ok) {
      return { ok: false as const, error: "validation" as const, message: destination.message };
    }
    url = destination.href;
  }
  const events = input.events
    ? [...new Set(input.events)].filter((event) => WEBHOOK_EVENT_TYPES.includes(event))
    : existing.subscribedEvents;
  if (events.length === 0) {
    return {
      ok: false as const,
      error: "validation" as const,
      message: "Choose at least one event.",
    };
  }

  await db
    .update(webhookEndpoints)
    .set({
      url,
      subscribedEvents: events,
      isEnabled: input.isEnabled ?? existing.isEnabled,
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoints.id, existing.id));
  return { ok: true as const };
}

export async function rotateWebhookSecret(context: WorkspaceContext, endpointId: string) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const secret = generateWebhookSecret();
  const [row] = await db
    .update(webhookEndpoints)
    .set({
      signingSecretEncrypted: encryptSecret(secret),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.workspaceId, context.workspaceId),
      ),
    )
    .returning({ id: webhookEndpoints.id });
  if (!row) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const, secret };
}

export async function deleteWebhookEndpoint(context: WorkspaceContext, endpointId: string) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const deleted = await db
    .delete(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.workspaceId, context.workspaceId),
      ),
    )
    .returning({ id: webhookEndpoints.id });
  return deleted.length > 0
    ? { ok: true as const }
    : { ok: false as const, error: "not_found" as const };
}

export async function listWebhookDeliveries(
  context: WorkspaceContext,
  endpointId: string,
) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const [endpoint] = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!endpoint) return { ok: false as const, error: "not_found" as const };

  const rows = await db
    .select({
      id: webhookDeliveries.id,
      eventType: webhookDeliveries.eventType,
      status: webhookDeliveries.status,
      attemptCount: webhookDeliveries.attemptCount,
      lastHttpStatus: webhookDeliveries.lastHttpStatus,
      lastError: webhookDeliveries.lastError,
      availableAt: webhookDeliveries.availableAt,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
      payload: webhookDeliveries.payload,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);
  return { ok: true as const, deliveries: rows };
}

export async function sendTestWebhook(context: WorkspaceContext, endpointId: string) {
  if (!requireOwner(context)) return { ok: false as const, error: "forbidden" as const };
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!endpoint) return { ok: false as const, error: "not_found" as const };

  const windowStart = new Date(Date.now() - WEBHOOK_TEST_RATE_WINDOW_MS);
  const recentCountRows = await db
    .select({ createdAt: webhookDeliveries.createdAt, payload: webhookDeliveries.payload })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(20);
  const testsInWindow = recentCountRows.filter((row) => {
    const payload = row.payload as { data?: { test?: boolean } };
    return payload.data?.test === true && row.createdAt >= windowStart;
  }).length;
  if (testsInWindow >= WEBHOOK_TEST_RATE_LIMIT) {
    return {
      ok: false as const,
      error: "rate_limited" as const,
      message: "Wait a few minutes before sending another test.",
    };
  }

  const eventType =
    (endpoint.subscribedEvents[0] as WebhookEventType | undefined) ?? "issue.created";
  const eventId = randomUUID();
  await enqueueWebhookEvent({
    eventId,
    subscribedType: eventType,
    eventType,
    occurredAt: new Date().toISOString(),
    workspaceId: context.workspaceId,
    projectId: null,
    reviewId: null,
    issueId: null,
    issueNumber: null,
    actor: { type: "user", name: context.userName ?? "Workspace owner" },
    data: {
      test: true,
      message: "This is a Passoff test delivery. It does not refer to a real issue.",
    },
  });
  return { ok: true as const, eventId };
}
