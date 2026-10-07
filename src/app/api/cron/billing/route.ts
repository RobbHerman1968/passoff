import { runCronJob } from "@/lib/ops/cron";
import { notifyLapsedWorkspaces } from "@/lib/billing/lapse";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily check for workspaces whose payment problem has outlasted the grace period.
 * It only sends owner notices; it never removes or locks anything.
 */
export async function GET(request: Request) {
  return runCronJob("billing", request, async () => {
    return { ...(await notifyLapsedWorkspaces()) };
  });
}

export async function POST(request: Request) {
  return GET(request);
}
