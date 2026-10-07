import { runCronJob } from "@/lib/ops/cron";
import { purgeExpiredShortLivedRecords } from "@/lib/ops/expired-records";
import { purgeDeletedWorkspaces } from "@/lib/workspaces/deletion";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Final cleanup for deleted workspaces whose waiting period is over. A workspace is only
 * erased once every stored video copy is confirmed gone. Anything left waits for the next run.
 * Also removes expired reset tokens, launch codes, sessions, and rate-limit counters.
 */
export async function GET(request: Request) {
  return runCronJob("workspaces", request, async () => {
    const workspaces = await purgeDeletedWorkspaces({ limit: 10 });
    // Expired sign-in helpers and rate-limit counters are tidied in the same daily run.
    const expired = await purgeExpiredShortLivedRecords();
    return { ...workspaces, expired };
  });
}

export async function POST(request: Request) {
  return GET(request);
}
