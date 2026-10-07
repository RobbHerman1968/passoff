import "server-only";

import { and, asc, eq, gte, isNotNull, isNull, lte, ne } from "drizzle-orm";

import { db } from "@/db";
import { projects, reviews, workspaces } from "@/db/schema";
import {
  dispatchNotifications,
  listActiveWorkspaceMemberIds,
  loadNotificationContext,
  reviewHref,
} from "@/lib/notifications/service";
import {
  classifyDeadlineReminder,
  deadlineReminderDedupeKey,
  DEADLINE_REMINDER_LEAD_MS,
  DEADLINE_REMINDER_PAST_DUE_GRACE_MS,
} from "@/lib/reminders/deadline-window";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export type ReviewDeadlineReminderResult = {
  reviewsChecked: number;
  remindersCreated: number;
  failures: number;
};

/**
 * Send one reminder per workspace member per deadline value for active (not closed or archived) reviews whose
 * deadline is within a day or recently passed.
 *
 * Safe to run as often as needed: the notification dedupe key makes repeat runs
 * create nothing new. This function only reads review rows. It never writes to
 * `reviews`, so a failed notification cannot change or lose a deadline.
 */
export async function runReviewDeadlineReminders(
  now: Date = new Date(),
): Promise<ReviewDeadlineReminderResult> {
  const result: ReviewDeadlineReminderResult = {
    reviewsChecked: 0,
    remindersCreated: 0,
    failures: 0,
  };

  const windowStart = new Date(now.getTime() - DEADLINE_REMINDER_PAST_DUE_GRACE_MS);
  const windowEnd = new Date(now.getTime() + DEADLINE_REMINDER_LEAD_MS);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await db
      .select({
        reviewId: reviews.id,
        workspaceId: reviews.workspaceId,
        projectId: reviews.projectId,
        deadline: reviews.feedbackDeadline,
      })
      .from(reviews)
      .innerJoin(
        projects,
        and(
          eq(projects.id, reviews.projectId),
          eq(projects.workspaceId, reviews.workspaceId),
          isNull(projects.deletedAt),
          ne(projects.status, "archived"),
        ),
      )
      .innerJoin(
        workspaces,
        and(eq(workspaces.id, reviews.workspaceId), isNull(workspaces.deletedAt)),
      )
      .where(
        and(
          // Website reviews collect feedback while still "draft"; only closed ones stop.
          ne(reviews.status, "closed"),
          isNull(reviews.archivedAt),
          isNotNull(reviews.feedbackDeadline),
          gte(reviews.feedbackDeadline, windowStart),
          lte(reviews.feedbackDeadline, windowEnd),
        ),
      )
      .orderBy(asc(reviews.feedbackDeadline), asc(reviews.id))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE);

    for (const row of rows) {
      result.reviewsChecked += 1;
      const deadline = row.deadline;
      if (!deadline) continue;
      const state = classifyDeadlineReminder(deadline, now);
      if (!state) continue;

      try {
        const names = await loadNotificationContext(
          row.workspaceId,
          row.projectId,
          row.reviewId,
        );
        if (!names) continue;
        const recipients = await listActiveWorkspaceMemberIds(row.workspaceId);
        const { created } = await dispatchNotifications(
          recipients.map((recipientUserId) => ({
            recipientUserId,
            actorUserId: null,
            workspaceId: row.workspaceId,
            projectId: row.projectId,
            reviewId: row.reviewId,
            issueId: null,
            type: "review.deadline_reminder" as const,
            dedupeKey: deadlineReminderDedupeKey({
              reviewId: row.reviewId,
              deadline,
              userId: recipientUserId,
            }),
            hrefPath: reviewHref(row.projectId, row.reviewId),
            data: {
              workspaceName: names.workspaceName,
              projectName: names.projectName,
              reviewName: names.reviewName,
              actorName: "Passoff",
              versionLabel: names.versionLabel || undefined,
              deadlineAt: deadline.toISOString(),
              deadlineState: state,
            },
          })),
        );
        result.remindersCreated += created;
      } catch {
        // One review's failure must not stop the others, and never touches deadlines.
        result.failures += 1;
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return result;
}
