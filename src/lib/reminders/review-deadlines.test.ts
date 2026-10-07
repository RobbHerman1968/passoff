import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { notifications, reviews } from "@/db/schema";
import { setEmailTransportForTests } from "@/lib/email";
import { TestEmailTransport } from "@/lib/email/test-transport";
import { runReviewDeadlineReminders } from "@/lib/reminders/review-deadlines";
import { deadlineReminderDedupeKey } from "@/lib/reminders/deadline-window";
import { addWorkspaceMember, seedReviewWithIssue } from "@/test/workspace-fixtures";

const failure = vi.hoisted(() => ({ reviewId: null as string | null }));

vi.mock("@/lib/notifications/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/notifications/service")>();
  return {
    ...original,
    dispatchNotifications: async (
      inputs: Parameters<typeof original.dispatchNotifications>[0],
    ) => {
      if (failure.reviewId && inputs.some((input) => input.reviewId === failure.reviewId)) {
        throw new Error("simulated notification outage");
      }
      return original.dispatchNotifications(inputs);
    },
  };
});

const HOUR = 60 * 60 * 1000;

async function setDeadline(reviewId: string, at: Date) {
  await db.update(reviews).set({ feedbackDeadline: at }).where(eq(reviews.id, reviewId));
}

async function reminderRows(reviewId: string) {
  return db
    .select({
      dedupeKey: notifications.dedupeKey,
      recipientUserId: notifications.recipientUserId,
      data: notifications.data,
    })
    .from(notifications)
    .where(
      and(eq(notifications.reviewId, reviewId), eq(notifications.type, "review.deadline_reminder")),
    );
}

describe("review deadline reminders", { timeout: 60_000 }, () => {
  beforeEach(() => {
    failure.reviewId = null;
    setEmailTransportForTests(new TestEmailTransport());
  });

  it("sends one reminder per member per deadline value, no matter how often it runs", async () => {
    const seeded = await seedReviewWithIssue("remindonce");
    const member = await addWorkspaceMember(seeded.context, "remindmember");
    const now = new Date();
    const deadline = new Date(now.getTime() + 2 * HOUR);
    await setDeadline(seeded.reviewId, deadline);

    await runReviewDeadlineReminders(now);
    const first = await reminderRows(seeded.reviewId);
    expect(first.map((row) => row.recipientUserId).sort()).toEqual(
      [seeded.context.userId, member.userId].sort(),
    );
    expect(first.map((row) => row.dedupeKey)).toContain(
      deadlineReminderDedupeKey({
        reviewId: seeded.reviewId,
        deadline,
        userId: member.userId,
      }),
    );
    expect(first[0]?.data).toMatchObject({
      deadlineState: "upcoming",
      deadlineAt: deadline.toISOString(),
    });

    await runReviewDeadlineReminders(new Date(now.getTime() + 30 * 60 * 1000));
    await runReviewDeadlineReminders(new Date(now.getTime() + HOUR));
    expect(await reminderRows(seeded.reviewId)).toHaveLength(2);

    // A new deadline is a new reminder.
    const moved = new Date(now.getTime() + 5 * HOUR);
    await setDeadline(seeded.reviewId, moved);
    await runReviewDeadlineReminders(now);
    expect(await reminderRows(seeded.reviewId)).toHaveLength(4);
  });

  it("sends past-due reminders inside the grace period only, and skips far-off, closed, and archived reviews", async () => {
    const now = new Date();

    const pastDue = await seedReviewWithIssue("remindpast");
    await setDeadline(pastDue.reviewId, new Date(now.getTime() - 3 * HOUR));

    const ancient = await seedReviewWithIssue("remindancient");
    await setDeadline(ancient.reviewId, new Date(now.getTime() - 30 * 24 * HOUR));

    const farOff = await seedReviewWithIssue("remindfar");
    await setDeadline(farOff.reviewId, new Date(now.getTime() + 5 * 24 * HOUR));

    const closed = await seedReviewWithIssue("remindclosed");
    await setDeadline(closed.reviewId, new Date(now.getTime() + 2 * HOUR));
    await db
      .update(reviews)
      .set({ status: "closed", closedAt: now })
      .where(eq(reviews.id, closed.reviewId));

    const archived = await seedReviewWithIssue("remindarchived");
    await setDeadline(archived.reviewId, new Date(now.getTime() + 2 * HOUR));
    await db.update(reviews).set({ archivedAt: now }).where(eq(reviews.id, archived.reviewId));

    await runReviewDeadlineReminders(now);

    const pastRows = await reminderRows(pastDue.reviewId);
    expect(pastRows).toHaveLength(1);
    expect(pastRows[0]?.data).toMatchObject({ deadlineState: "past_due" });
    expect(await reminderRows(ancient.reviewId)).toHaveLength(0);
    expect(await reminderRows(farOff.reviewId)).toHaveLength(0);
    expect(await reminderRows(closed.reviewId)).toHaveLength(0);
    expect(await reminderRows(archived.reviewId)).toHaveLength(0);
  });

  it("keeps the deadline intact and retries later when notifications fail", async () => {
    const seeded = await seedReviewWithIssue("remindfail");
    const now = new Date();
    const deadline = new Date(now.getTime() + 2 * HOUR);
    await setDeadline(seeded.reviewId, deadline);

    failure.reviewId = seeded.reviewId;
    const failed = await runReviewDeadlineReminders(now);
    expect(failed.failures).toBeGreaterThanOrEqual(1);
    expect(await reminderRows(seeded.reviewId)).toHaveLength(0);

    const [row] = await db
      .select({ deadline: reviews.feedbackDeadline, version: reviews.version })
      .from(reviews)
      .where(eq(reviews.id, seeded.reviewId));
    expect(row.deadline?.getTime()).toBe(deadline.getTime());

    // Next run succeeds once notifications recover.
    failure.reviewId = null;
    await runReviewDeadlineReminders(now);
    expect(await reminderRows(seeded.reviewId)).toHaveLength(1);
  });
});
