import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth/email";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { getTestEmailTransport } from "@/lib/email/test-transport";
import { setEmailTransportForTests } from "@/lib/email";
import { testRoutesEnabled } from "@/lib/security/production-guards";

/**
 * Test helper: request a reset and return the path from the in-memory transport.
 * Disabled unless EMAIL_TRANSPORT=test (or local development/test).
 */
export async function POST(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  setEmailTransportForTests(getTestEmailTransport());

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!email) {
    return NextResponse.json({ path: null }, { status: 400 });
  }

  const transport = getTestEmailTransport();
  transport.clear();
  await requestPasswordReset(email);
  const path = transport.extractResetPath(email);

  return NextResponse.json({ path });
}
