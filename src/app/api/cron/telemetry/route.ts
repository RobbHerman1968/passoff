import { runCronJob } from "@/lib/ops/cron";
import { runTelemetryMaintenance } from "@/lib/telemetry/aggregate";
import { completePendingComparisons } from "@/lib/findings/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Rolls up usability data and deletes raw events past their retention period. */
export async function GET(request: Request) {
  return runCronJob("telemetry", request, async () => {
    const result = await runTelemetryMaintenance();
    const comparisons = await completePendingComparisons();
    return { ...result, comparisons };
  });
}

export async function POST(request: Request) {
  return GET(request);
}
