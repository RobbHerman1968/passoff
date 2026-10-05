import { NextResponse } from "next/server";

import { processWebhookDeliveries } from "@/lib/webhooks/deliver";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await processWebhookDeliveries();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return GET(request);
}
