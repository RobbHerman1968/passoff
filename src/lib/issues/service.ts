import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  issueEvidence,
  issueVerifications,
  issues,
  reviewIssueCounters,
  reviews,
  videoAssets,
} from "@/db/schema";
import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import { getVideoEvidenceRetentionEnd } from "@/lib/billing/video-evidence";
import type {
  IssueClosureReason,
  IssuePriority,
  IssueStatus,
} from "@/lib/issues/statuses";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type ServiceError =
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unavailable";

export async function allocateIssueNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  reviewId: string,
): Promise<number> {
  const [row] = await tx
    .update(reviewIssueCounters)
    .set({
      nextIssueNumber: sql`${reviewIssueCounters.nextIssueNumber} + 1`,
    })
    .where(eq(reviewIssueCounters.reviewId, reviewId))
    .returning({
      allocated: sql<number>`${reviewIssueCounters.nextIssueNumber} - 1`.mapWith(Number),
    });

  if (!row) {
    throw new Error("missing_review_issue_counter");
  }
  return row.allocated;
}

export async function createIssue(
  context: WorkspaceContext,
  input: {
    reviewId: string;
    body: string;
    priority?: IssuePriority;
  },
): Promise<
  | { ok: true; issue: { id: string; number: number } }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  try {
    return await db.transaction(async (tx) => {
      const [review] = await tx
        .select({
          id: reviews.id,
          workspaceId: reviews.workspaceId,
          projectId: reviews.projectId,
          environmentId: reviews.environmentId,
          deploymentId: reviews.deploymentId,
        })
        .from(reviews)
        .where(
          and(
            eq(reviews.id, input.reviewId),
            eq(reviews.workspaceId, context.workspaceId),
          ),
        )
        .limit(1);

      if (!review) {
        return { ok: false as const, error: "not_found" as const };
      }

      const number = await allocateIssueNumber(tx, review.id);
      const [issue] = await tx
        .insert(issues)
        .values({
          workspaceId: review.workspaceId,
          projectId: review.projectId,
          environmentId: review.environmentId,
          deploymentId: review.deploymentId,
          reviewId: review.id,
          number,
          body: input.body,
          status: "open",
          priority: input.priority ?? "normal",
          authorUserId: context.userId,
          version: 1,
        })
        .returning({ id: issues.id, number: issues.number });

      return { ok: true as const, issue };
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function transitionIssue(
  context: WorkspaceContext,
  input: {
    issueId: string;
    version: number;
    status: IssueStatus;
    closureReason?: IssueClosureReason | null;
  },
): Promise<
  | { ok: true }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const [existing] = await db
    .select()
    .from(issues)
    .where(
      and(eq(issues.id, input.issueId), eq(issues.workspaceId, context.workspaceId)),
    )
    .limit(1);

  if (!existing) {
    return { ok: false, error: "not_found" };
  }

  if (input.status === "closed" && !input.closureReason) {
    return {
      ok: false,
      error: "validation",
      message: "Choose why this issue is being closed.",
    };
  }

  if (input.status !== "closed" && input.closureReason) {
    return {
      ok: false,
      error: "validation",
      message: "A closure reason is only used when an issue is closed.",
    };
  }

  if (input.status === "verified") {
    const [passed] = await db
      .select({ id: issueVerifications.id })
      .from(issueVerifications)
      .where(
        and(
          eq(issueVerifications.issueId, existing.id),
          eq(issueVerifications.workspaceId, context.workspaceId),
          eq(issueVerifications.outcome, "passed"),
        ),
      )
      .limit(1);
    if (!passed) {
      return {
        ok: false,
        error: "validation",
        message: "A passed verification is required before an issue can be verified.",
      };
    }
  }

  if (input.status === "closed" && input.closureReason === "fixed") {
    const [passed] = await db
      .select({ id: issueVerifications.id })
      .from(issueVerifications)
      .where(
        and(
          eq(issueVerifications.issueId, existing.id),
          eq(issueVerifications.workspaceId, context.workspaceId),
          eq(issueVerifications.outcome, "passed"),
        ),
      )
      .limit(1);
    if (!passed) {
      return {
        ok: false,
        error: "validation",
        message: "Closing as fixed needs a passed verification.",
      };
    }
  }

  const now = new Date();
  const reopening = existing.status === "closed" && input.status !== "closed";

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(issues)
      .set({
        status: input.status,
        closureReason: input.status === "closed" ? input.closureReason ?? null : null,
        closedAt: input.status === "closed" ? now : reopening ? null : existing.closedAt,
        closedByUserId:
          input.status === "closed"
            ? context.userId
            : reopening
              ? null
              : existing.closedByUserId,
        reopenedAt: reopening ? now : existing.reopenedAt,
        verifiedAt: input.status === "verified" ? existing.verifiedAt ?? now : existing.verifiedAt,
        version: input.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.workspaceId, context.workspaceId),
          eq(issues.version, input.version),
        ),
      )
      .returning({ id: issues.id });

    if (!updated) {
      return { ok: false as const, error: "conflict" as const };
    }

    if (input.status === "closed" || reopening) {
      const evidence = await tx
        .select({ id: issueEvidence.id })
        .from(issueEvidence)
        .where(
          and(
            eq(issueEvidence.issueId, input.issueId),
            eq(issueEvidence.workspaceId, context.workspaceId),
            eq(issueEvidence.kind, "video"),
          ),
        );

      if (evidence.length > 0) {
        await tx
          .update(videoAssets)
          .set({
            retentionEndsAt:
              input.status === "closed"
                ? getVideoEvidenceRetentionEnd(
                    now,
                    VIDEO_EVIDENCE_COMMON_LIMITS.retentionDaysAfterIssueCloses,
                  )
                : null,
            updatedAt: now,
          })
          .where(
            and(
              eq(videoAssets.workspaceId, context.workspaceId),
              inArray(
                videoAssets.evidenceId,
                evidence.map((item) => item.id),
              ),
            ),
          );
      }
    }

    return { ok: true as const };
  });
}

