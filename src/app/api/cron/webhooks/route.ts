import { runCronJob } from "@/lib/ops/cron";
import { processWebhookDeliveries } from "@/lib/webhooks/deliver";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sends queued outbound webhooks and retries failed ones with backoff. */
export async function GET(request: Request) {
  return runCronJob("webhooks", request, async () => {
    return { ...(await processWebhookDeliveries()) };
  });
}

export async function POST(request: Request) {
  return GET(request);
}
