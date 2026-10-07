import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  activityEvents,
  guestIdentities,
  issues,
  projects,
  reviews,
  users,
  workspaceMemberships,
} from "@/db/schema";
import { insertIssueActivityEvent } from "@/lib/issues/activity-record";
import {
  formatIssueHistorySummary,
  ISSUE_ACTIVITY_TYPES,
  ISSUE_ACTIVITY_TYPE_VALUES,
  type IssueActivityType,
  type IssueHistoryEvent,
} from "@/lib/issues/history";
import { notifyIssueAssigned, notifyIssueStatusChanged } from "@/lib/notifications/events";
import { actorLabel } from "@/lib/notifications/service";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { IssuePriority, IssueStatus } from "@/lib/issues/statuses";
import {
  isAllowedIssueTriageTransition,
  ISSUE_TRIAGE_CONFLICT_MESSAGE,
  ISSUE_TRIAGE_UNAVAILABLE_MESSAGE,
  unsupportedTriageTransitionMessage,
} from "@/lib/issues/triage-transitions";
import type {
  AssignableMember,
  IssueTriageSnapshot,
} from "@/lib/issues/triage-types";
import { canMutateProjects } from "@/lib/projects/permissions";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type TriageServiceError = "not_found" | "conflict" | "validation" | "unavailable";
export type { AssignableMember, IssueTriageSnapshot };

export type TriageMutationResult =
  | {
      ok: true;
      issue: IssueTriageSnapshot;
      event: IssueHistoryEvent;
    }
  | {
      ok: false;
      error: TriageServiceError;
      message: string;
    };

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ScopedIssue = {
  id: string;
  workspaceId: string;
  projectId: string;
  reviewId: string;
  number: number;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeUserId: string | null;
  version: number;
};

const VALIDATION_ASSIGNEE_MESSAGE =
  "Choose someone in this workspace, or Unassigned.";

