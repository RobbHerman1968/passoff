import "server-only";

import { cookies } from "next/headers";

import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  readActiveWorkspace,
  signActiveWorkspace,
} from "@/lib/workspaces/active-cookie";

/** The workspace this person last chose in this browser, if the cookie is genuine. */
export async function readPreferredWorkspaceId(
  userId: string,
): Promise<string | null> {
  try {
    const store = await cookies();
    return readActiveWorkspace(userId, store.get(ACTIVE_WORKSPACE_COOKIE)?.value);
  } catch {
    // Outside a request (scripts, tests) there is no browser to ask.
    return null;
  }
}

/**
 * Remember a choice. Call only after confirming the person is an active member; the
 * cookie never grants access on its own.
 */
export async function rememberActiveWorkspace(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_WORKSPACE_COOKIE, signActiveWorkspace(userId, workspaceId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function forgetActiveWorkspace(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(ACTIVE_WORKSPACE_COOKIE);
  } catch {
    // Nothing to clear outside a request.
  }
}
