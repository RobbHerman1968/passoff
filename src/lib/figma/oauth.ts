import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getFigmaConfig } from "./config";

export type FigmaAuthorizationTokenResponse = {
  user_id_string: string;
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

type FigmaRefreshTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: "bearer";
};

export function createOAuthAttempt() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function buildFigmaAuthorizationUrl(state: string, challenge: string) {
  const config = getFigmaConfig();
  const url = new URL("https://www.figma.com/oauth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "file_content:read");
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

function basicAuthorization() {
  const { clientId, clientSecret } = getFigmaConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function readOAuthResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.access_token !== "string") {
    const message = typeof payload?.message === "string" ? payload.message : typeof payload?.error === "string" ? payload.error : null;
    throw new Error(message || `Figma OAuth request failed (${response.status}).`);
  }
  return payload;
}

export async function exchangeAuthorizationCode(code: string, verifier: string) {
  const config = getFigmaConfig();
  const body = new URLSearchParams({
    redirect_uri: config.redirectUri,
    code,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const response = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const payload = await readOAuthResponse(response);
  if (typeof payload.refresh_token !== "string" || typeof payload.user_id_string !== "string" || typeof payload.expires_in !== "number") {
    throw new Error("Figma returned an incomplete authorization token response.");
  }
  return payload as FigmaAuthorizationTokenResponse;
}

export async function refreshFigmaAccessToken(refreshToken: string) {
  const response = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  const payload = await readOAuthResponse(response);
  if (typeof payload.expires_in !== "number") {
    throw new Error("Figma returned an incomplete refresh token response.");
  }
  return payload as FigmaRefreshTokenResponse;
}
