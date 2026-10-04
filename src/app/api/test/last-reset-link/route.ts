import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth/email";
import { setEmailTransportForTests } from "@/lib/email";
import { getTestEmailTransport } from "@/lib/email/test-transport";

/**
 * Test-only helper for retrieving password-reset paths from the in-memory
 * email transport. Requires EMAIL_TRANSPORT=test.
 */
export async function GET(request: Request) {
  if (process.env.EMAIL_TRANSPORT !== "test") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  setEmailTransportForTests(getTestEmailTransport());

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  if (!email) {
    return NextResponse.json({ path: null }, { status: 400 });
  }

  const path = getTestEmailTransport().extractResetPath(normalizeEmail(email));
  return NextResponse.json({ path });
}
