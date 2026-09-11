import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createConnection } from "@/lib/figma/data";
import { exchangeAuthorizationCode } from "@/lib/figma/oauth";
import {
  clearOAuthAttemptCookies,
  readOAuthAttemptCookies,
  setFigmaConnectionCookie,
} from "@/lib/figma/session";
import { projectDesignsPath, projectRoomDesignsPath } from "@/lib/rooms/routes";
import { getPrototypeTenantContext, getTenantContextForProjectKey } from "@/lib/tenant/context";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const attempt = await readOAuthAttemptCookies();
  const destination = new URL("/dashboard", request.nextUrl.origin);

  try {
    const tenant = attempt.projectId
      ? await getTenantContextForProjectKey(attempt.projectId)
      : await getPrototypeTenantContext();
    destination.pathname = tenant.roomId
      ? projectRoomDesignsPath(tenant.projectId, tenant.roomId)
      : projectDesignsPath(tenant.projectId);
    if (!code || !returnedState || !attempt.state || !attempt.verifier) {
      throw new Error("The Figma authorization response was incomplete or expired.");
    }
    if (!safeEqual(returnedState, attempt.state)) {
      throw new Error("The Figma authorization state did not match. Please try connecting again.");
    }
    const tokens = await exchangeAuthorizationCode(code, attempt.verifier);
    const connectionId = await createConnection({
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      connectedByUserId: tenant.userId,
      figmaUserId: tokens.user_id_string,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
    await setFigmaConnectionCookie(connectionId);
    destination.searchParams.set("figma", "connected");
  } catch (error) {
    destination.searchParams.set("figma_error", error instanceof Error ? error.message : "Figma authorization failed.");
  } finally {
    await clearOAuthAttemptCookies();
  }
  return NextResponse.redirect(destination);
}
