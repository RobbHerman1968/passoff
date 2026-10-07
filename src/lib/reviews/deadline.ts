import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { activityEvents, projects, reviews } from "@/db/schema";
import { canMutateProjects } from "@/lib/projects/permissions";
import {
  parseDeadlineInput,
} from "@/lib/reviews/deadline-format";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type DeadlineServiceError = "not_found" | "validation" | "read_only" | "unavailable";

export const DEADLINE_UNAVAILABLE_MESSAGE = "This review isn’t available.";
export const DEADLINE_READ_ONLY_MESSAGE =
  "Restore this review or its project before changing the deadline.";
export const DEADLINE_SAVE_FAILED_MESSAGE =
  "We couldn’t save the deadline. Your other changes are safe. Try again.";

export type SetDeadlineResult =
  | { ok: true; deadline: Date | null; changed: boolean }
  | { ok: false; error: DeadlineServiceError; message: string };

async function loadReviewRow(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  projectId: string,
  reviewId: string,
) {
  const [row] = await executor
    .select({
      id: reviews.id,
      projectId: reviews.projectId,
      feedbackDeadline: reviews.feedbackDeadline,
      archivedAt: reviews.archivedAt,
      projectStatus: projects.status,
    })
    .from(reviews)
    .innerJoin(
      projects,
      and(
        eq(projects.id, reviews.projectId),
        eq(projects.workspaceId, reviews.workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.projectId, projectId),
        eq(reviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getReviewFeedbackDeadline(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
): Promise<Date | null> {
  const row = await loadReviewRow(db, context.workspaceId, projectId, reviewId);
  return row?.feedbackDeadline ?? null;
}

/**
 * Set or clear a review's feedback deadline. This only writes the deadline and one
 * activity record. Reminders are sent later by the reminders cron and can never
 * change or roll back this value.
 */
export async function setReviewFeedbackDeadline(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    /** ISO timestamp, or empty/null to clear. */
    deadline: string | null;
  },
  now: Date = new Date(),
): Promise<SetDeadlineResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "not_found", message: DEADLINE_UNAVAILABLE_MESSAGE };
  }

  const parsed = parseDeadlineInput(input.deadline, now);
  if (!parsed.ok) {
    return { ok: false, error: "validation", message: parsed.message };
  }

  try {
    return await db.transaction(async (tx): Promise<SetDeadlineResult> => {
      const review = await loadReviewRow(
        tx,
        context.workspaceId,
        input.projectId,
        input.reviewId,
      );
      if (!review) {
        return { ok: false, error: "not_found", message: DEADLINE_UNAVAILABLE_MESSAGE };
      }
      if (review.archivedAt || review.projectStatus === "archived") {
        return { ok: false, error: "read_only", message: DEADLINE_READ_ONLY_MESSAGE };
      }

      const previous = review.feedbackDeadline;
      const next = parsed.deadline;
      const changed = (previous?.getTime() ?? null) !== (next?.getTime() ?? null);
      if (!changed) {
        return { ok: true, deadline: next, changed: false };
      }

      await tx
        .update(reviews)
        .set({ feedbackDeadline: next, updatedAt: now })
        .where(
          and(
            eq(reviews.id, review.id),
            eq(reviews.workspaceId, context.workspaceId),
            eq(reviews.projectId, review.projectId),
          ),
        );

      await tx.insert(activityEvents).values({
        workspaceId: context.workspaceId,
        projectId: review.projectId,
        reviewId: review.id,
        actorUserId: context.userId,
        type: next ? "review.deadline_set" : "review.deadline_cleared",
        data: {
          from: previous?.toISOString() ?? null,
          to: next?.toISOString() ?? null,
        },
        createdAt: now,
      });

      return { ok: true, deadline: next, changed: true };
    });
  } catch {
    return { ok: false, error: "unavailable", message: DEADLINE_SAVE_FAILED_MESSAGE };
  }
}
