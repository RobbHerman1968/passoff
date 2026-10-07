import "server-only";

import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  environmentTelemetrySettings,
  telemetryAggregateSessions,
  telemetryAggregationCheckpoints,
  telemetryAggregates,
  telemetryIngestDedup,
  telemetryRawEvents,
} from "@/db/schema";
import { TELEMETRY_LIMITS } from "@/lib/telemetry/limits";
import { generateFindingsForEnvironment } from "@/lib/findings/generate";

const BATCH = 400;

export async function runTelemetryMaintenance(): Promise<{
  aggregated: number;
  deletedRaw: number;
  deletedAggregates: number;
  deletedAggregateSessions: number;
  deletedDedup: number;
}> {
  const environments = await db
    .select({
      environmentId: environmentTelemetrySettings.environmentId,
      workspaceId: environmentTelemetrySettings.workspaceId,
      projectId: environmentTelemetrySettings.projectId,
      aggregateRetentionDays: environmentTelemetrySettings.aggregateRetentionDays,
    })
    .from(environmentTelemetrySettings);

  let aggregated = 0;
  for (const environment of environments) {
    aggregated += await aggregateEnvironment(environment.environmentId);
    try {
      await generateFindingsForEnvironment(environment.environmentId);
    } catch {
      // Findings must not block aggregation or deletion.
    }
  }

  const now = new Date();
  const deletedRaw = await db
    .delete(telemetryRawEvents)
    .where(lte(telemetryRawEvents.expiresAt, now))
    .returning({ id: telemetryRawEvents.id });
  const deletedAggregates = await db
    .delete(telemetryAggregates)
    .where(lte(telemetryAggregates.expiresAt, now))
    .returning({ id: telemetryAggregates.id });
  const deletedAggregateSessions = await db
    .delete(telemetryAggregateSessions)
    .where(lte(telemetryAggregateSessions.expiresAt, now))
    .returning({ id: telemetryAggregateSessions.id });
  const deletedDedup = await db
    .delete(telemetryIngestDedup)
    .where(lte(telemetryIngestDedup.expiresAt, now))
    .returning({ id: telemetryIngestDedup.id });

  return {
    aggregated,
    deletedRaw: deletedRaw.length,
    deletedAggregates: deletedAggregates.length,
    deletedAggregateSessions: deletedAggregateSessions.length,
    deletedDedup: deletedDedup.length,
  };
}

