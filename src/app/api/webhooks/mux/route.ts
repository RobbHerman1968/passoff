import { NextResponse } from "next/server";

import { getMuxWebhookClient, MuxConfigurationError } from "@/lib/video/mux";
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

  try {
    await processMuxWebhookEvent(event);
  } catch {
    return noStoreJson({ ok: false }, 500);
  }

  return noStoreJson({ ok: true }, 200);
}
