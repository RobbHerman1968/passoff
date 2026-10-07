import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activityEvents,
  behavioralFindings,
  environmentTelemetrySettings,
  telemetryAggregateSessions,
  telemetryAggregates,
} from "@/db/schema";
import {
  evaluateFindingCandidates,
  FINDING_RULE_VERSION,
  type AggregateGroup,
} from "@/lib/findings/rules";
import { FINDING_ACTIVITY } from "@/lib/telemetry/limits";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";

const ACTIVE_DISPOSITIONS = [
  "needs_review",
  "watching",
  "attached_to_issue",
  "issue_created",
] as const;

function findingGroupKey(row: {
  normalizedRoute: string;
  deploymentVersion: string;
  viewportGroup: string;
  eventType: string;
  elementCategory: string;
  analyticsLabel: string;
  errorCategory: string;
  errorFingerprint: string;
  scrollMilestone: number;
}) {
  return [
    row.normalizedRoute,
    row.deploymentVersion,
    row.viewportGroup,
    row.eventType,
    row.elementCategory,
    row.analyticsLabel,
    row.errorCategory,
    row.errorFingerprint,
    row.scrollMilestone,
  ].join("\u001f");
}

export async function generateFindingsForEnvironment(
  environmentId: string,
): Promise<number> {
  const [settings] = await db
    .select()
    .from(environmentTelemetrySettings)
    .where(eq(environmentTelemetrySettings.environmentId, environmentId))
    .limit(1);
  if (!settings || settings.collectionMode === "off") return 0;

  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = await db
    .select({
      normalizedRoute: telemetryAggregates.normalizedRoute,
      deploymentVersion: telemetryAggregates.deploymentVersion,
      viewportGroup: telemetryAggregates.viewportGroup,
      eventType: telemetryAggregates.eventType,
      elementCategory: telemetryAggregates.elementCategory,
      analyticsLabel: telemetryAggregates.analyticsLabel,
      errorCategory: telemetryAggregates.errorCategory,
      errorFingerprint: telemetryAggregates.errorFingerprint,
      scrollMilestone: telemetryAggregates.scrollMilestone,
      eventCount: sql<number>`sum(${telemetryAggregates.eventCount})`.mapWith(Number),
    })
    .from(telemetryAggregates)
    .where(
      and(
        eq(telemetryAggregates.environmentId, environmentId),
        eq(telemetryAggregates.trafficKind, "production"),
        gte(telemetryAggregates.hourBucket, start),
        lte(telemetryAggregates.hourBucket, end),
      ),
    )
    .groupBy(
      telemetryAggregates.normalizedRoute,
      telemetryAggregates.deploymentVersion,
      telemetryAggregates.viewportGroup,
      telemetryAggregates.eventType,
      telemetryAggregates.elementCategory,
      telemetryAggregates.analyticsLabel,
      telemetryAggregates.errorCategory,
      telemetryAggregates.errorFingerprint,
      telemetryAggregates.scrollMilestone,
    );

  const sessionGroups = await db
    .select({
      normalizedRoute: telemetryAggregateSessions.normalizedRoute,
      deploymentVersion: telemetryAggregateSessions.deploymentVersion,
      viewportGroup: telemetryAggregateSessions.viewportGroup,
      eventType: telemetryAggregateSessions.eventType,
      elementCategory: telemetryAggregateSessions.elementCategory,
      analyticsLabel: telemetryAggregateSessions.analyticsLabel,
      errorCategory: telemetryAggregateSessions.errorCategory,
      errorFingerprint: telemetryAggregateSessions.errorFingerprint,
      scrollMilestone: telemetryAggregateSessions.scrollMilestone,
      tabSessionCount:
        sql<number>`count(distinct ${telemetryAggregateSessions.tabSessionHash})`.mapWith(
          Number,
        ),
    })
    .from(telemetryAggregateSessions)
    .where(
      and(
        eq(telemetryAggregateSessions.environmentId, environmentId),
        eq(telemetryAggregateSessions.trafficKind, "production"),
        gte(telemetryAggregateSessions.hourBucket, start),
        lte(telemetryAggregateSessions.hourBucket, end),
      ),
    )
    .groupBy(
      telemetryAggregateSessions.normalizedRoute,
      telemetryAggregateSessions.deploymentVersion,
      telemetryAggregateSessions.viewportGroup,
      telemetryAggregateSessions.eventType,
      telemetryAggregateSessions.elementCategory,
      telemetryAggregateSessions.analyticsLabel,
      telemetryAggregateSessions.errorCategory,
      telemetryAggregateSessions.errorFingerprint,
      telemetryAggregateSessions.scrollMilestone,
    );
  const distinctSessions = new Map(
    sessionGroups.map((row) => [findingGroupKey(row), row.tabSessionCount]),
  );
  const groupsWithSessions = groups.map((row) => ({
    ...row,
    tabSessionCount: distinctSessions.get(findingGroupKey(row)) ?? 0,
  }));

  const candidates = evaluateFindingCandidates(
    groupsWithSessions as AggregateGroup[],
    settings.minSampleSessions,
  );

  let created = 0;
  for (const candidate of candidates) {
    created += await persistCandidate({
      settings,
      candidate,
      start,
      end,
    });
  }
  return created;
}