async function aggregateEnvironment(environmentId: string): Promise<number> {
  const [settings] = await db
    .select()
    .from(environmentTelemetrySettings)
    .where(eq(environmentTelemetrySettings.environmentId, environmentId))
    .limit(1);
  if (!settings) return 0;

  let processed = 0;
  for (;;) {
    const batchSize = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(telemetryRawEvents)
        .where(
          and(
            eq(telemetryRawEvents.environmentId, environmentId),
            isNull(telemetryRawEvents.aggregatedAt),
          ),
        )
        .orderBy(telemetryRawEvents.receivedAt)
        .limit(BATCH)
        .for("update", { skipLocked: true });
      if (rows.length === 0) return 0;

      const grouped = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = [
          row.trafficKind,
          row.hourBucket.toISOString(),
          row.deploymentVersion,
          row.normalizedRoute,
          row.viewportGroup,
          row.eventType,
          row.elementCategory ?? "",
          row.analyticsLabel ?? "",
          String(row.coordinateBucketX ?? -1),
          String(row.coordinateBucketY ?? -1),
          String(row.scrollMilestone ?? -1),
          row.errorCategory ?? "",
          row.errorFingerprint ?? "",
        ].join("\u001f");
        const list = grouped.get(key) ?? [];
        list.push(row);
        grouped.set(key, list);
      }

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + settings.aggregateRetentionDays * 24 * 60 * 60 * 1000,
      );

      for (const group of grouped.values()) {
        const first = group[0];
        const occurred = group.map((row) => row.occurredAt.getTime());
        const dimensions = {
          workspaceId: first.workspaceId,
          projectId: first.projectId,
          environmentId: first.environmentId,
          trafficKind: first.trafficKind,
          hourBucket: first.hourBucket,
          deploymentVersion: first.deploymentVersion,
          normalizedRoute: first.normalizedRoute,
          viewportGroup: first.viewportGroup,
          eventType: first.eventType,
          elementCategory: first.elementCategory ?? "",
          analyticsLabel: first.analyticsLabel ?? "",
          coordinateBucketX: first.coordinateBucketX ?? -1,
          coordinateBucketY: first.coordinateBucketY ?? -1,
          scrollMilestone: first.scrollMilestone ?? -1,
          errorCategory: first.errorCategory ?? "",
          errorFingerprint: first.errorFingerprint ?? "",
        };
        await tx
        .insert(telemetryAggregates)
        .values({
          ...dimensions,
          eventCount: group.length,
          tabSessionCount: 0,
          firstOccurredAt: new Date(Math.min(...occurred)),
          lastOccurredAt: new Date(Math.max(...occurred)),
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            telemetryAggregates.environmentId,
            telemetryAggregates.trafficKind,
            telemetryAggregates.hourBucket,
            telemetryAggregates.deploymentVersion,
            telemetryAggregates.normalizedRoute,
            telemetryAggregates.viewportGroup,
            telemetryAggregates.eventType,
            telemetryAggregates.elementCategory,
            telemetryAggregates.analyticsLabel,
            telemetryAggregates.coordinateBucketX,
            telemetryAggregates.coordinateBucketY,
            telemetryAggregates.scrollMilestone,
            telemetryAggregates.errorCategory,
            telemetryAggregates.errorFingerprint,
          ],
          set: {
            eventCount: sql`${telemetryAggregates.eventCount} + ${group.length}`,
            firstOccurredAt: sql`least(${telemetryAggregates.firstOccurredAt}, ${new Date(Math.min(...occurred))})`,
            lastOccurredAt: sql`greatest(${telemetryAggregates.lastOccurredAt}, ${new Date(Math.max(...occurred))})`,
            expiresAt: sql`greatest(${telemetryAggregates.expiresAt}, ${expiresAt})`,
            updatedAt: now,
          },
        });

        const perSession = new Map<
          string,
          { hash: string; first: Date; last: Date }
        >();
        for (const row of group) {
          const current = perSession.get(row.tabSessionHash);
          if (!current) {
            perSession.set(row.tabSessionHash, {
              hash: row.tabSessionHash,
              first: row.occurredAt,
              last: row.occurredAt,
            });
          } else {
            if (row.occurredAt < current.first) current.first = row.occurredAt;
            if (row.occurredAt > current.last) current.last = row.occurredAt;
          }
        }
        for (const session of perSession.values()) {
          await tx
            .insert(telemetryAggregateSessions)
            .values({
              ...dimensions,
              tabSessionHash: session.hash,
              firstOccurredAt: session.first,
              lastOccurredAt: session.last,
              expiresAt,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                telemetryAggregateSessions.environmentId,
                telemetryAggregateSessions.trafficKind,
                telemetryAggregateSessions.hourBucket,
                telemetryAggregateSessions.deploymentVersion,
                telemetryAggregateSessions.normalizedRoute,
                telemetryAggregateSessions.viewportGroup,
                telemetryAggregateSessions.eventType,
                telemetryAggregateSessions.elementCategory,
                telemetryAggregateSessions.analyticsLabel,
                telemetryAggregateSessions.coordinateBucketX,
                telemetryAggregateSessions.coordinateBucketY,
                telemetryAggregateSessions.scrollMilestone,
                telemetryAggregateSessions.errorCategory,
                telemetryAggregateSessions.errorFingerprint,
                telemetryAggregateSessions.tabSessionHash,
              ],
              set: {
                firstOccurredAt: sql`least(${telemetryAggregateSessions.firstOccurredAt}, ${session.first})`,
                lastOccurredAt: sql`greatest(${telemetryAggregateSessions.lastOccurredAt}, ${session.last})`,
                expiresAt: sql`greatest(${telemetryAggregateSessions.expiresAt}, ${expiresAt})`,
                updatedAt: now,
              },
            });
        }
      }

      const ids = rows.map((row) => row.id);
      await tx
        .update(telemetryRawEvents)
        .set({ aggregatedAt: now })
        .where(inArray(telemetryRawEvents.id, ids));

      const last = rows[rows.length - 1];
      await tx
        .insert(telemetryAggregationCheckpoints)
        .values({
          environmentId,
          lastAggregatedAt: now,
          lastRawEventId: last.id,
          acceptedEventCount: rows.length,
          aggregatedEventCount: rows.length,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: telemetryAggregationCheckpoints.environmentId,
          set: {
            lastAggregatedAt: now,
            lastRawEventId: last.id,
            acceptedEventCount: sql`${telemetryAggregationCheckpoints.acceptedEventCount} + ${rows.length}`,
            aggregatedEventCount: sql`${telemetryAggregationCheckpoints.aggregatedEventCount} + ${rows.length}`,
            updatedAt: now,
          },
        });

      await tx
        .update(environmentTelemetrySettings)
        .set({ lastAggregatedAt: now, updatedAt: now })
        .where(eq(environmentTelemetrySettings.environmentId, environmentId));
      return rows.length;
    });
    if (batchSize === 0) break;
    processed += batchSize;
  }

  void TELEMETRY_LIMITS;
  return processed;
}
