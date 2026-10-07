import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  environmentTelemetrySettings,
  projectEnvironments,
  telemetryIngestDedup,
  telemetryRawEvents,
  telemetryUsageCounters,
} from "@/db/schema";
import { isPublicInstallationKey } from "@/lib/installations/snippet";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import { TELEMETRY_LIMITS } from "@/lib/telemetry/limits";
import { hashTabSession, hourBucketUtc, currentUsagePeriod } from "@/lib/telemetry/hash";
import { isLikelyBotUserAgent } from "@/lib/telemetry/errors";
import { isPlatformTelemetryKillSwitchOn } from "@/lib/telemetry/platform";
import { isSensitiveRoute, normalizeTelemetryRoute } from "@/lib/telemetry/routes";
import { getOrCreateTelemetrySettings } from "@/lib/telemetry/settings";
import {
  encodedBatchBytes,
  jsonContainsForbiddenKeys,
  telemetryBatchSchema,
  MAX_BATCH_BYTES,
  type ParsedTelemetryBatch,
} from "@/lib/telemetry/event-schema";
import { ERROR_CATEGORIES } from "@/lib/telemetry/errors";

export type IngestResult =
  | { ok: true; accepted: number; dropped: number; corsOrigin: string }
  | {
      ok: false;
      status: 400 | 403 | 404 | 413 | 429;
      corsOrigin?: string;
      retryAfterSeconds?: number;
    };

function reject(
  status: 400 | 403 | 404 | 413,
  corsOrigin?: string,
): IngestResult {
  return { ok: false, status, corsOrigin };
}

