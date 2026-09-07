import { NextResponse } from "next/server";

import { buildFigmaAuthorizationUrl, createOAuthAttempt } from "@/lib/figma/oauth";
import { setOAuthAttemptCookies } from "@/lib/figma/session";

export async function GET() {
  try {
    const attempt = createOAuthAttempt();
    await setOAuthAttemptCookies(attempt.state, attempt.verifier);
    return NextResponse.redirect(buildFigmaAuthorizationUrl(attempt.state, attempt.challenge));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Figma OAuth.";
    const origin = process.env.FIGMA_REDIRECT_URI
      ? new URL(process.env.FIGMA_REDIRECT_URI).origin
      : "http://localhost:3000";
    const url = new URL("/dashboard", origin);
    url.searchParams.set("figma_error", message);
    return NextResponse.redirect(url);
  }
}
