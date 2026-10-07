import "server-only";

import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activityEvents,
  behavioralAiAnalyses,
  behavioralComparisons,
  behavioralEvidenceSnapshots,
  behavioralFindings,
  issueAnchors,
  issues,
  pages,
  projectEnvironments,
  reviews,
  telemetryAggregateSessions,
  type BehavioralFindingDisposition,
  type BehavioralFindingType,
} from "@/db/schema";
import { analyzeFindingWithOpenAI } from "@/lib/findings/ai";
import {
  aiInputContainsProhibitedFields,
  buildSafeAiInput,
  redactIssueText,
} from "@/lib/findings/ai-input";
import { compareRates } from "@/lib/findings/compare";
import { suggestedIssueBody } from "@/lib/findings/copy";
import { FINDING_RULE_VERSION } from "@/lib/findings/rules";
import {
  buildEvidenceSnapshotPayload,
  snapshotContainsProhibitedFields,
} from "@/lib/findings/snapshot";
import { createIssue } from "@/lib/issues/service";
import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";
import {
  OPEN_ISSUE_STATUSES,
  type IssuePriority,
} from "@/lib/issues/statuses";
import { updateIssueTriageAssignee } from "@/lib/issues/triage";
import { issueDetailPath } from "@/lib/issues/url";
import {
  notifyBehavioralAnalysisFailed,
  notifyBehavioralComparisonReady,
  notifyBehavioralFindingAttached,
} from "@/lib/notifications/events";
import { canMutateProjects } from "@/lib/projects/permissions";
import { sha256Hex } from "@/lib/telemetry/hash";
import {
  BEHAVIORAL_AI_LIMITS,
  FINDING_ACTIVITY,
} from "@/lib/telemetry/limits";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type FindingListFilters = {
  environmentId?: string;
  findingType?: BehavioralFindingType;
  disposition?: BehavioralFindingDisposition;
  route?: string;
  version?: string;
  viewport?: "mobile" | "tablet" | "desktop";
  related?: "related" | "unrelated";
  dataQuality?: string;
  start?: Date;
  end?: Date;
};

function isAiKillSwitchOn(): boolean {
  return process.env.PASSOFF_BEHAVIORAL_AI_KILL_SWITCH === "true";
}

