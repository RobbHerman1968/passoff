import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The browser remembers which workspace a person last chose. The cookie holds only the
 * workspace id plus a signature tied to the signed-in person, so it cannot be copied to
 * another account or edited to point somewhere else. It is a preference, not permission:
 * every request still checks that the person is an active member of that workspace.
 */
export const ACTIVE_WORKSPACE_COOKIE = "passoff_active_workspace";
export const ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function resolveSecret(secret?: string): string {
  const value =
    secret ??
    process.env.WORKSPACE_COOKIE_SECRET?.trim() ??
    process.env.AUTH_SECRET?.trim();
  if (!value) {
    throw new Error("AUTH_SECRET is required to remember the active workspace.");
  }
  return value;
}

function sign(userId: string, workspaceId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`active-workspace:v1:${userId}:${workspaceId}`)
    .digest("base64url");
}

export function signActiveWorkspace(
  userId: string,
  workspaceId: string,
  secret?: string,
): string {
  return `${workspaceId}.${sign(userId, workspaceId, resolveSecret(secret))}`;
}

/** Returns the workspace id when the value was signed for this person, otherwise null. */
export function readActiveWorkspace(
  userId: string,
  value: string | null | undefined,
  secret?: string,
): string | null {
  if (!value || value.length > 200) return null;
  const separator = value.indexOf(".");
  if (separator < 0) return null;
  const workspaceId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!isWorkspaceId(workspaceId) || !signature) return null;

  let expected: string;
  try {
    expected = sign(userId, workspaceId, resolveSecret(secret));
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return workspaceId;
}
