import { NextResponse } from "next/server";

import { getAppVersion } from "@/lib/app-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { version: getAppVersion() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
