import "server-only";

import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { decryptSecret } from "@/lib/webhooks/secrets";
import { signWebhookBody } from "@/lib/webhooks/sign";
import {
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_REQUEST_TIMEOUT_MS,
  WEBHOOK_RETENTION_DAYS,
  WEBHOOK_STALE_CLAIM_MS,
} from "@/lib/webhooks/types";
import { friendlyDeliveryError, resolveWebhookDestination } from "@/lib/webhooks/url";

const WORKER_ID = `webhooks:${process.pid}:${Math.random().toString(16).slice(2)}`;

export function nextRetryDelayMs(attemptCount: number): number {
  const base = Math.min(8 * 60 * 60_000, 60_000 * 5 ** Math.max(0, attemptCount - 1));
  const jitter = Math.floor(Math.random() * 15_000);
  return base + jitter;
}

export function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

async function claimDeliveries(limit = 20) {
  const staleBefore = new Date(Date.now() - WEBHOOK_STALE_CLAIM_MS);
  const now = new Date();
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      select id
      from webhook_deliveries
      where status in ('pending', 'processing')
        and available_at <= ${now}
        and (claimed_at is null or claimed_at <= ${staleBefore})
      order by available_at
      for update skip locked
      limit ${limit}
    `);
    const ids = (
      (result as unknown as { rows?: Array<{ id: string }> }).rows ?? []
    ).map((row) => row.id);
    if (ids.length === 0) return [];
    return tx
      .update(webhookDeliveries)
      .set({
        status: "processing",
        claimedAt: now,
        claimedBy: WORKER_ID,
      })
      .where(inArray(webhookDeliveries.id, ids))
      .returning();
  });
}

export async function processWebhookDeliveries(limit = 20): Promise<{ processed: number }> {
  await db
    .delete(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "delivered"),
        lt(
          webhookDeliveries.createdAt,
          new Date(Date.now() - WEBHOOK_RETENTION_DAYS * 24 * 60 * 60_000),
        ),
      ),
    );

  let claimed;
  try {
    claimed = await claimDeliveries(limit);
  } catch {
    claimed = await fallbackClaim(limit);
  }

  for (const delivery of claimed) {
    await attemptDelivery(delivery.id);
  }
  return { processed: claimed.length };
}

async function fallbackClaim(limit: number) {
  const staleBefore = new Date(Date.now() - WEBHOOK_STALE_CLAIM_MS);
  const now = new Date();
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        sql`${webhookDeliveries.status} in ('pending', 'processing')`,
        lte(webhookDeliveries.availableAt, now),
        or(isNull(webhookDeliveries.claimedAt), lte(webhookDeliveries.claimedAt, staleBefore)),
      ),
    )
    .limit(limit);
  const claimed = [];
  for (const row of rows) {
    const [updated] = await db
      .update(webhookDeliveries)
      .set({
        status: "processing",
        claimedAt: now,
        claimedBy: WORKER_ID,
      })
      .where(
        and(
          eq(webhookDeliveries.id, row.id),
          row.claimedBy
            ? eq(webhookDeliveries.claimedBy, row.claimedBy)
            : isNull(webhookDeliveries.claimedAt),
        ),
      )
      .returning();
    if (updated) claimed.push(updated);
  }
  return claimed;
}

export async function attemptDelivery(deliveryId: string): Promise<void> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  if (!delivery) return;

  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId))
    .limit(1);
  if (!endpoint || !endpoint.isEnabled) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "cancelled",
        lastError: "This endpoint is turned off.",
        claimedAt: null,
        claimedBy: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
  }

  const production = process.env.NODE_ENV === "production";
  const destination = await resolveWebhookDestination(endpoint.url, production);
  if (!destination.ok) {
    await failTerminal(deliveryId, delivery.attemptCount + 1, destination.message, null);
    return;
  }

  let secret: string;
  try {
    secret = decryptSecret(endpoint.signingSecretEncrypted);
  } catch {
    await failTerminal(deliveryId, delivery.attemptCount + 1, "Passoff couldn’t sign this delivery.", null);
    return;
  }

  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookBody(secret, timestamp, rawBody);
  const attemptCount = delivery.attemptCount + 1;

  try {
    const response = await fetch(destination.href, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Passoff-Webhooks/1.0",
        "Passoff-Event-Id": String((delivery.payload as { eventId?: string }).eventId ?? delivery.eventId),
        "Passoff-Event-Type": delivery.eventType,
        "Passoff-Delivery-Id": delivery.id,
        "Passoff-Signature": signature,
      },
      body: rawBody,
    });

    if (response.status >= 300 && response.status < 400) {
      await retryOrFail(deliveryId, attemptCount, friendlyDeliveryError({ kind: "redirect" }), response.status);
      return;
    }

    if (response.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "delivered",
          attemptCount,
          deliveredAt: new Date(),
          lastError: null,
          lastHttpStatus: response.status,
          claimedAt: null,
          claimedBy: null,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
      return;
    }

    if (shouldRetryStatus(response.status) && attemptCount < WEBHOOK_MAX_ATTEMPTS) {
      const delay = nextRetryDelayMs(attemptCount);
      await db
        .update(webhookDeliveries)
        .set({
          status: "pending",
          attemptCount,
          availableAt: new Date(Date.now() + delay),
          lastHttpStatus: response.status,
          lastError: friendlyDeliveryError({ kind: "retry", retryInMs: delay }),
          claimedAt: null,
          claimedBy: null,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
      return;
    }

    await failTerminal(
      deliveryId,
      attemptCount,
      friendlyDeliveryError({ kind: "rejected" }),
      response.status,
    );
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const message = friendlyDeliveryError({ kind: timeout ? "timeout" : "network" });
    if (attemptCount < WEBHOOK_MAX_ATTEMPTS) {
      const delay = nextRetryDelayMs(attemptCount);
      await db
        .update(webhookDeliveries)
        .set({
          status: "pending",
          attemptCount,
          availableAt: new Date(Date.now() + delay),
          lastError: friendlyDeliveryError({ kind: "retry", retryInMs: delay }),
          claimedAt: null,
          claimedBy: null,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
      return;
    }
    await failTerminal(deliveryId, attemptCount, message, null);
  }
}

async function failTerminal(
  deliveryId: string,
  attemptCount: number,
  message: string,
  status: number | null,
) {
  await db
    .update(webhookDeliveries)
    .set({
      status: "failed",
      attemptCount,
      lastError: message,
      lastHttpStatus: status,
      claimedAt: null,
      claimedBy: null,
    })
    .where(eq(webhookDeliveries.id, deliveryId));
}

async function retryOrFail(
  deliveryId: string,
  attemptCount: number,
  message: string,
  status: number,
) {
  if (attemptCount < WEBHOOK_MAX_ATTEMPTS && shouldRetryStatus(status)) {
    const delay = nextRetryDelayMs(attemptCount);
    await db
      .update(webhookDeliveries)
      .set({
        status: "pending",
        attemptCount,
        availableAt: new Date(Date.now() + delay),
        lastHttpStatus: status,
        lastError: friendlyDeliveryError({ kind: "retry", retryInMs: delay }),
        claimedAt: null,
        claimedBy: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
  }
  await failTerminal(deliveryId, attemptCount, message, status);
}

export async function retryFailedDelivery(deliveryId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .update(webhookDeliveries)
    .set({
      status: "pending",
      availableAt: new Date(),
      claimedAt: null,
      claimedBy: null,
    })
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.workspaceId, workspaceId),
        eq(webhookDeliveries.status, "failed"),
      ),
    )
    .returning({ id: webhookDeliveries.id });
  return Boolean(row);
}