export async function recordVerification(
  context: WorkspaceContext,
  input: {
    issueId: string;
    method: "human" | "element_visibility" | "bounding_box_overlap" | "named_test_hook";
    outcome: "passed" | "failed" | "uncertain";
    checkedUrl?: string;
    note?: string;
    evidenceId?: string;
  },
): Promise<
  | { ok: true; verificationId: string }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  if (input.method !== "human" && input.outcome === "passed") {
    // Automated methods may record history but cannot close an issue.
  }

  try {
    return await db.transaction(async (tx) => {
      const [issue] = await tx
        .select()
        .from(issues)
        .where(
          and(eq(issues.id, input.issueId), eq(issues.workspaceId, context.workspaceId)),
        )
        .limit(1);

      if (!issue) {
        return { ok: false as const, error: "not_found" as const };
      }

      if (input.evidenceId) {
        const [evidence] = await tx
          .select({ id: issueEvidence.id, workspaceId: issueEvidence.workspaceId })
          .from(issueEvidence)
          .where(
            and(
              eq(issueEvidence.id, input.evidenceId),
              eq(issueEvidence.issueId, issue.id),
              eq(issueEvidence.workspaceId, context.workspaceId),
            ),
          )
          .limit(1);
        if (!evidence) {
          return { ok: false as const, error: "not_found" as const };
        }
      }

      const [verification] = await tx
        .insert(issueVerifications)
        .values({
          workspaceId: issue.workspaceId,
          issueId: issue.id,
          reviewId: issue.reviewId,
          environmentId: issue.environmentId,
          deploymentId: issue.deploymentId,
          projectId: issue.projectId,
          verifiedByUserId: context.userId,
          method: input.method,
          outcome: input.outcome,
          checkedUrl: input.checkedUrl,
          evidenceId: input.evidenceId,
          note: input.note,
        })
        .returning({ id: issueVerifications.id });

      const now = new Date();
      if (input.outcome === "passed" && issue.status === "ready_for_verification") {
        await tx
          .update(issues)
          .set({
            status: "verified",
            verifiedAt: now,
            version: issue.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(issues.id, issue.id),
              eq(issues.workspaceId, context.workspaceId),
              eq(issues.version, issue.version),
            ),
          );
      } else if (input.outcome === "failed") {
        await tx
          .update(issues)
          .set({
            status: "in_progress",
            version: issue.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(issues.id, issue.id),
              eq(issues.workspaceId, context.workspaceId),
              eq(issues.version, issue.version),
            ),
          );
      }

      return { ok: true as const, verificationId: verification.id };
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function attachIssueEvidence(
  context: WorkspaceContext,
  input: {
    issueId: string;
    kind: "screenshot" | "video" | "technical_context" | "verification_capture";
    captureMethod:
      | "browser_reconstruction"
      | "worker_capture"
      | "manual_attachment"
      | "host_upload";
    captureStatus?: "pending" | "ready" | "unavailable" | "failed";
    assetId?: string;
  },
): Promise<
  | { ok: true; evidenceId: string }
  | { ok: false; error: ServiceError }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const [issue] = await db
    .select({ id: issues.id, workspaceId: issues.workspaceId })
    .from(issues)
    .where(
      and(eq(issues.id, input.issueId), eq(issues.workspaceId, context.workspaceId)),
    )
    .limit(1);

  if (!issue) {
    return { ok: false, error: "not_found" };
  }

  const [evidence] = await db
    .insert(issueEvidence)
    .values({
      workspaceId: issue.workspaceId,
      issueId: issue.id,
      assetId: input.assetId,
      kind: input.kind,
      captureMethod: input.captureMethod,
      captureStatus: input.captureStatus ?? "pending",
      createdByUserId: context.userId,
    })
    .returning({ id: issueEvidence.id });

  return { ok: true, evidenceId: evidence.id };
}

export async function getIssueEvidenceForWorkspace(
  context: WorkspaceContext,
  evidenceId: string,
) {
  const [row] = await db
    .select({
      id: issueEvidence.id,
      issueId: issueEvidence.issueId,
      workspaceId: issueEvidence.workspaceId,
      kind: issueEvidence.kind,
    })
    .from(issueEvidence)
    .innerJoin(
      issues,
      and(
        eq(issues.id, issueEvidence.issueId),
        eq(issues.workspaceId, context.workspaceId),
      ),
    )
    .where(
      and(
        eq(issueEvidence.id, evidenceId),
        eq(issueEvidence.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);

  return row ?? null;
}
