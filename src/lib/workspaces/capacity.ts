import "server-only";

import { and, count, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  users,
  workspaceInvitations,
  workspaceMemberships,
} from "@/db/schema";
import { PLAN_ENTITLEMENTS, type PlanId } from "@/lib/billing/plans";
import { nextPlanUp, planName } from "@/lib/billing/subscription-state";
import { resolveWorkspacePlanId } from "@/lib/billing/effective-plan";

/**
 * How many people a workspace plan allows, read from src/lib/billing/plans.ts.
 *
 * This is groundwork for paid plans: it only counts and decides. It never charges,
 * upgrades, or contacts a payment provider. People who have accepted count as seats;
 * invitations that are still open hold a seat so the workspace cannot be over-invited.
 * Guests never count.
 */
export type MemberCapacity = {
  planId: PlanId;
  planName: string;
  /** Seats the plan includes. */
  limit: number;
  /** People with access today. */
  activeMembers: number;
  /** Open invitations that have not expired. */
  pendingInvitations: number;
  /** activeMembers + pendingInvitations. */
  seatsUsed: number;
  seatsRemaining: number;
  atCapacity: boolean;
  /** More people than the plan includes, for example after moving to a smaller plan. Nobody is removed. */
  overCapacity: boolean;
  /** At or above 80% of the seats. */
  nearCapacity: boolean;
};

type Executor = Pick<typeof db, "select">;

export function summarizeCapacity(input: {
  planId: PlanId;
  activeMembers: number;
  pendingInvitations: number;
}): MemberCapacity {
  const plan = PLAN_ENTITLEMENTS[input.planId];
  const limit = plan.workspaceMembers;
  const seatsUsed = input.activeMembers + input.pendingInvitations;
  const seatsRemaining = Math.max(0, limit - seatsUsed);
  return {
    planId: input.planId,
    planName: plan.name,
    limit,
    activeMembers: input.activeMembers,
    pendingInvitations: input.pendingInvitations,
    seatsUsed,
    seatsRemaining,
    atCapacity: seatsUsed >= limit,
    overCapacity: seatsUsed > limit,
    nearCapacity: limit > 0 && seatsUsed / limit >= 0.8,
  };
}

export async function getMemberCapacity(
  workspaceId: string,
  executor: Executor = db,
  now: Date = new Date(),
): Promise<MemberCapacity> {
  const planId = await resolveWorkspacePlanId(executor, workspaceId);

  const [active] = await executor
    .select({ total: count() })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
      ),
    );

  const [pending] = await executor
    .select({ total: count() })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, now),
      ),
    );

  return summarizeCapacity({
    planId,
    activeMembers: Number(active?.total ?? 0),
    pendingInvitations: Number(pending?.total ?? 0),
  });
}

/** Plain-language reason shown when an invitation cannot be sent. Invitations are owner-only. */
export function capacityBlockedMessage(capacity: MemberCapacity): string {
  const seats = capacity.limit === 1 ? "1 person" : `${capacity.limit} people`;
  const next = nextPlanUp(capacity.planId);
  const upgrade = next
    ? ` Or move to ${planName(next)} on the Billing page for more seats.`
    : "";
  return `Your ${capacity.planName} plan includes ${seats}. Remove someone or cancel an open invitation to make room.${upgrade}`;
}
