import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth/email";
import { setEmailTransportForTests } from "@/lib/email";
import { getTestEmailTransport } from "@/lib/email/test-transport";
import { testRoutesEnabled } from "@/lib/security/production-guards";

/**
 * Test-only helper for retrieving workspace invitation paths from the in-memory
 * email transport. Requires EMAIL_TRANSPORT=test.
 */
export async function GET(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  setEmailTransportForTests(getTestEmailTransport());

  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return NextResponse.json({ path: null }, { status: 400 });
  }

  const path = getTestEmailTransport().extractInvitationPath(normalizeEmail(email));
  return NextResponse.json({ path });
}