async function loadFinding(
  context: WorkspaceContext,
  findingId: string,
) {
  const [row] = await db
    .select()
    .from(behavioralFindings)
    .where(
      and(
        eq(behavioralFindings.id, findingId),
        eq(behavioralFindings.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listFindings(
  context: WorkspaceContext,
  filters: FindingListFilters,
) {
  const conditions = [eq(behavioralFindings.workspaceId, context.workspaceId)];
  if (filters.environmentId) {
    conditions.push(eq(behavioralFindings.environmentId, filters.environmentId));
  }
  if (filters.findingType) {
    conditions.push(eq(behavioralFindings.findingType, filters.findingType));
  }
  if (filters.disposition) {
    conditions.push(eq(behavioralFindings.disposition, filters.disposition));
  }
  if (filters.route) {
    conditions.push(eq(behavioralFindings.normalizedRoute, filters.route));
  }
  if (filters.version) {
    conditions.push(eq(behavioralFindings.deploymentVersion, filters.version));
  }
  if (filters.viewport) {
    conditions.push(eq(behavioralFindings.viewportGroup, filters.viewport));
  }
  if (filters.related === "related") {
    conditions.push(sql`${behavioralFindings.relatedIssueId} is not null`);
  }
  if (filters.related === "unrelated") {
    conditions.push(sql`${behavioralFindings.relatedIssueId} is null`);
  }
  if (filters.dataQuality) {
    conditions.push(eq(behavioralFindings.dataQuality, filters.dataQuality));
  }
  if (filters.start) {
    conditions.push(gte(behavioralFindings.windowEnd, filters.start));
  }
  if (filters.end) {
    conditions.push(lte(behavioralFindings.windowStart, filters.end));
  }

  return db
    .select({
      finding: behavioralFindings,
      environmentName: projectEnvironments.name,
      environmentKind: projectEnvironments.kind,
    })
    .from(behavioralFindings)
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, behavioralFindings.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(behavioralFindings.updatedAt))
    .limit(100);
}

export async function relatedIssueForFinding(
  context: WorkspaceContext,
  finding: typeof behavioralFindings.$inferSelect,
) {
  if (!finding.relatedIssueId) return null;
  const [issue] = await db
    .select({
      id: issues.id,
      number: issues.number,
      reviewId: issues.reviewId,
      projectId: issues.projectId,
      status: issues.status,
      body: issues.body,
      deletedAt: issues.deletedAt,
    })
    .from(issues)
    .where(
      and(
        eq(issues.id, finding.relatedIssueId),
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, finding.projectId),
      ),
    )
    .limit(1);
  if (!issue || issue.deletedAt) return null;
  return {
    ...issue,
    href: issueDetailPath(issue.projectId, issue.reviewId, issue.number),
    displayTitle: deriveIssueDisplayTitle(issue.body),
  };
}

export async function createIssueFromFinding(
  context: WorkspaceContext,
  input: {
    findingId: string;
    reviewId: string;
    title: string;
    description: string;
    priority: IssuePriority;
    assigneeUserId: string | null;
    includeInvestigationSteps: boolean;
    investigationSteps: string[];
    confirmed: boolean;
  },
): Promise<
  | { ok: true; issue: { id: string; number: number; href: string; existing: boolean } }
  | { ok: false; error: string; message: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden", message: "You cannot create issues in this workspace." };
  }
  if (!input.confirmed) {
    return {
      ok: false,
      error: "confirmation_required",
      message: "Review the suggested issue and confirm before creating it.",
    };
  }

  const finding = await loadFinding(context, input.findingId);
  if (!finding) {
    return { ok: false, error: "not_found", message: "That finding isn’t available." };
  }

  const existing = await relatedIssueForFinding(context, finding);
  if (existing && (finding.disposition === "issue_created" || finding.disposition === "attached_to_issue")) {
    return {
      ok: true,
      issue: {
        id: existing.id,
        number: existing.number,
        href: existing.href,
        existing: true,
      },
    };
  }

  const [review] = await db
    .select({
      id: reviews.id,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.workspaceId, context.workspaceId),
        eq(reviews.projectId, finding.projectId),
      ),
    )
    .limit(1);
  if (!review) {
    return { ok: false, error: "not_found", message: "Choose a review in the same project." };
  }

  const title = input.title.trim() || finding.title;
  const description = input.description.trim();
  const body = suggestedIssueBody({
    title,
    explanation: description || finding.explanation,
    uncertainty: finding.uncertainty,
    environmentName: "selected environment",
    route: finding.normalizedRoute,
    version: finding.deploymentVersion,
    viewport: finding.viewportGroup,
    includeInvestigationSteps: input.includeInvestigationSteps,
    investigationSteps: input.investigationSteps,
  });

  const created = await createIssue(context, {
    reviewId: review.id,
    body,
    priority: input.priority,
  });
  if (!created.ok) {
    return {
      ok: false,
      error: created.error,
      message: "We couldn’t create that issue. Try again.",
    };
  }

  if (input.assigneeUserId) {
    const [fresh] = await db
      .select({ version: issues.version })
      .from(issues)
      .where(eq(issues.id, created.issue.id))
      .limit(1);
    await updateIssueTriageAssignee(context, {
      projectId: review.projectId,
      reviewId: review.id,
      issueNumber: created.issue.number,
      version: fresh?.version ?? 1,
      assigneeUserId: input.assigneeUserId,
    });
  }

  await attachSnapshotAndLink({
    context,
    finding,
    issueId: created.issue.id,
    issueNumber: created.issue.number,
    reviewId: review.id,
    projectId: review.projectId,
    disposition: "issue_created",
  });

  return {
    ok: true,
    issue: {
      id: created.issue.id,
      number: created.issue.number,
      href: issueDetailPath(review.projectId, review.id, created.issue.number),
      existing: false,
    },
  };
}

