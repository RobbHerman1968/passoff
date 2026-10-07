import { describe, expect, it } from "vitest";

import {
  classifyDeadlineReminder,
  deadlineReminderDedupeKey,
  DEADLINE_REMINDER_LEAD_MS,
  DEADLINE_REMINDER_PAST_DUE_GRACE_MS,
} from "@/lib/reminders/deadline-window";

const now = new Date("2026-10-07T12:00:00.000Z");
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe("deadline reminder window", () => {
  it("reminds within a day before, and shortly after, the deadline only", () => {
    expect(classifyDeadlineReminder(at(DEADLINE_REMINDER_LEAD_MS + 1), now)).toBeNull();
    expect(classifyDeadlineReminder(at(DEADLINE_REMINDER_LEAD_MS), now)).toBe("upcoming");
    expect(classifyDeadlineReminder(at(60_000), now)).toBe("upcoming");
    expect(classifyDeadlineReminder(at(0), now)).toBe("upcoming");
    expect(classifyDeadlineReminder(at(-1), now)).toBe("past_due");
    expect(classifyDeadlineReminder(at(-DEADLINE_REMINDER_PAST_DUE_GRACE_MS), now)).toBe(
      "past_due",
    );
    expect(classifyDeadlineReminder(at(-DEADLINE_REMINDER_PAST_DUE_GRACE_MS - 1), now)).toBeNull();
  });

  it("builds one stable key per review, deadline value, and person", () => {
    const deadline = new Date("2026-10-08T09:30:00.000Z");
    const key = deadlineReminderDedupeKey({ reviewId: "r1", deadline, userId: "u1" });
    expect(key).toBe("review.deadline_reminder:r1:2026-10-08T09:30:00.000Z:u1");
    expect(deadlineReminderDedupeKey({ reviewId: "r1", deadline, userId: "u1" })).toBe(key);
    expect(
      deadlineReminderDedupeKey({
        reviewId: "r1",
        deadline: new Date("2026-10-09T09:30:00.000Z"),
        userId: "u1",
      }),
    ).not.toBe(key);
    expect(deadlineReminderDedupeKey({ reviewId: "r1", deadline, userId: "u2" })).not.toBe(key);
  });
});
