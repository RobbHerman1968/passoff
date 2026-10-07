# Reminders

Reminders are ordinary notifications created on a schedule. They reuse the notification
table, email delivery, and per-category email preferences. There is no separate reminder
ledger.

## How feedback-deadline reminders work (MVP Cleanup Story 2)

- A member sets or clears `reviews.feedbackDeadline` from the review page
  (`src/lib/reviews/deadline.ts`). Setting the deadline never sends or schedules anything.
- `GET/POST /api/cron/reminders` (every 15 minutes, `vercel.json`) calls
  `runReviewDeadlineReminders` in `src/lib/reminders/review-deadlines.ts`. It uses the same
  `CRON_SECRET` bearer check as the other cron routes.
- A review is eligible when it is not closed, not archived, in an active project, and its
  deadline is within the next 24 hours or passed within the last 7 days
  (`src/lib/reminders/deadline-window.ts`).
- Recipients are active workspace members. Guest reviewers are not reminded yet.
- Notification type: `review.deadline_reminder`. Email category: `approval`.

### Idempotency

Each notification has a unique `dedupeKey`:

```
review.deadline_reminder:{reviewId}:{deadlineISO}:{userId}
```

`dispatchNotifications` inserts with `ON CONFLICT DO NOTHING` on that key, so running the cron
any number of times creates one reminder per person per deadline value. Changing the deadline
changes the key, so people are reminded about the new date. A member who joins later is
reminded on the next run.

### Failure isolation

The reminder job only reads `reviews`. It never writes to them, so a failed notification or
email cannot change or lose a deadline. Each review is handled in its own `try/catch`; a
failure is counted in the cron response and retried on the next run (the dedupe key means
anything already sent is skipped).

## Guidance for Story 3 approval reminders

Reuse this pattern instead of building a new scheduler:

1. Add a pure "is it time?" helper next to `deadline-window.ts`.
2. Add a notification type to `src/lib/notifications/types.ts` (types, plain-language copy,
   email category). `approval` is the right category for approval nudges.
3. Build a stable dedupe key that includes everything that should trigger a new reminder
   (for example the approval request id and the deployment version), plus the recipient id.
4. Add a function beside `runReviewDeadlineReminders`, and call it from
   `src/app/api/cron/reminders/route.ts` so one cron serves every reminder kind.
5. Keep the job read-only with respect to the thing being reminded about, and test
   idempotency, a changed trigger value, closed/archived exclusion, and failure isolation as in
   `src/lib/reminders/review-deadlines.test.ts`.

Not covered yet: reminders for guests who gave an email address, per-person quiet hours or
snooze, and in-app reminder preferences separate from the approval email category.