export async function suggestIssuesForFinding(
  context: WorkspaceContext,
  findingId: string,
) {
  const finding = await loadFinding(context, findingId);
  if (!finding) return [];

  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      body: issues.body,
      status: issues.status,
      reviewId: issues.reviewId,
      projectId: issues.projectId,
      environmentId: issues.environmentId,
      pageRoute: sql<string | null>`coalesce(${issueAnchors.route}, ${pages.normalizedRoute})`,
    })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .where(
      and(
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, finding.projectId),
        isNull(issues.deletedAt),
        inArray(issues.status, [...OPEN_ISSUE_STATUSES]),
      ),
    )
    .orderBy(desc(issues.updatedAt))
    .limit(40);

  return rows
    .map((row) => {
      let score = 0;
      if (row.environmentId === finding.environmentId) score += 5;
      if (row.pageRoute === finding.normalizedRoute) score += 4;
      if (
        finding.analyticsLabel &&
        row.body.toLowerCase().includes(finding.analyticsLabel.toLowerCase())
      ) {
        score += 2;
      }
      if (OPEN_ISSUE_STATUSES.includes(row.status as (typeof OPEN_ISSUE_STATUSES)[number])) {
        score += 1;
      }
      return {
        id: row.id,
        number: row.number,
        displayTitle: deriveIssueDisplayTitle(row.body),
        status: row.status,
        href: issueDetailPath(row.projectId, row.reviewId, row.number),
        reviewId: row.reviewId,
        projectId: row.projectId,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export async function searchIssuesForFinding(
  context: WorkspaceContext,
  findingId: string,
  query: string,
) {
  const finding = await loadFinding(context, findingId);
  if (!finding) return [];
  const pattern = `%${query.replace(/[%_]/g, "\\$&").trim()}%`;
  if (query.trim().length < 1) return suggestIssuesForFinding(context, findingId);

  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      body: issues.body,
      status: issues.status,
      reviewId: issues.reviewId,
      projectId: issues.projectId,
    })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, finding.projectId),
        isNull(issues.deletedAt),
        or(
          ilike(issues.body, pattern),
          sql`${issues.number}::text = ${query.trim()}`,
        ),
      ),
    )
    .orderBy(desc(issues.updatedAt))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    displayTitle: deriveIssueDisplayTitle(row.body),
    status: row.status,
    href: issueDetailPath(row.projectId, row.reviewId, row.number),
    reviewId: row.reviewId,
    projectId: row.projectId,
    score: 0,
  }));
}

export async function attachFindingToIssue(
  context: WorkspaceContext,
  input: {
    findingId: string;
    issueId: string;
    confirmed: boolean;
  },
): Promise<{ ok: true; existing: boolean } | { ok: false; error: string; message: string }> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden", message: "You cannot attach findings in this workspace." };
  }
  if (!input.confirmed) {
    return {
      ok: false,
      error: "confirmation_required",
      message: "Select an issue and confirm before attaching this evidence.",
    };
  }

  const finding = await loadFinding(context, input.findingId);
  if (!finding) {
    return { ok: false, error: "not_found", message: "That finding isn’t available." };
  }

  const [issue] = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.id, input.issueId),
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, finding.projectId),
        isNull(issues.deletedAt),
      ),
    )
    .limit(1);
  if (!issue) {
    return { ok: false, error: "not_found", message: "That issue isn’t available in this project." };
  }

  const [existingSnapshot] = await db
    .select({ id: behavioralEvidenceSnapshots.id })
    .from(behavioralEvidenceSnapshots)
    .where(
      and(
        eq(behavioralEvidenceSnapshots.findingId, finding.id),
        eq(behavioralEvidenceSnapshots.issueId, issue.id),
      ),
    )
    .limit(1);
  if (existingSnapshot) {
    return { ok: true, existing: true };
  }

  await attachSnapshotAndLink({
    context,
    finding,
    issueId: issue.id,
    issueNumber: issue.number,
    reviewId: issue.reviewId,
    projectId: issue.projectId,
    disposition: "attached_to_issue",
  });

  await notifyBehavioralFindingAttached({
    context,
    projectId: issue.projectId,
    reviewId: issue.reviewId,
    issueId: issue.id,
    issueNumber: issue.number,
    assigneeUserId: issue.assigneeUserId,
    authorUserId: issue.authorUserId,
  });

  return { ok: true, existing: false };
}

