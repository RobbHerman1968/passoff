import { NextResponse } from "next/server";

import { buildFigmaAuthorizationUrl, createOAuthAttempt } from "@/lib/figma/oauth";
import { setOAuthAttemptCookies } from "@/lib/figma/session";
import { getTenantContextForProjectKey } from "@/lib/tenant/context";

export async function GET(request: Request) {
  try {
    const attempt = createOAuthAttempt();
    const projectKey = new URL(request.url).searchParams.get("projectKey");
    const tenant = projectKey ? await getTenantContextForProjectKey(projectKey) : null;
    await setOAuthAttemptCookies(
      attempt.state,
      attempt.verifier,
      tenant
        ? {
            projectId: tenant.projectId,
          }
        : undefined,
    );
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
