import "server-only";

import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  environmentTelemetrySettings,
  projectEnvironments,
  projects,
  telemetryAggregateSessions,
  telemetryAggregates,
  telemetryUsageCounters,
} from "@/db/schema";
import { currentUsagePeriod } from "@/lib/telemetry/hash";
import { getOrCreateTelemetrySettings } from "@/lib/telemetry/settings";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type CollectionStatus =
  | "no_data_collected"
  | "waiting_for_consented_traffic"
  | "insufficient_sample"
  | "collecting_normally"
  | "collection_limited"
  | "collection_paused"
  | "configuration_needs_attention";

function aggregateDimensionKey(row: {
  elementCategory: string;
  analyticsLabel: string;
  coordinateBucketX: number;
  coordinateBucketY: number;
  scrollMilestone: number;
  errorCategory: string;
}) {
  return [
    row.elementCategory,
    row.analyticsLabel,
    row.coordinateBucketX,
    row.coordinateBucketY,
    row.scrollMilestone,
    row.errorCategory,
  ].join("\u001f");
}

export async function listWorkspaceEnvironments(context: WorkspaceContext) {
  return db
    .select({
      id: projectEnvironments.id,
      projectId: projectEnvironments.projectId,
      projectName: projects.name,
      name: projectEnvironments.name,
      kind: projectEnvironments.kind,
      baseUrl: projectEnvironments.baseUrl,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectEnvironments.projectId),
        eq(projects.workspaceId, context.workspaceId),
      ),
    )
    .where(eq(projectEnvironments.workspaceId, context.workspaceId));
}