async function attachSnapshotAndLink(input: {
  context: WorkspaceContext;
  finding: typeof behavioralFindings.$inferSelect;
  issueId: string;
  issueNumber: number;
  reviewId: string;
  projectId: string;
  disposition: "issue_created" | "attached_to_issue";
}) {
  const now = new Date();
  const payload = buildEvidenceSnapshotPayload(input.finding, now);
  if (snapshotContainsProhibitedFields(payload)) {
    throw new Error("prohibited_snapshot_fields");
  }

  await db
    .insert(behavioralEvidenceSnapshots)
    .values({
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      environmentId: input.finding.environmentId,
      findingId: input.finding.id,
      issueId: input.issueId,
      reviewId: input.reviewId,
      payload,
      createdByUserId: input.context.userId,
      createdAt: now,
    })
    .onConflictDoNothing();

  await db
    .update(behavioralFindings)
    .set({
      relatedIssueId: input.issueId,
      relatedReviewId: input.reviewId,
      disposition: input.disposition,
      updatedAt: now,
    })
    .where(
      and(
        eq(behavioralFindings.id, input.finding.id),
        eq(behavioralFindings.workspaceId, input.context.workspaceId),
      ),
    );

  await db.insert(activityEvents).values({
    workspaceId: input.context.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    issueId: input.issueId,
    actorUserId: input.context.userId,
    type: FINDING_ACTIVITY.attached,
    data: {
      findingId: input.finding.id,
      findingType: input.finding.findingType,
      disposition: input.disposition,
    },
    createdAt: now,
  });

  await enqueueWebhookEventSafely({
    eventId: `${input.finding.id}:${input.issueId}:attached`,
    subscribedType: "behavioral_finding.attached",
    eventType: "behavioral_finding.attached",
    occurredAt: now.toISOString(),
    workspaceId: input.context.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    issueId: input.issueId,
    issueNumber: input.issueNumber,
    actor: { type: "user", name: input.context.userName ?? "Workspace member" },
    data: {
      findingType: input.finding.findingType,
      route: input.finding.normalizedRoute,
      deploymentVersion: input.finding.deploymentVersion,
      viewportGroup: input.finding.viewportGroup,
      eligibleSessionCount: input.finding.eligibleSessionCount,
      metricName: input.finding.metricName,
      metricValue: Number(input.finding.metricValue),
      ruleVersion: FINDING_RULE_VERSION,
    },
  });
}