async function loadScopedIssue(
  executor: Pick<typeof db, "select">,
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; issueNumber: number },
): Promise<ScopedIssue | null> {
  const [row] = await executor
    .select({
      id: issues.id,
      workspaceId: issues.workspaceId,
      projectId: issues.projectId,
      reviewId: issues.reviewId,
      number: issues.number,
      status: issues.status,
      priority: issues.priority,
      assigneeUserId: issues.assigneeUserId,
      version: issues.version,
    })
    .from(issues)
    .innerJoin(
      reviews,
      and(
        eq(reviews.id, issues.reviewId),
        eq(reviews.workspaceId, issues.workspaceId),
        eq(reviews.projectId, issues.projectId),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, issues.projectId),
        eq(projects.workspaceId, issues.workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .where(
      and(
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, input.projectId),
        eq(issues.reviewId, input.reviewId),
        eq(issues.number, input.issueNumber),
        isNull(issues.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    status: row.status as IssueStatus,
    priority: row.priority as IssuePriority,
  };
}

async function displayNamesForUserIds(
  executor: Pick<typeof db, "select">,
  userIds: Array<string | null>,
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const rows = await executor
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, ids));

  return new Map(
    rows.map((row) => [row.id, personDisplayName(row.name, row.email)]),
  );
}

function snapshotFromIssue(
  issue: ScopedIssue,
  assigneeDisplayName: string,
  updatedAt: Date,
): IssueTriageSnapshot {
  return {
    version: issue.version,
    status: issue.status,
    priority: issue.priority,
    assigneeUserId: issue.assigneeUserId,
    assigneeDisplayName,
    updatedAt: updatedAt.toISOString(),
  };
}

async function loadAssigneeDisplayName(
  executor: Pick<typeof db, "select">,
  assigneeUserId: string | null,
): Promise<string> {
  if (!assigneeUserId) return "Unassigned";
  const names = await displayNamesForUserIds(executor, [assigneeUserId]);
  return names.get(assigneeUserId) ?? "Unknown";
}

function historyEvent(input: {
  id: string;
  type: IssueActivityType;
  createdAt: Date;
  actorDisplayName: string;
  data: Record<string, unknown>;
}): IssueHistoryEvent | null {
  const summary = formatIssueHistorySummary({
    type: input.type,
    actorDisplayName: input.actorDisplayName,
    data: input.data,
  });
  if (!summary) return null;
  return {
    id: input.id,
    type: input.type,
    createdAt: input.createdAt.toISOString(),
    actorDisplayName: input.actorDisplayName,
    summary,
  };
}

async function applyTriageUpdate(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    version: number;
  },
  mutator: (
    tx: DbTx,
    existing: ScopedIssue,
    now: Date,
  ) => Promise<
    | {
        ok: true;
        next: Partial<Pick<ScopedIssue, "status" | "priority" | "assigneeUserId">>;
        type: IssueActivityType;
        data: Record<string, unknown>;
      }
    | { ok: false; error: TriageServiceError; message: string }
  >,
): Promise<TriageMutationResult> {
  if (!canMutateProjects(context)) {
    return {
      ok: false,
      error: "not_found",
      message: ISSUE_TRIAGE_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await loadScopedIssue(tx, context, input);
      if (!existing) {
        return {
          ok: false as const,
          error: "not_found" as const,
          message: ISSUE_TRIAGE_UNAVAILABLE_MESSAGE,
        };
      }

      if (existing.version !== input.version) {
        return {
          ok: false as const,
          error: "conflict" as const,
          message: ISSUE_TRIAGE_CONFLICT_MESSAGE,
        };
      }

      const planned = await mutator(tx, existing, new Date());
      if (!planned.ok) return planned;

      const now = new Date();
      const nextIssue: ScopedIssue = {
        ...existing,
        ...planned.next,
        version: existing.version + 1,
      };

      const [updated] = await tx
        .update(issues)
        .set({
          status: nextIssue.status,
          priority: nextIssue.priority,
          assigneeUserId: nextIssue.assigneeUserId,
          version: nextIssue.version,
          updatedAt: now,
        })
        .where(
          and(
            eq(issues.id, existing.id),
            eq(issues.workspaceId, context.workspaceId),
            eq(issues.projectId, existing.projectId),
            eq(issues.reviewId, existing.reviewId),
            eq(issues.version, existing.version),
            isNull(issues.deletedAt),
          ),
        )
        .returning({ id: issues.id, updatedAt: issues.updatedAt });

      if (!updated) {
        return {
          ok: false as const,
          error: "conflict" as const,
          message: ISSUE_TRIAGE_CONFLICT_MESSAGE,
        };
      }

      const eventRow = await insertIssueActivityEvent(tx, {
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        reviewId: existing.reviewId,
        issueId: existing.id,
        actorUserId: context.userId,
        type: planned.type,
        data: planned.data,
        createdAt: now,
      });
      if (!eventRow) {
        throw new Error("history_write_failed");
      }

      const actorDisplayName = personDisplayName(
        context.userName,
        context.userEmail,
      );
      const event = historyEvent({
        id: eventRow.id,
        type: planned.type,
        createdAt: eventRow.createdAt,
        actorDisplayName,
        data: planned.data,
      });

      if (!event) {
        throw new Error("history_summary_failed");
      }

      return {
        ok: true as const,
        issue: snapshotFromIssue(
          nextIssue,
          await loadAssigneeDisplayName(tx, nextIssue.assigneeUserId),
          updated.updatedAt,
        ),
        event,
        previous: existing,
        next: nextIssue,
        activityType: planned.type,
      };
    });

    if (result.ok) {
      const skipAssignedRepeat =
        result.activityType === ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED &&
        result.previous.assigneeUserId === result.next.assigneeUserId;
      if (!skipAssignedRepeat) {
        try {
          await fireTriageNotifications(context, result.previous, result.next, result.activityType);
        } catch {
          // Notifications must not undo a saved issue change.
        }
        const type =
          result.activityType === ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED
            ? "issue.assigned"
            : result.activityType === ISSUE_ACTIVITY_TYPES.STATUS_CHANGED
              ? "issue.status_changed"
              : "issue.updated";
        await enqueueWebhookEventSafely({
          eventId: result.event.id,
          subscribedType: type,
          eventType: type,
          occurredAt: new Date().toISOString(),
          workspaceId: context.workspaceId,
          projectId: result.next.projectId,
          reviewId: result.next.reviewId,
          issueId: result.next.id,
          issueNumber: result.next.number,
          actor: { type: "user", name: actorLabel(context) },
          data: { activity: result.activityType },
        });
      }
      return { ok: true, issue: result.issue, event: result.event };
    }

    return result;
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t save that change. Try again.",
    };
  }
}

async function fireTriageNotifications(
  context: WorkspaceContext,
  previous: ScopedIssue,
  next: ScopedIssue,
  activityType: IssueActivityType,
) {
  if (activityType === ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED && next.assigneeUserId) {
    await notifyIssueAssigned({
      context,
      projectId: next.projectId,
      reviewId: next.reviewId,
      issueId: next.id,
      issueNumber: next.number,
      issueVersion: next.version,
      assigneeUserId: next.assigneeUserId,
    });
  }

  if (activityType === ISSUE_ACTIVITY_TYPES.STATUS_CHANGED && previous.status !== next.status) {
    await notifyIssueStatusChanged({
      context,
      projectId: next.projectId,
      reviewId: next.reviewId,
      issueId: next.id,
      issueNumber: next.number,
      issueVersion: next.version,
      fromStatus: previous.status,
      toStatus: next.status,
      assigneeUserId: next.assigneeUserId,
    });
  }
}