export async function getTelemetryStatus(
  context: WorkspaceContext,
  environmentId: string,
) {
  const [environment] = await db
    .select()
    .from(projectEnvironments)
    .where(
      and(
        eq(projectEnvironments.id, environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!environment) return null;
  const settings = await getOrCreateTelemetrySettings(
    environmentId,
    context.workspaceId,
  );
  if (!settings) return null;
  const period = currentUsagePeriod();
  const [usage] = await db
    .select()
    .from(telemetryUsageCounters)
    .where(
      and(
        eq(telemetryUsageCounters.environmentId, environmentId),
        eq(telemetryUsageCounters.periodStart, period.start),
      ),
    )
    .limit(1);

  let status: CollectionStatus = "no_data_collected";
  if (settings.environmentKillSwitch) status = "collection_paused";
  else if (settings.collectionMode === "off") status = "no_data_collected";
  else if (!environment.isEnabled) status = "configuration_needs_attention";
  else if (usage?.limitedAt) status = "collection_limited";
  else if (!settings.lastAcceptedEventAt) {
    status =
      settings.collectionMode === "strict_consent"
        ? "waiting_for_consented_traffic"
        : "waiting_for_consented_traffic";
  } else {
    status = "collecting_normally";
  }

  return {
    environment,
    settings,
    usage,
    status,
    period,
  };
}

export async function queryBehavioralAggregates(
  context: WorkspaceContext,
  input: {
    environmentId: string;
    route: string;
    version: string;
    viewport: "mobile" | "tablet" | "desktop";
    start: Date;
    end: Date;
    eventType:
      | "element_click"
      | "scroll_milestone"
      | "repeat_click_signal"
      | "dead_click_candidate"
      | "sanitized_javascript_error";
  },
) {
  const settings = await getOrCreateTelemetrySettings(
    input.environmentId,
    context.workspaceId,
  );
  if (!settings) return { state: "no_data_collected" as const };

  const rows = await db
    .select({
      elementCategory: telemetryAggregates.elementCategory,
      analyticsLabel: telemetryAggregates.analyticsLabel,
      coordinateBucketX: telemetryAggregates.coordinateBucketX,
      coordinateBucketY: telemetryAggregates.coordinateBucketY,
      scrollMilestone: telemetryAggregates.scrollMilestone,
      errorCategory: telemetryAggregates.errorCategory,
      eventCount: sql<number>`sum(${telemetryAggregates.eventCount})`.mapWith(Number),
    })
    .from(telemetryAggregates)
    .where(
      and(
        eq(telemetryAggregates.workspaceId, context.workspaceId),
        eq(telemetryAggregates.environmentId, input.environmentId),
        eq(telemetryAggregates.trafficKind, "production"),
        eq(telemetryAggregates.normalizedRoute, input.route),
        eq(telemetryAggregates.deploymentVersion, input.version),
        eq(telemetryAggregates.viewportGroup, input.viewport),
        eq(telemetryAggregates.eventType, input.eventType),
        gte(telemetryAggregates.hourBucket, input.start),
        lte(telemetryAggregates.hourBucket, input.end),
      ),
    )
    .groupBy(
      telemetryAggregates.elementCategory,
      telemetryAggregates.analyticsLabel,
      telemetryAggregates.coordinateBucketX,
      telemetryAggregates.coordinateBucketY,
      telemetryAggregates.scrollMilestone,
      telemetryAggregates.errorCategory,
    );

  const sessionRows = await db
    .select({
      elementCategory: telemetryAggregateSessions.elementCategory,
      analyticsLabel: telemetryAggregateSessions.analyticsLabel,
      coordinateBucketX: telemetryAggregateSessions.coordinateBucketX,
      coordinateBucketY: telemetryAggregateSessions.coordinateBucketY,
      scrollMilestone: telemetryAggregateSessions.scrollMilestone,
      errorCategory: telemetryAggregateSessions.errorCategory,
      tabSessionCount:
        sql<number>`count(distinct ${telemetryAggregateSessions.tabSessionHash})`.mapWith(
          Number,
        ),
    })
    .from(telemetryAggregateSessions)
    .where(
      and(
        eq(telemetryAggregateSessions.workspaceId, context.workspaceId),
        eq(telemetryAggregateSessions.environmentId, input.environmentId),
        eq(telemetryAggregateSessions.trafficKind, "production"),
        eq(telemetryAggregateSessions.normalizedRoute, input.route),
        eq(telemetryAggregateSessions.deploymentVersion, input.version),
        eq(telemetryAggregateSessions.viewportGroup, input.viewport),
        eq(telemetryAggregateSessions.eventType, input.eventType),
        gte(telemetryAggregateSessions.hourBucket, input.start),
        lte(telemetryAggregateSessions.hourBucket, input.end),
      ),
    )
    .groupBy(
      telemetryAggregateSessions.elementCategory,
      telemetryAggregateSessions.analyticsLabel,
      telemetryAggregateSessions.coordinateBucketX,
      telemetryAggregateSessions.coordinateBucketY,
      telemetryAggregateSessions.scrollMilestone,
      telemetryAggregateSessions.errorCategory,
    );
  const sessionCounts = new Map(
    sessionRows.map((row) => [aggregateDimensionKey(row), row.tabSessionCount]),
  );
  const rowsWithSessions = rows.map((row) => ({
    ...row,
    tabSessionCount: sessionCounts.get(aggregateDimensionKey(row)) ?? 0,
  }));

  const [views] = await db
    .select({
      sessions:
        sql<number>`count(distinct ${telemetryAggregateSessions.tabSessionHash})`.mapWith(
          Number,
        ),
    })
    .from(telemetryAggregateSessions)
    .where(
      and(
        eq(telemetryAggregateSessions.workspaceId, context.workspaceId),
        eq(telemetryAggregateSessions.environmentId, input.environmentId),
        eq(telemetryAggregateSessions.trafficKind, "production"),
        eq(telemetryAggregateSessions.normalizedRoute, input.route),
        eq(telemetryAggregateSessions.deploymentVersion, input.version),
        eq(telemetryAggregateSessions.viewportGroup, input.viewport),
        eq(telemetryAggregateSessions.eventType, "page_view"),
        gte(telemetryAggregateSessions.hourBucket, input.start),
        lte(telemetryAggregateSessions.hourBucket, input.end),
      ),
    );

  const eligible = views?.sessions ?? 0;
  if (settings.collectionMode === "off" && eligible === 0) {
    return { state: "no_data_collected" as const, settings };
  }
  if (eligible === 0) {
    return { state: "waiting_for_traffic" as const, settings, rows: [] };
  }
  if (eligible < settings.minSampleSessions) {
    return {
      state: "insufficient_sample" as const,
      settings,
      eligible,
      min: settings.minSampleSessions,
    };
  }
  return {
    state: "data_available" as const,
    settings,
    eligible,
    rows: rowsWithSessions,
  };
}

export async function queryClickAggregates(
  context: WorkspaceContext,
  input: {
    environmentId: string;
    route: string;
    version: string;
    viewport: "mobile" | "tablet" | "desktop";
    start: Date;
    end: Date;
  },
) {
  return queryBehavioralAggregates(context, {
    ...input,
    eventType: "element_click",
  });
}

export { environmentTelemetrySettings };
