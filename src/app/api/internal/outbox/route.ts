import { NextResponse } from "next/server";

import {
  markOrphanedUploads,
  processBlobDeletionBatch,
} from "@/lib/rooms/service";
import { processOutboxBatch } from "@/lib/rooms/outbox";
import { logInfo, logWarn } from "@/lib/logging";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.PASSOFF_CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || token !== secret) {
    return false;
  }
  return true;
}

async function runJobs() {
  const outbox = await processOutboxBatch(50);
  const orphans = await markOrphanedUploads();
  const deletions = await processBlobDeletionBatch(25);
  logInfo("cron.outbox", { outbox, orphans, deletions });
  return { outbox, orphans, deletions };
}

/** Vercel Cron invokes GET with Authorization: Bearer ${CRON_SECRET}. Schedules use UTC. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runJobs();
    return NextResponse.json(result);
  } catch (error) {
    logWarn("cron.outbox_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed." },
      { status: 500 },
    );
  }
}

/** Kept for manual/local runners. */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runJobs();
  return NextResponse.json(result);
}