async function assertActiveWorkspaceMember(
  tx: DbTx,
  workspaceId: string,
  userId: string,
): Promise<{ userId: string; displayName: string } | null> {
  const [row] = await tx
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    userId: row.userId,
    displayName: personDisplayName(row.name, row.email),
  };
}

export async function updateIssueTriageStatus(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    version: number;
    status: IssueStatus;
  },
): Promise<TriageMutationResult> {
  return applyTriageUpdate(context, input, async (_tx, existing) => {
    if (!isAllowedIssueTriageTransition(existing.status, input.status)) {
      return {
        ok: false,
        error: "validation",
        message: unsupportedTriageTransitionMessage(existing.status, input.status),
      };
    }

    return {
      ok: true,
      next: { status: input.status },
      type: ISSUE_ACTIVITY_TYPES.STATUS_CHANGED,
      data: { from: existing.status, to: input.status },
    };
  });
}

export async function updateIssueTriagePriority(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    version: number;
    priority: IssuePriority;
  },
): Promise<TriageMutationResult> {
  return applyTriageUpdate(context, input, async (_tx, existing) => {
    return {
      ok: true,
      next: { priority: input.priority },
      type: ISSUE_ACTIVITY_TYPES.PRIORITY_CHANGED,
      data: { from: existing.priority, to: input.priority },
    };
  });
}

export async function updateIssueTriageAssignee(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    version: number;
    assigneeUserId: string | null;
  },
): Promise<TriageMutationResult> {
  return applyTriageUpdate(context, input, async (tx, existing) => {
    let toDisplayName: string | null = null;
    if (input.assigneeUserId) {
      const member = await assertActiveWorkspaceMember(
        tx,
        context.workspaceId,
        input.assigneeUserId,
      );
      if (!member) {
        return {
          ok: false,
          error: "validation",
          message: VALIDATION_ASSIGNEE_MESSAGE,
        };
      }
      toDisplayName = member.displayName;
    }

    const names = await displayNamesForUserIds(tx, [existing.assigneeUserId]);
    const fromDisplayName = existing.assigneeUserId
      ? (names.get(existing.assigneeUserId) ?? "Unknown")
      : null;

    return {
      ok: true,
      next: { assigneeUserId: input.assigneeUserId },
      type: ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED,
      data: {
        fromUserId: existing.assigneeUserId,
        toUserId: input.assigneeUserId,
        fromDisplayName,
        toDisplayName,
      },
    };
  });
}

export async function listAssignableMembers(
  context: WorkspaceContext,
): Promise<AssignableMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, context.workspaceId),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.name), asc(users.email));

  return rows.map((row) => ({
    userId: row.userId,
    displayName: personDisplayName(row.name, row.email),
  }));
}

export async function listIssueHistory(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; issueNumber: number },
): Promise<IssueHistoryEvent[] | null> {
  const existing = await loadScopedIssue(db, context, input);
  if (!existing) return null;

  const rows = await db
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      data: activityEvents.data,
      createdAt: activityEvents.createdAt,
      actorName: users.name,
      actorEmail: users.email,
      guestName: guestIdentities.name,
      guestEmail: guestIdentities.email,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .leftJoin(
      guestIdentities,
      eq(guestIdentities.id, activityEvents.actorGuestId),
    )
    .where(
      and(
        eq(activityEvents.issueId, existing.id),
        eq(activityEvents.workspaceId, context.workspaceId),
        eq(activityEvents.projectId, existing.projectId),
        eq(activityEvents.reviewId, existing.reviewId),
        inArray(activityEvents.type, [...ISSUE_ACTIVITY_TYPE_VALUES]),
      ),
    )
    .orderBy(desc(activityEvents.createdAt));

  const events: IssueHistoryEvent[] = [];
  for (const row of rows) {
    if (!ISSUE_ACTIVITY_TYPE_VALUES.includes(row.type as IssueActivityType)) {
      continue;
    }
    const event = historyEvent({
      id: row.id,
      type: row.type as IssueActivityType,
      createdAt: row.createdAt,
      actorDisplayName: row.guestName || row.guestEmail
        ? personDisplayName(row.guestName, row.guestEmail)
        : personDisplayName(row.actorName, row.actorEmail),
      data: (row.data ?? {}) as Record<string, unknown>,
    });
    if (event) events.push(event);
  }
  return events;
}