export async function ingestTelemetryBatch(options: {
  rawText: string;
  headerOrigin: string | null;
  userAgent: string | null;
  rateLimitSubjects: string[];
}): Promise<IngestResult> {
  if (encodedBatchBytes(options.rawText) > MAX_BATCH_BYTES) {
    return reject(413);
  }
  if (jsonContainsForbiddenKeys(safeJson(options.rawText))) {
    return reject(400);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(options.rawText);
  } catch {
    return reject(400);
  }

  const parsed = telemetryBatchSchema.safeParse(parsedJson);
  if (!parsed.success) return reject(400);
  const batch = parsed.data;

  if (!isPublicInstallationKey(batch.installationKey)) {
    return reject(404);
  }

  const origin = normalizeOrigin(options.headerOrigin);
  if (!origin.ok) return reject(403);

  if (isLikelyBotUserAgent(options.userAgent)) {
    return { ok: true, accepted: 0, dropped: batch.events.length, corsOrigin: origin.origin };
  }

  if (await isPlatformTelemetryKillSwitchOn()) {
    return { ok: true, accepted: 0, dropped: batch.events.length, corsOrigin: origin.origin };
  }

  const rate = await enforceInstallationRateLimit({
    scope: "telemetry_ingest",
    subjects: [batch.installationKey, origin.origin, ...options.rateLimitSubjects],
  });
  if (!rate.ok) {
    return {
      ok: false,
      status: 429,
      corsOrigin: origin.origin,
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      workspaceId: projectEnvironments.workspaceId,
      projectId: projectEnvironments.projectId,
      kind: projectEnvironments.kind,
      isEnabled: projectEnvironments.isEnabled,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .where(eq(projectEnvironments.publicKey, batch.installationKey))
    .limit(1);

  if (!installation) return reject(404);
  if (!installation.isEnabled) return reject(403);
  if (!isOriginAllowed(origin.origin, installation.allowedOrigins)) {
    return reject(403);
  }

  const settings = await getOrCreateTelemetrySettings(
    installation.id,
    installation.workspaceId,
  );
  if (!settings || settings.collectionMode === "off" || settings.environmentKillSwitch) {
    return { ok: true, accepted: 0, dropped: batch.events.length, corsOrigin: origin.origin };
  }

  const originPool =
    settings.enabledOrigins.length > 0
      ? settings.enabledOrigins
      : installation.allowedOrigins;
  if (!isOriginAllowed(origin.origin, originPool)) {
    return reject(403);
  }

  const productionLike = installation.kind === "production";
  const testMode = settings.testModeEnabled && !productionLike;
  if (!productionLike && !testMode) {
    return { ok: true, accepted: 0, dropped: batch.events.length, corsOrigin: origin.origin };
  }

  const now = new Date();
  const period = currentUsagePeriod(now);
  const usage = await bumpUsageRead(installation.id, installation.workspaceId, period);

  const minuteRate = await enforceInstallationRateLimit({
    scope: "telemetry_env_minute",
    subjects: [installation.id],
  });
  if (!minuteRate.ok) {
    await markLimited(settings.id, usage.id);
    return {
      ok: true,
      accepted: 0,
      dropped: batch.events.length,
      corsOrigin: origin.origin,
    };
  }

  const remainingDay =
    TELEMETRY_LIMITS.eventsPerDayPerWorkspace - usage.workspaceAccepted;
  if (remainingDay <= 0 || usage.envAccepted >= TELEMETRY_LIMITS.rawRetainedEventsPerEnvironment) {
    await markLimited(settings.id, usage.id);
    return {
      ok: true,
      accepted: 0,
      dropped: batch.events.length,
      corsOrigin: origin.origin,
    };
  }

  const batchDedup = await insertDedup(
    installation.id,
    "batch",
    batch.batchId,
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
  );
  if (!batchDedup) {
    return { ok: true, accepted: 0, dropped: 0, corsOrigin: origin.origin };
  }

  const rows = [];
  let dropped = 0;
  let errorEvents = 0;
  let testEvents = 0;

  for (const event of batch.events) {
    if (event.batchId !== batch.batchId) {
      dropped += 1;
      continue;
    }
    const occurredAt = new Date(event.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      dropped += 1;
      continue;
    }
    if (now.getTime() - occurredAt.getTime() > TELEMETRY_LIMITS.maxStaleEventMs) {
      dropped += 1;
      continue;
    }
    if (occurredAt.getTime() - now.getTime() > TELEMETRY_LIMITS.maxFutureEventMs) {
      dropped += 1;
      continue;
    }

    const expectedConsent =
      settings.collectionMode === "strict_consent"
        ? "granted"
        : "aggregate_notice";
    if (event.consentState !== expectedConsent) {
      dropped += 1;
      continue;
    }

    const route = normalizeTelemetryRoute(event.route);
    if (isSensitiveRoute(route, settings.excludedRoutes)) {
      dropped += 1;
      continue;
    }

    if (event.sampling.percent !== settings.samplingPercent) {
      dropped += 1;
      continue;
    }

    const trafficKind: "test" | "production" =
      testMode || event.testMode ? "test" : "production";
    if (trafficKind === "test" && productionLike) {
      dropped += 1;
      continue;
    }
    if (trafficKind === "production" && !productionLike) {
      dropped += 1;
      continue;
    }

    if (
      event.eventType === "sanitized_javascript_error" &&
      !(ERROR_CATEGORIES as readonly string[]).includes(event.errorCategory)
    ) {
      dropped += 1;
      continue;
    }

    if (
      event.eventType === "sanitized_javascript_error" &&
      usage.errorEvents + errorEvents >= TELEMETRY_LIMITS.errorEventsPerDayPerEnvironment
    ) {
      dropped += 1;
      continue;
    }
    if (
      trafficKind === "test" &&
      usage.testEvents + testEvents >= TELEMETRY_LIMITS.testEventsPerDayPerEnvironment
    ) {
      dropped += 1;
      continue;
    }

    const eventDedup = await insertDedup(
      installation.id,
      "event",
      event.eventId,
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    if (!eventDedup) {
      dropped += 1;
      continue;
    }

    const click = event.eventType === "element_click" ? event : null;
    const scroll = event.eventType === "scroll_milestone" ? event : null;
    const error = event.eventType === "sanitized_javascript_error" ? event : null;
    const labeled =
      event.eventType === "element_click" ||
      event.eventType === "repeat_click_signal" ||
      event.eventType === "dead_click_candidate"
        ? event
        : null;

    rows.push({
      workspaceId: installation.workspaceId,
      projectId: installation.projectId,
      environmentId: installation.id,
      schemaVersion: event.schemaVersion,
      eventId: event.eventId,
      batchId: event.batchId,
      eventType: event.eventType,
      occurredAt,
      receivedAt: now,
      trafficKind,
      consentState: event.consentState,
      normalizedRoute: route,
      deploymentVersion: event.deploymentVersion.slice(0, 120),
      viewportGroup: event.viewportGroup,
      samplingPercent: event.sampling.percent,
      coordinateBucketX: click?.coordinateBucketX ?? null,
      coordinateBucketY: click?.coordinateBucketY ?? null,
      elementCategory: labeled?.elementCategory ?? null,
      analyticsLabel: labeled?.analyticsLabel ?? null,
      scrollMilestone: scroll?.scrollMilestone ?? null,
      errorCategory: error?.errorCategory ?? null,
      errorFingerprint: error?.errorFingerprint ?? null,
      sourceCategory: error?.sourceCategory ?? null,
      tabSessionHash: hashTabSession(installation.id, event.tabSession),
      hourBucket: hourBucketUtc(occurredAt),
      expiresAt: new Date(
        now.getTime() + settings.rawRetentionHours * 60 * 60 * 1000,
      ),
    });
    if (error) errorEvents += 1;
    if (trafficKind === "test") testEvents += 1;
  }

  const cap = Math.max(0, remainingDay);
  const acceptedRows = rows.slice(0, cap);
  dropped += rows.length - acceptedRows.length;

  if (acceptedRows.length > 0) {
    await db
      .insert(telemetryRawEvents)
      .values(acceptedRows)
      .onConflictDoNothing({ target: telemetryRawEvents.eventId });

    await db
      .update(environmentTelemetrySettings)
      .set({ lastAcceptedEventAt: now, updatedAt: now })
      .where(eq(environmentTelemetrySettings.id, settings.id));

    await db
      .update(telemetryUsageCounters)
      .set({
        acceptedEvents: sql`${telemetryUsageCounters.acceptedEvents} + ${acceptedRows.length}`,
        droppedEvents: sql`${telemetryUsageCounters.droppedEvents} + ${dropped}`,
        errorEvents: sql`${telemetryUsageCounters.errorEvents} + ${errorEvents}`,
        testEvents: sql`${telemetryUsageCounters.testEvents} + ${testEvents}`,
        updatedAt: now,
      })
      .where(eq(telemetryUsageCounters.id, usage.id));
  } else if (dropped > 0) {
    await db
      .update(telemetryUsageCounters)
      .set({
        droppedEvents: sql`${telemetryUsageCounters.droppedEvents} + ${dropped}`,
        updatedAt: now,
      })
      .where(eq(telemetryUsageCounters.id, usage.id));
  }

  return {
    ok: true,
    accepted: acceptedRows.length,
    dropped,
    corsOrigin: origin.origin,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function insertDedup(
  environmentId: string,
  kind: string,
  dedupKey: string,
  expiresAt: Date,
): Promise<boolean> {
  const inserted = await db
    .insert(telemetryIngestDedup)
    .values({ environmentId, kind, dedupKey, expiresAt })
    .onConflictDoNothing({
      target: [
        telemetryIngestDedup.environmentId,
        telemetryIngestDedup.kind,
        telemetryIngestDedup.dedupKey,
      ],
    })
    .returning({ id: telemetryIngestDedup.id });
  return inserted.length > 0;
}

async function bumpUsageRead(
  environmentId: string,
  workspaceId: string,
  period: { start: Date; end: Date },
) {
  const now = new Date();
  await db
    .insert(telemetryUsageCounters)
    .values({
      workspaceId,
      environmentId,
      periodStart: period.start,
      periodEnd: period.end,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        telemetryUsageCounters.environmentId,
        telemetryUsageCounters.periodStart,
      ],
    });

  const [envRow] = await db
    .select()
    .from(telemetryUsageCounters)
    .where(
      and(
        eq(telemetryUsageCounters.environmentId, environmentId),
        eq(telemetryUsageCounters.periodStart, period.start),
      ),
    )
    .limit(1);

  const workspaceRows = await db
    .select({
      accepted: telemetryUsageCounters.acceptedEvents,
    })
    .from(telemetryUsageCounters)
    .where(
      and(
        eq(telemetryUsageCounters.workspaceId, workspaceId),
        eq(telemetryUsageCounters.periodStart, period.start),
      ),
    );

  if (!envRow) {
    return {
      id: "missing",
      envAccepted: 0,
      errorEvents: 0,
      testEvents: 0,
      workspaceAccepted: 0,
    };
  }

  return {
    id: envRow.id,
    envAccepted: envRow.acceptedEvents,
    errorEvents: envRow.errorEvents,
    testEvents: envRow.testEvents,
    workspaceAccepted: workspaceRows.reduce((sum, row) => sum + row.accepted, 0),
  };
}

async function markLimited(settingsId: string, usageId: string) {
  const now = new Date();
  await db
    .update(telemetryUsageCounters)
    .set({ limitedAt: now, updatedAt: now })
    .where(eq(telemetryUsageCounters.id, usageId));
  void settingsId;
}

export type { ParsedTelemetryBatch };
