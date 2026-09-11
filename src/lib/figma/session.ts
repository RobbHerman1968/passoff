import "server-only";

import { cookies } from "next/headers";

export const FIGMA_CONNECTION_COOKIE = "passoff_figma_connection";
export const FIGMA_OAUTH_STATE_COOKIE = "passoff_figma_oauth_state";
export const FIGMA_PKCE_COOKIE = "passoff_figma_pkce";
export const FIGMA_OAUTH_PROJECT_COOKIE = "passoff_figma_oauth_project";

const baseOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function getFigmaConnectionId() {
  return (await cookies()).get(FIGMA_CONNECTION_COOKIE)?.value ?? null;
}

export async function setOAuthAttemptCookies(
  state: string,
  verifier: string,
  context?: { projectId: string },
) {
  const store = await cookies();
  const options = { ...baseOptions, maxAge: 10 * 60 };
  store.set(FIGMA_OAUTH_STATE_COOKIE, state, options);
  store.set(FIGMA_PKCE_COOKIE, verifier, options);
  if (context) {
    store.set(FIGMA_OAUTH_PROJECT_COOKIE, context.projectId, options);
  }
}

export async function readOAuthAttemptCookies() {
  const store = await cookies();
  return {
    state: store.get(FIGMA_OAUTH_STATE_COOKIE)?.value ?? null,
    verifier: store.get(FIGMA_PKCE_COOKIE)?.value ?? null,
    projectId: store.get(FIGMA_OAUTH_PROJECT_COOKIE)?.value ?? null,
  };
}

export async function clearOAuthAttemptCookies() {
  const store = await cookies();
  store.delete(FIGMA_OAUTH_STATE_COOKIE);
  store.delete(FIGMA_PKCE_COOKIE);
  store.delete(FIGMA_OAUTH_PROJECT_COOKIE);
}

export async function setFigmaConnectionCookie(connectionId: string) {
  (await cookies()).set(FIGMA_CONNECTION_COOKIE, connectionId, {
    ...baseOptions,
    maxAge: 90 * 24 * 60 * 60,
  });
}

export async function clearFigmaConnectionCookie() {
  (await cookies()).delete(FIGMA_CONNECTION_COOKIE);
}
