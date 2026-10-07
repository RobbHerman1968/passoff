import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { db } from "@/db";
import { projects, reviews } from "@/db/schema";
import { PLAN_ENTITLEMENTS, type PlanId } from "@/lib/billing/plans";
import { resolveWorkspacePlanId } from "@/lib/billing/effective-plan";
import { nextPlanUp, planName } from "@/lib/billing/subscription-state";

type Executor = Pick<typeof db, "select">;

/**
 * An active review website is the website behind a review that is still being worked on:
 * the review is not archived and not closed, and its project is active and not deleted.
 * Several reviews of one website count once. Archiving a review, or a whole project, frees
 * the room without deleting anything.
 */
export async function countActiveReviewWebsites(
  executor: Executor,
  workspaceId: string,
): Promise<number> {
  const conditions = [
    eq(reviews.workspaceId, workspaceId),
    isNull(reviews.archivedAt),
    ne(reviews.status, "closed"),
    isNull(projects.deletedAt),
    eq(projects.status, "active"),
  ];
  const [row] = await executor
    .select({ total: sql<number>`count(distinct ${reviews.environmentId})`.mapWith(Number) })
    .from(reviews)
    .innerJoin(
      projects,
      and(eq(projects.id, reviews.projectId), eq(projects.workspaceId, reviews.workspaceId)),
    )
    .where(and(...conditions));
  return row?.total ?? 0;
}

/** Active reviews on one website, optionally leaving one review out. */
export async function countActiveReviewWebsitesForEnvironment(
  executor: Executor,
  workspaceId: string,
  environmentId: string,
  excludeReviewId?: string,
): Promise<number> {
  const conditions = [
    eq(reviews.workspaceId, workspaceId),
    eq(reviews.environmentId, environmentId),
    isNull(reviews.archivedAt),
    ne(reviews.status, "closed"),
    isNull(projects.deletedAt),
    eq(projects.status, "active"),
  ];
  if (excludeReviewId) conditions.push(ne(reviews.id, excludeReviewId));
  const [row] = await executor
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(reviews)
    .innerJoin(
      projects,
      and(eq(projects.id, reviews.projectId), eq(projects.workspaceId, reviews.workspaceId)),
    )
    .where(and(...conditions));
  return row?.total ?? 0;
}

/** Websites an archived or restored project would bring back, for the restore check. */
export async function countProjectReviewWebsitesIgnoringProjectState(
  executor: Executor,
  workspaceId: string,
  projectId: string,
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`count(distinct ${reviews.environmentId})`.mapWith(Number) })
    .from(reviews)
    .where(
      and(
        eq(reviews.workspaceId, workspaceId),
        eq(reviews.projectId, projectId),
        isNull(reviews.archivedAt),
        inArray(reviews.status, ["draft", "open"]),
      ),
    );
  return row?.total ?? 0;
}

export type ReviewWebsiteCapacity = {
  planId: PlanId;
  planName: string;
  limit: number | "unlimited";
  used: number;
  /** Null when unlimited. */
  remaining: number | null;
  atLimit: boolean;
  /** More than the plan includes, for example after moving to a smaller plan. Nothing is removed. */
  overLimit: boolean;
  /** At or above 80% of a limited plan. */
  nearLimit: boolean;
};

export function summarizeReviewWebsiteCapacity(input: {
  planId: PlanId;
  used: number;
}): ReviewWebsiteCapacity {
  const plan = PLAN_ENTITLEMENTS[input.planId];
  const limit = plan.activeReviewWebsites;
  if (limit === "unlimited") {
    return {
      planId: input.planId,
      planName: plan.name,
      limit,
      used: input.used,
      remaining: null,
      atLimit: false,
      overLimit: false,
      nearLimit: false,
    };
  }
  return {
    planId: input.planId,
    planName: plan.name,
    limit,
    used: input.used,
    remaining: Math.max(0, limit - input.used),
    atLimit: input.used >= limit,
    overLimit: input.used > limit,
    nearLimit: limit > 0 && input.used / limit >= 0.8,
  };
}

export async function getReviewWebsiteCapacity(
  executor: Executor,
  workspaceId: string,
  now: Date = new Date(),
): Promise<ReviewWebsiteCapacity> {
  const [planId, used] = await Promise.all([
    resolveWorkspacePlanId(executor, workspaceId, now),
    countActiveReviewWebsites(executor, workspaceId),
  ]);
  return summarizeReviewWebsiteCapacity({ planId, used });
}

export type ReviewWebsiteCheck =
  | { allowed: true; capacity: ReviewWebsiteCapacity }
  | { allowed: false; capacity: ReviewWebsiteCapacity; message: string };

/** The plain-language reason a review cannot be added, naming who can change it. */
export function reviewWebsiteBlockedMessage(
  capacity: ReviewWebsiteCapacity,
  options: { isOwner: boolean },
): string {
  const limit = capacity.limit === "unlimited" ? 0 : capacity.limit;
  const sites = limit === 1 ? "1 active review website" : `${limit} active review websites`;
  const next = nextPlanUp(capacity.planId);
  const change = options.isOwner
    ? next
      ? `Archive a review you’re finished with, or move to ${planName(next)} on the Billing page.`
      : "Archive a review you’re finished with to make room."
    : next
      ? `Archive a review you’re finished with, or ask your workspace owner to move to ${planName(next)}.`
      : "Archive a review you’re finished with to make room.";
  return `Your ${capacity.planName} plan includes ${sites}. ${change}`;
}

/**
 * Whether `adding` more review websites fits the plan. Call this inside the same
 * transaction that creates the review, after locking the workspace row, so two people
 * adding at the same moment cannot both squeeze past the limit.
 */
export async function checkCanAddReviewWebsites(
  executor: Executor,
  workspaceId: string,
  options: { adding?: number; isOwner: boolean; now?: Date },
): Promise<ReviewWebsiteCheck> {
  const adding = options.adding ?? 1;
  const capacity = await getReviewWebsiteCapacity(executor, workspaceId, options.now);
  if (capacity.limit === "unlimited" || adding <= 0) return { allowed: true, capacity };
  if (capacity.used + adding > capacity.limit) {
    return {
      allowed: false,
      capacity,
      message: reviewWebsiteBlockedMessage(capacity, { isOwner: options.isOwner }),
    };
  }
  return { allowed: true, capacity };
}