export async function listIssueBehavioralEvidence(
  context: WorkspaceContext,
  issueId: string,
) {
  return db
    .select()
    .from(behavioralEvidenceSnapshots)
    .where(
      and(
        eq(behavioralEvidenceSnapshots.issueId, issueId),
        eq(behavioralEvidenceSnapshots.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(desc(behavioralEvidenceSnapshots.createdAt));
}

export async function listIssueComparisons(
  context: WorkspaceContext,
  issueId: string,
) {
  return db
    .select()
    .from(behavioralComparisons)
    .where(
      and(
        eq(behavioralComparisons.issueId, issueId),
        eq(behavioralComparisons.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(desc(behavioralComparisons.createdAt));
}

export async function requestBehavioralComparison(
  context: WorkspaceContext,
  input: {
    issueId: string;
    snapshotId: string;
    comparisonVersion: string;
    viewportGroup: "mobile" | "tablet" | "desktop";
    metricName: string;
  },
) {
  if (!canMutateProjects(context)) {
    return { ok: false as const, message: "You cannot request a comparison in this workspace." };
  }

  const [snapshot] = await db
    .select()
    .from(behavioralEvidenceSnapshots)
    .where(
      and(
        eq(behavioralEvidenceSnapshots.id, input.snapshotId),
        eq(behavioralEvidenceSnapshots.issueId, input.issueId),
        eq(behavioralEvidenceSnapshots.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!snapshot) {
    return { ok: false as const, message: "Choose a recorded evidence snapshot." };
  }

  const payload = snapshot.payload as Record<string, unknown>;
  const [inserted] = await db
    .insert(behavioralComparisons)
    .values({
      workspaceId: context.workspaceId,
      projectId: snapshot.projectId,
      environmentId: snapshot.environmentId,
      issueId: input.issueId,
      findingId: snapshot.findingId,
      baselineSnapshotId: snapshot.id,
      baselineVersion: String(payload.deploymentVersion ?? ""),
      comparisonVersion: input.comparisonVersion,
      metricName: input.metricName,
      viewportGroup: input.viewportGroup,
      outcome: "not_enough_data",
      summary: "Waiting for enough eligible sessions on the new version.",
      requestedByUserId: context.userId,
    })
    .returning();

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: snapshot.projectId,
    issueId: input.issueId,
    actorUserId: context.userId,
    type: FINDING_ACTIVITY.comparisonRequested,
    data: {
      comparisonId: inserted.id,
      comparisonVersion: input.comparisonVersion,
    },
  });

  await completeComparison(inserted.id);
  return { ok: true as const, comparisonId: inserted.id };
}

export async function completePendingComparisons(): Promise<number> {
  const pending = await db
    .select({ id: behavioralComparisons.id })
    .from(behavioralComparisons)
    .where(isNull(behavioralComparisons.readyAt))
    .limit(50);
  let completed = 0;
  for (const row of pending) {
    completed += await completeComparison(row.id);
  }
  return completed;
}

async function completeComparison(comparisonId: string): Promise<number> {
  const [comparison] = await db
    .select()
    .from(behavioralComparisons)
    .where(eq(behavioralComparisons.id, comparisonId))
    .limit(1);
  if (!comparison) return 0;

  const [snapshot] = await db
    .select()
    .from(behavioralEvidenceSnapshots)
    .where(eq(behavioralEvidenceSnapshots.id, comparison.baselineSnapshotId))
    .limit(1);
  if (!snapshot) return 0;
  const payload = snapshot.payload as Record<string, unknown>;
  const route = String(payload.route ?? "");
  const metricName = comparison.metricName;
  const minSample = 10;

  const eventType =
    metricName === "dead_click_candidate_rate"
      ? "dead_click_candidate"
      : metricName === "error_session_rate"
        ? "sanitized_javascript_error"
        : "repeat_click_signal";

  const compatible =
    comparison.viewportGroup === payload.viewportGroup &&
    route.length > 0 &&
    comparison.metricName === String(payload.observedMetric ?? comparison.metricName);

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
        eq(telemetryAggregateSessions.environmentId, comparison.environmentId),
        eq(telemetryAggregateSessions.trafficKind, "production"),
        eq(telemetryAggregateSessions.normalizedRoute, route),
        eq(telemetryAggregateSessions.deploymentVersion, comparison.comparisonVersion),
        eq(telemetryAggregateSessions.viewportGroup, comparison.viewportGroup),
        eq(telemetryAggregateSessions.eventType, "page_view"),
      ),
    );

  const [signal] = await db
    .select({
      sessions:
        sql<number>`count(distinct ${telemetryAggregateSessions.tabSessionHash})`.mapWith(
          Number,
        ),
    })
    .from(telemetryAggregateSessions)
    .where(
      and(
        eq(telemetryAggregateSessions.environmentId, comparison.environmentId),
        eq(telemetryAggregateSessions.trafficKind, "production"),
        eq(telemetryAggregateSessions.normalizedRoute, route),
        eq(telemetryAggregateSessions.deploymentVersion, comparison.comparisonVersion),
        eq(telemetryAggregateSessions.viewportGroup, comparison.viewportGroup),
        eq(telemetryAggregateSessions.eventType, eventType),
      ),
    );

  const comparisonSample = views?.sessions ?? 0;
  const comparisonValue =
    comparisonSample > 0 ? (signal?.sessions ?? 0) / comparisonSample : null;
  const baselineSample = Number(payload.eligibleSessionCount ?? 0);
  const baselineValue = Number(payload.metricValue ?? 0);

  const result = compareRates({
    baselineValue,
    comparisonValue,
    baselineSample,
    comparisonSample,
    minSample,
    compatible,
  });

  const ready = result.outcome !== "not_enough_data";
  const now = new Date();
  await db
    .update(behavioralComparisons)
    .set({
      baselineValue: baselineValue.toFixed(6),
      comparisonValue: comparisonValue == null ? null : comparisonValue.toFixed(6),
      baselineSample,
      comparisonSample,
      outcome: result.outcome,
      summary: result.summary,
      readyAt: ready ? now : null,
    })
    .where(eq(behavioralComparisons.id, comparison.id));

  if (ready && !comparison.readyAt) {
    const [issue] = comparison.issueId
      ? await db
          .select({ number: issues.number, reviewId: issues.reviewId })
          .from(issues)
          .where(eq(issues.id, comparison.issueId))
          .limit(1)
      : [];
    await enqueueWebhookEventSafely({
      eventId: comparison.id,
      subscribedType: "behavioral_comparison.ready",
      eventType: "behavioral_comparison.ready",
      occurredAt: now.toISOString(),
      workspaceId: comparison.workspaceId,
      projectId: comparison.projectId,
      reviewId: snapshot.reviewId ?? issue?.reviewId ?? null,
      issueId: comparison.issueId,
      issueNumber: issue?.number ?? null,
      actor: { type: "system", name: "Passoff" },
      data: {
        outcome: result.outcome,
        metricName: comparison.metricName,
        baselineVersion: comparison.baselineVersion,
        comparisonVersion: comparison.comparisonVersion,
        baselineSample,
        comparisonSample,
        route,
        viewportGroup: comparison.viewportGroup,
      },
    });
    await notifyBehavioralComparisonReady({
      workspaceId: comparison.workspaceId,
      projectId: comparison.projectId,
      reviewId: snapshot.reviewId ?? issue?.reviewId ?? null,
      issueId: comparison.issueId,
      issueNumber: issue?.number ?? null,
      recipientUserId: comparison.requestedByUserId,
    });
    return 1;
  }
  return 0;
}

export async function updateFindingDisposition(
  context: WorkspaceContext,
  findingId: string,
  disposition: BehavioralFindingDisposition,
) {
  if (!canMutateProjects(context)) {
    return { ok: false as const, message: "You cannot update findings in this workspace." };
  }
  const finding = await loadFinding(context, findingId);
  if (!finding) return { ok: false as const, message: "That finding isn’t available." };
  const now = new Date();
  await db
    .update(behavioralFindings)
    .set({ disposition, updatedAt: now })
    .where(
      and(
        eq(behavioralFindings.id, findingId),
        eq(behavioralFindings.workspaceId, context.workspaceId),
      ),
    );
  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: finding.projectId,
    actorUserId: context.userId,
    type: FINDING_ACTIVITY.dispositionChanged,
    data: { findingId, from: finding.disposition, to: disposition },
  });
  return { ok: true as const };
}

export async function analyzeFinding(
  context: WorkspaceContext,
  findingId: string,
) {
  if (!canMutateProjects(context)) {
    return { ok: false as const, message: "You cannot request analysis in this workspace." };
  }
  if (isAiKillSwitchOn()) {
    return {
      ok: false as const,
      message:
        "Assisted analysis is temporarily unavailable. You can still use the recorded evidence.",
    };
  }

  const finding = await loadFinding(context, findingId);
  if (!finding) return { ok: false as const, message: "That finding isn’t available." };

  const related = await relatedIssueForFinding(context, finding);
  const [environment] = await db
    .select({ kind: projectEnvironments.kind })
    .from(projectEnvironments)
    .where(eq(projectEnvironments.id, finding.environmentId))
    .limit(1);

  const safeInput = buildSafeAiInput({
    findingType: finding.findingType,
    metricName: finding.metricName,
    metricValue: Number(finding.metricValue),
    denominatorName: finding.denominatorName,
    denominatorValue: finding.denominatorValue,
    eligibleSessionCount: finding.eligibleSessionCount,
    coverageStatus: finding.coverageStatus,
    environmentKind: environment?.kind ?? "website",
    normalizedRoute: finding.normalizedRoute,
    deploymentVersion: finding.deploymentVersion,
    viewportGroup: finding.viewportGroup,
    elementCategory: finding.elementCategory,
    analyticsLabel: finding.analyticsLabel,
    errorCategory: finding.findingType === "sanitized_js_error_concentration"
      ? finding.analyticsLabel
      : "",
    issueTitle: related ? related.displayTitle : "",
    redactedIssueDescription: related ? redactIssueText(related.body) : "",
    previousVerificationOutcomes: [],
    comparisonSummary: "",
  });

  if (aiInputContainsProhibitedFields(safeInput)) {
    return {
      ok: false as const,
      message: "Assisted analysis is not available for that evidence.",
    };
  }

  const encoded = JSON.stringify(safeInput);
  if (encoded.length > BEHAVIORAL_AI_LIMITS.maxInputChars) {
    return {
      ok: false as const,
      message: "That evidence is too large to analyze. Use the recorded summary instead.",
    };
  }

  const periodStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  );
  const [usage] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(behavioralAiAnalyses)
    .where(
      and(
        eq(behavioralAiAnalyses.workspaceId, context.workspaceId),
        gte(behavioralAiAnalyses.createdAt, periodStart),
      ),
    );
  if ((usage?.total ?? 0) >= BEHAVIORAL_AI_LIMITS.requestsPerWorkspacePerMonth) {
    return {
      ok: false as const,
      message:
        "This workspace has used its assisted analysis allowance for the month. You can still use the recorded evidence.",
    };
  }

  const cooldownSince = new Date(Date.now() - BEHAVIORAL_AI_LIMITS.cooldownMs);
  const [recent] = await db
    .select({ id: behavioralAiAnalyses.id })
    .from(behavioralAiAnalyses)
    .where(
      and(
        eq(behavioralAiAnalyses.findingId, finding.id),
        gte(behavioralAiAnalyses.createdAt, cooldownSince),
      ),
    )
    .limit(1);
  if (recent) {
    const [latest] = await db
      .select()
      .from(behavioralAiAnalyses)
      .where(eq(behavioralAiAnalyses.findingId, finding.id))
      .orderBy(desc(behavioralAiAnalyses.createdAt))
      .limit(1);
    if (latest?.result) {
      return { ok: true as const, analysis: latest, reused: true as const };
    }
    return {
      ok: false as const,
      message: "An analysis was just requested. Wait a few minutes, then try again.",
    };
  }

  const fingerprint = sha256Hex(encoded);
  const now = new Date();
  const [inserted] = await db
    .insert(behavioralAiAnalyses)
    .values({
      workspaceId: context.workspaceId,
      findingId: finding.id,
      requestedByUserId: context.userId,
      status: "running",
      inputFingerprint: fingerprint,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    const [inflight] = await db
      .select()
      .from(behavioralAiAnalyses)
      .where(
        and(
          eq(behavioralAiAnalyses.findingId, finding.id),
          eq(behavioralAiAnalyses.inputFingerprint, fingerprint),
        ),
      )
      .orderBy(desc(behavioralAiAnalyses.createdAt))
      .limit(1);
    if (inflight?.result) {
      return { ok: true as const, analysis: inflight, reused: true as const };
    }
    return {
      ok: false as const,
      message: "That analysis is already running. Try again in a moment.",
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: finding.projectId,
    actorUserId: context.userId,
    type: FINDING_ACTIVITY.aiRequested,
    data: { findingId: finding.id, analysisId: inserted.id, modelId: null },
  });

  const result = await analyzeFindingWithOpenAI(safeInput);
  const completedAt = new Date();
  if (!result.ok) {
    await db
      .update(behavioralAiAnalyses)
      .set({
        status: "failed",
        errorCode: result.reason,
        completedAt,
      })
      .where(eq(behavioralAiAnalyses.id, inserted.id));
    await notifyBehavioralAnalysisFailed({
      context,
      projectId: finding.projectId,
      findingId: finding.id,
    });
    return { ok: false as const, message: result.message };
  }

  await db
    .update(behavioralAiAnalyses)
    .set({
      status: "completed",
      modelId: result.modelId,
      result: result.result,
      completedAt,
    })
    .where(eq(behavioralAiAnalyses.id, inserted.id));

  const [saved] = await db
    .select()
    .from(behavioralAiAnalyses)
    .where(eq(behavioralAiAnalyses.id, inserted.id))
    .limit(1);
  return { ok: true as const, analysis: saved, reused: false as const };
}

export async function latestFindingAnalysis(
  context: WorkspaceContext,
  findingId: string,
) {
  const finding = await loadFinding(context, findingId);
  if (!finding) return null;
  const [row] = await db
    .select()
    .from(behavioralAiAnalyses)
    .where(
      and(
        eq(behavioralAiAnalyses.findingId, finding.id),
        eq(behavioralAiAnalyses.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(desc(behavioralAiAnalyses.createdAt))
    .limit(1);
  return row ?? null;
}

export async function countWorkspaceAiUsage(context: WorkspaceContext) {
  const periodStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  );
  const [usage] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(behavioralAiAnalyses)
    .where(
      and(
        eq(behavioralAiAnalyses.workspaceId, context.workspaceId),
        gte(behavioralAiAnalyses.createdAt, periodStart),
      ),
    );
  return {
    used: usage?.total ?? 0,
    limit: BEHAVIORAL_AI_LIMITS.requestsPerWorkspacePerMonth,
  };
}
