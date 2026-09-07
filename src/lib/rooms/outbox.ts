import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { outboxEvents } from "@/db/schema";
import { sendTransactionalEmail, type EmailSendResult } from "@/lib/email/resend";
import { logInfo, logWarn } from "@/lib/logging";

export type OutboxType =
  | "email.share"
  | "email.comment"
  | "email.approval"
  | "email.receipt"
  | "email.changes_requested"
  | "email.password_reset";

type EnqueueInput = {
  type: OutboxType;
  payload: Record<string, unknown>;
  availableAt?: Date;
  idempotencyKey?: string;
};

const CLAIM_STALE_MS = 5 * 60 * 1000;

export async function enqueueOutbox(input: EnqueueInput, tx: typeof db = db) {
  const idempotencyKey =
    input.idempotencyKey ||
    `${input.type}:${typeof input.payload.to === "string" ? input.payload.to : "none"}:${randomBytes(8).toString("hex")}`;

  try {
    const [row] = await tx
      .insert(outboxEvents)
      .values({
        type: input.type,
        payloadJson: JSON.stringify(input.payload),
        availableAt: input.availableAt ?? new Date(),
        idempotencyKey,
      })
      .returning({ id: outboxEvents.id });
    return { id: row.id, queued: true as const };
  } catch {
    logWarn("outbox.enqueue_duplicate", { type: input.type });
    return { id: null, queued: false as const, reason: "duplicate" as const };
  }
}

/**
 * Concurrent-safe outbox processing:
 * 1. Select candidate ids with FOR UPDATE SKIP LOCKED
 * 2. Stamp claim token
 * 3. Send
 * 4. Mark processed only if claim token still matches
 */
export async function processOutboxBatch(limit = 25) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const claimToken = randomBytes(16).toString("hex");

  const candidates = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT id
      FROM outbox_events
      WHERE processed_at IS NULL
        AND available_at <= ${now}
        AND (claimed_at IS NULL OR claimed_at < ${staleBefore})
      ORDER BY available_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);

    const rows = (result as unknown as { rows?: Array<{ id: string }> }).rows ?? [];
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (!ids.length) return [] as string[];

    await tx
      .update(outboxEvents)
      .set({
        claimedAt: now,
        claimToken,
        attempts: sql`${outboxEvents.attempts} + 1`,
      })
      .where(
        and(
          sql`${outboxEvents.id} IN (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
          isNull(outboxEvents.processedAt),
        ),
      );

    return ids;
  });

  if (!candidates.length) {
    return { scanned: 0, processed: 0, failed: 0, skipped: 0 };
  }

  const events = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.claimToken, claimToken), isNull(outboxEvents.processedAt)))
    .orderBy(asc(outboxEvents.availableAt));

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      const payload = JSON.parse(event.payloadJson) as Record<string, unknown>;
      let result: EmailSendResult | undefined;
      if (event.type.startsWith("email.")) {
        result = await sendTransactionalEmail(event.type as OutboxType, {
          ...payload,
          idempotencyKey: event.idempotencyKey || event.id,
        });
      }

      if (result && "skipped" in result && result.skipped) {
        skipped += 1;
      }

      await db
        .update(outboxEvents)
        .set({
          processedAt: new Date(),
          lastError:
            result && "skipped" in result && result.skipped
              ? `skipped:${result.reason || "unknown"}`
              : null,
          claimedAt: null,
          claimToken: null,
        })
        .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.claimToken, claimToken)));

      processed += 1;
      logInfo("outbox.processed", {
        id: event.id,
        type: event.type,
        skipped: Boolean(result && "skipped" in result && result.skipped),
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Outbox processing failed";
      await db
        .update(outboxEvents)
        .set({
          lastError: message,
          availableAt: new Date(
            Date.now() + Math.min(60_000 * 2 ** Math.max(event.attempts - 1, 0), 3_600_000),
          ),
          claimedAt: null,
          claimToken: null,
        })
        .where(eq(outboxEvents.id, event.id));
      logWarn("outbox.failed", { id: event.id, type: event.type, error: message });
    }
  }

  return { scanned: events.length, processed, failed, skipped };
}

export async function listPendingOutbox(limit = 50) {
  const now = new Date();
  return db
    .select()
    .from(outboxEvents)
    .where(and(isNull(outboxEvents.processedAt), lte(outboxEvents.availableAt, now)))
    .orderBy(asc(outboxEvents.availableAt))
    .limit(limit);
}
