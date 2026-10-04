import "server-only";

import { cookies } from "next/headers";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

/**
 * Legacy database-session cookies are opaque tokens (often UUIDs).
 * JWT/JWE session cookies are dotted compact serializations.
 */
function looksLikeJwtSession(value: string) {
  return value.includes(".") && value.split(".").length >= 3;
}

export async function clearStaleAuthSessionCookies() {
  const cookieStore = await cookies();
  const present = cookieStore.getAll();

  for (const cookie of present) {
    const isSessionCookie =
      SESSION_COOKIE_NAMES.includes(
        cookie.name as (typeof SESSION_COOKIE_NAMES)[number],
      ) ||
      cookie.name.startsWith("authjs.session-token.") ||
      cookie.name.startsWith("__Secure-authjs.session-token.") ||
      cookie.name.startsWith("next-auth.session-token.");

    if (!isSessionCookie) {
      continue;
    }

    if (!looksLikeJwtSession(cookie.value)) {
      cookieStore.delete(cookie.name);
    }
  }
}
