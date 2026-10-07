import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { activityEvents, reviews } from "@/db/schema";
import {
  getReviewFeedbackDeadline,
  setReviewFeedbackDeadline,
} from "@/lib/reviews/deadline";
import { seedReviewWithIssue } from "@/test/workspace-fixtures";

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("review feedback deadline", { timeout: 60_000 }, () => {
  it("sets, changes, and clears a deadline for a member", async () => {
    const seeded = await seedReviewWithIssue("deadline");
    const scope = { projectId: seeded.projectId, reviewId: seeded.reviewId };

    const when = inDays(3);
    const set = await setReviewFeedbackDeadline(seeded.context, {
      ...scope,
      deadline: when.toISOString(),
    });
    expect(set.ok && set.changed).toBe(true);
    expect((await getReviewFeedbackDeadline(seeded.context, scope.projectId, scope.reviewId))?.getTime()).toBe(
      when.getTime(),
    );

    const same = await setReviewFeedbackDeadline(seeded.context, {
      ...scope,
      deadline: when.toISOString(),
    });
    expect(same.ok && same.changed).toBe(false);

    const cleared = await setReviewFeedbackDeadline(seeded.context, { ...scope, deadline: "" });
    expect(cleared.ok && cleared.deadline).toBeNull();
    expect(await getReviewFeedbackDeadline(seeded.context, scope.projectId, scope.reviewId)).toBeNull();

    const events = await db
      .select({ type: activityEvents.type })
      .from(activityEvents)
      .where(eq(activityEvents.reviewId, seeded.reviewId));
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["review.deadline_set", "review.deadline_cleared"]),
    );
  });

  it("rejects past, invalid, and far-future values with friendly messages and keeps the old deadline", async () => {
    const seeded = await seedReviewWithIssue("deadlinebad");
    const scope = { projectId: seeded.projectId, reviewId: seeded.reviewId };
    const keep = inDays(2);
    await setReviewFeedbackDeadline(seeded.context, { ...scope, deadline: keep.toISOString() });

    for (const deadline of [inDays(-1).toISOString(), "not a date", inDays(900).toISOString()]) {
      const result = await setReviewFeedbackDeadline(seeded.context, { ...scope, deadline });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("validation");
        expect(result.message).not.toMatch(/error|exception|undefined/i);
      }
    }
    expect((await getReviewFeedbackDeadline(seeded.context, scope.projectId, scope.reviewId))?.getTime()).toBe(
      keep.getTime(),
    );
  });

  it("denies another workspace and archived reviews", async () => {
    const mine = await seedReviewWithIssue("deadlinemine");
    const other = await seedReviewWithIssue("deadlineother");

    const cross = await setReviewFeedbackDeadline(mine.context, {
      projectId: other.projectId,
      reviewId: other.reviewId,
      deadline: inDays(2).toISOString(),
    });
    expect(cross.ok).toBe(false);
    expect(
      await getReviewFeedbackDeadline(mine.context, other.projectId, other.reviewId),
    ).toBeNull();
    const [untouched] = await db
      .select({ deadline: reviews.feedbackDeadline })
      .from(reviews)
      .where(eq(reviews.id, other.reviewId));
    expect(untouched.deadline).toBeNull();

    await db.update(reviews).set({ archivedAt: new Date() }).where(eq(reviews.id, mine.reviewId));
    const archived = await setReviewFeedbackDeadline(mine.context, {
      projectId: mine.projectId,
      reviewId: mine.reviewId,
      deadline: inDays(2).toISOString(),
    });
    expect(archived.ok).toBe(false);
    if (!archived.ok) expect(archived.error).toBe("read_only");
  });
});
