import { runCronJob } from "@/lib/ops/cron";
import { runReviewDeadlineReminders } from "@/lib/reminders/review-deadlines";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reminder problems never change reviews. A failed run is retried by the next one. */
export async function GET(request: Request) {
  return runCronJob("reminders", request, async () => {
    return { deadlines: await runReviewDeadlineReminders() };
  });
}

export async function POST(request: Request) {
  return GET(request);
}
