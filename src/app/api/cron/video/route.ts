import { runCronJob } from "@/lib/ops/cron";
import {
  processPendingProviderDeletions,
  sweepStaleVideoUploads,
} from "@/lib/video/provider-deletion";
import { runVideoRetention } from "@/lib/video/retention";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Housekeeping for video evidence: retire uploads that never finished, remove clips whose
 * retention period is over (and warn about those that are close), then keep trying to delete
 * stored copies of removed or replaced clips until the provider confirms.
 */
export async function GET(request: Request) {
  return runCronJob("video", request, async () => {
    const stale = await sweepStaleVideoUploads();
    const retention = await runVideoRetention();
    const deletions = await processPendingProviderDeletions({ limit: 25 });
    return { stale, retention, deletions };
  });
}

export async function POST(request: Request) {
  return GET(request);
}
