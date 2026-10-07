import { NextResponse } from "next/server";

import { logOps, safeErrorSummary } from "@/lib/ops/diagnostics";
import { getMuxWebhookClient, MuxConfigurationError } from "@/lib/video/mux";
import { deleteProviderCopyNow } from "@/lib/video/provider-deletion";
import { processMuxWebhookEvent } from "@/lib/video/webhook-service";

export const runtime = "nodejs";

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let event;
  try {
    event = await getMuxWebhookClient().webhooks.unwrap(rawBody, request.headers);
  } catch (error) {
    if (error instanceof MuxConfigurationError) {
      return noStoreJson({ ok: false }, 503);
    }
    return noStoreJson({ ok: false }, 400);
  }

  let result;
  try {
    result = await processMuxWebhookEvent(event);
  } catch (error) {
    // The receipt was released, so Mux's retry is handled again.
    logOps("error", "video.webhook_failed", { eventType: event.type, ...safeErrorSummary(error) });
    return noStoreJson({ ok: false }, 500);
  }

  if (result.ok && result.deleteVideoAssetId) {
    // Best effort now; the scheduled run retries anything that fails.
    await deleteProviderCopyNow(result.deleteVideoAssetId).catch(() => undefined);
  }

  return noStoreJson({ ok: true }, 200);
}
