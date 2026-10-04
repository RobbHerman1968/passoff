import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

function looksLikeJwtSession(value: string) {
  return value.includes(".") && value.split(".").length >= 3;
}

function stripLegacySessionCookies(request: NextRequest) {
  const response = NextResponse.next();
  let cleared = false;

  for (const cookie of request.cookies.getAll()) {
    const isSessionCookie =
      cookie.name === "authjs.session-token" ||
      cookie.name === "__Secure-authjs.session-token" ||
      cookie.name === "__Host-authjs.session-token" ||
      cookie.name === "next-auth.session-token" ||
      cookie.name === "__Secure-next-auth.session-token" ||
      cookie.name.startsWith("authjs.session-token.") ||
      cookie.name.startsWith("__Secure-authjs.session-token.") ||
      cookie.name.startsWith("next-auth.session-token.");

    if (isSessionCookie && !looksLikeJwtSession(cookie.value)) {
      response.cookies.delete(cookie.name);
      request.cookies.delete(cookie.name);
      cleared = true;
    }
  }

  return cleared ? response : null;
}

/**
 * Optimistic auth redirects. Full authorization (active workspace membership and
 * session-version checks) is enforced in page loaders and server actions.
 */
export const proxy = auth((request) => {
  const cleared = stripLegacySessionCookies(request);
  if (cleared) {
    return cleared;
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/onboarding/:path*",
    "/admin",
    "/admin/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
  ],
};
