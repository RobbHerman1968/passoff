import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getAppVersion } from "@/lib/app-version";
import { evaluateReadiness, summarizeReadiness } from "@/lib/ops/readiness";
import { isAuthorizedCronRequest } from "@/lib/security/production-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * Uptime probe. Anyone can ask "is it up?" and gets only yes or no plus the version.
 * With the cron bearer secret the answer also lists which settings are missing or unsafe,
 * by name and plain explanation, never by value.
 */
export async function GET(request: Request) {
  let databaseUp = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    databaseUp = false;
  }

  const base = { ok: databaseUp, version: getAppVersion() };
  const status = databaseUp ? 200 : 503;

  const bearer = request.headers.get("authorization");
  if (!bearer || !isAuthorizedCronRequest(request)) {
    return NextResponse.json(base, { status, headers: NO_STORE });
  }

  const checks = evaluateReadiness(process.env);
  return NextResponse.json(
    { ...base, configuration: { ...summarizeReadiness(checks), checks } },
    { status, headers: NO_STORE },
  );
}
