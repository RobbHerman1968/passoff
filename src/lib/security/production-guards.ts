import { timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

/**
 * Shared switches that keep test-only and operator-only surfaces closed in production.
 * Every route that exists only for automated tests or for Vercel Cron must go through
 * these helpers so the rule is written, and tested, in one place.
 */

/**
 * Test helper routes (seeding, reading the in-memory mailbox, and so on) are only
 * available when the app is explicitly running in test-email mode AND is not a
 * production build. A mistaken `EMAIL_TRANSPORT=test` on a production deployment must
 * never open them.
 */
export function testRoutesEnabled(env: Env = process.env): boolean {
  return env.EMAIL_TRANSPORT === "test" && env.NODE_ENV !== "production";
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Compare against a same-length buffer so a wrong length does not return early.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Cron endpoints accept `Authorization: Bearer $CRON_SECRET` and nothing else.
 *
 * - In production a missing or blank secret means every request is refused.
 * - Outside production a missing secret allows local runs without setup.
 * - The comparison is constant time and ignores the query string and other headers.
 */
export function isAuthorizedCronRequest(request: Request, env: Env = process.env): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  return constantTimeEqual(header.slice("Bearer ".length), secret);
}