async function persistCandidate(input: {
  settings: typeof environmentTelemetrySettings.$inferSelect;
  candidate: ReturnType<typeof evaluateFindingCandidates>[number];
  start: Date;
  end: Date;
}): Promise<number> {
  const now = new Date();
  const [existing] = await db
    .select({
      id: behavioralFindings.id,
      disposition: behavioralFindings.disposition,
    })
    .from(behavioralFindings)
    .where(
      and(
        eq(behavioralFindings.environmentId, input.settings.environmentId),
        eq(behavioralFindings.scopeKey, input.candidate.scopeKey),
        inArray(behavioralFindings.disposition, [...ACTIVE_DISPOSITIONS]),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.disposition === "needs_review" || existing.disposition === "watching") {
      await db
        .update(behavioralFindings)
        .set({
          title: input.candidate.title,
          explanation: input.candidate.explanation,
          uncertainty: input.candidate.uncertainty,
          metricValue: input.candidate.metricValue.toFixed(6),
          denominatorValue: input.candidate.denominatorValue,
          eventCount: input.candidate.eventCount,
          eligibleSessionCount: input.candidate.eligibleSessionCount,
          windowStart: input.start,
          windowEnd: input.end,
          samplingPercent: input.settings.samplingPercent,
          updatedAt: now,
        })
        .where(eq(behavioralFindings.id, existing.id));
    }
    return 0;
  }

  const [inserted] = await db
    .insert(behavioralFindings)
    .values({
      workspaceId: input.settings.workspaceId,
      projectId: input.settings.projectId,
      environmentId: input.settings.environmentId,
      findingType: input.candidate.findingType,
      ruleVersion: FINDING_RULE_VERSION,
      scopeKey: input.candidate.scopeKey,
      title: input.candidate.title,
      explanation: input.candidate.explanation,
      uncertainty: input.candidate.uncertainty,
      normalizedRoute: input.candidate.normalizedRoute,
      deploymentVersion: input.candidate.deploymentVersion,
      viewportGroup: input.candidate.viewportGroup,
      windowStart: input.start,
      windowEnd: input.end,
      elementCategory: input.candidate.elementCategory,
      analyticsLabel: input.candidate.analyticsLabel,
      metricName: input.candidate.metricName,
      metricValue: input.candidate.metricValue.toFixed(6),
      denominatorName: input.candidate.denominatorName,
      denominatorValue: input.candidate.denominatorValue,
      eventCount: input.candidate.eventCount,
      eligibleSessionCount: input.candidate.eligibleSessionCount,
      samplingPercent: input.settings.samplingPercent,
      coverageStatus: "data_available",
      dataQuality: "meets_minimum_sample",
      disposition: "needs_review",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: behavioralFindings.id });

  if (!inserted) return 0;

  await db.insert(activityEvents).values({
    workspaceId: input.settings.workspaceId,
    projectId: input.settings.projectId,
    actorUserId: null,
    type: FINDING_ACTIVITY.created,
    data: {
      findingId: inserted.id,
      findingType: input.candidate.findingType,
      ruleVersion: FINDING_RULE_VERSION,
    },
  });

  await enqueueWebhookEventSafely({
    eventId: inserted.id,
    subscribedType: "behavioral_finding.created",
    eventType: "behavioral_finding.created",
    occurredAt: now.toISOString(),
    workspaceId: input.settings.workspaceId,
    projectId: input.settings.projectId,
    reviewId: null,
    issueId: null,
    issueNumber: null,
    actor: { type: "system", name: "Passoff" },
    data: {
      findingType: input.candidate.findingType,
      route: input.candidate.normalizedRoute,
      environmentId: input.settings.environmentId,
      deploymentVersion: input.candidate.deploymentVersion,
      viewportGroup: input.candidate.viewportGroup,
      eligibleSessionCount: input.candidate.eligibleSessionCount,
      metricName: input.candidate.metricName,
      metricValue: Number(input.candidate.metricValue.toFixed(6)),
      ruleVersion: FINDING_RULE_VERSION,
    },
  });

  return 1;
}
