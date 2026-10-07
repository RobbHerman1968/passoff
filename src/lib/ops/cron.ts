import "server-only";

import { NextResponse } from "next/server";

import { logOps, safeErrorSummary } from "@/lib/ops/diagnostics";
import { isAuthorizedCronRequest } from "@/lib/security/production-guards";

/**
 * One wrapper for every scheduled job: it checks the cron secret, times the run, logs a
 * privacy-safe completion or failure line, and answers `{ ok: false }` with a 500 when the
 * job throws. A failed run changes nothing by itself; the next scheduled run tries again.
 */
export async function runCronJob(
  name: string,
  request: Request,
  job: () => Promise<Record<string, unknown>>,
): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await job();
    logOps("info", "cron.completed", { job: name, durationMs: Date.now() - started });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logOps("error", "cron.failed", {
      job: name,
      durationMs: Date.now() - started,
      ...safeErrorSummary(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
