/**
 * Shared, pure reminder rules. Story 3 approval reminders should reuse the same
 * pattern: a pure "is it time?" check, a stable dedupe key, and the notification
 * dispatcher. See docs/REMINDERS.md.
 */

/** Remind when a deadline is this close (or already passed). */
export const DEADLINE_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
/** Stop reminding about a deadline that passed longer ago than this. */
export const DEADLINE_REMINDER_PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type DeadlineReminderState = "upcoming" | "past_due";

export function classifyDeadlineReminder(
  deadline: Date,
  now: Date,
): DeadlineReminderState | null {
  const untilDeadline = deadline.getTime() - now.getTime();
  if (untilDeadline > DEADLINE_REMINDER_LEAD_MS) return null;
  if (untilDeadline >= 0) return "upcoming";
  if (-untilDeadline <= DEADLINE_REMINDER_PAST_DUE_GRACE_MS) return "past_due";
  return null;
}

/**
 * One reminder per person per deadline value. Changing the deadline produces a
 * new key, so people are reminded again about the new date.
 */
export function deadlineReminderDedupeKey(input: {
  reviewId: string;
  deadline: Date;
  userId: string;
}): string {
  return `review.deadline_reminder:${input.reviewId}:${input.deadline.toISOString()}:${input.userId}`;
}
