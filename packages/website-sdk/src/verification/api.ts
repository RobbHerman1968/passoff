export type VerificationBootstrap = {
  issueNumber: number;
  issueTitle: string;
  environmentName: string;
  expectedVersion: string;
  pageRoute: string | null;
  selectedChecks: string[];
  namedHook: string | null;
  hookAllowlist: string[];
  returnPath: string;
  siteOrigin?: string;
  marker: {
    stableElementId: string | null;
    approvedDataAttributes: Record<string, string>;
    cssSelector: string | null;
    ancestryFingerprint: string | null;
    matchConfidence: string;
    viewportWidth: number | null;
    viewportHeight: number | null;
  } | null;
};

export async function exchangeVerificationSession(options: {
  apiBaseUrl: string;
  installationKey: string;
  exchangeCode: string;
}): Promise<
  | { ok: true; sessionToken: string; expiresAt: string; bootstrap: VerificationBootstrap }
  | { ok: false; error?: string; message: string }
> {
  try {
    const response = await fetch(
      `${options.apiBaseUrl}/api/sdk/v1/verification/exchange`,
      {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          installationKey: options.installationKey,
          exchangeCode: options.exchangeCode,
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          sessionToken?: string;
          expiresAt?: string;
          bootstrap?: VerificationBootstrap;
          error?: string;
          message?: string;
        }
      | null;
    if (!response.ok || !payload?.sessionToken || !payload.bootstrap) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ??
          "Passoff couldn’t start these checks. Return to the issue and try again.",
      };
    }
    return {
      ok: true,
      sessionToken: payload.sessionToken,
      expiresAt: payload.expiresAt ?? "",
      bootstrap: payload.bootstrap,
    };
  } catch {
    return {
      ok: false,
      message:
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You’re offline. Reconnect, then try again."
          : "Passoff couldn’t reach the server. Try again in a moment.",
    };
  }
}

export async function submitVerificationResults(options: {
  apiBaseUrl: string;
  sessionToken: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; message?: string; overall?: string }> {
  try {
    const response = await fetch(`${options.apiBaseUrl}/api/sdk/v1/verification/results`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${options.sessionToken}`,
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify(options.body),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      overall?: string;
    } | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        message:
          payload?.message ??
          "Passoff couldn’t save these check results. They may still be on this page.",
      };
    }
    return { ok: true, overall: payload.overall };
  } catch {
    return { ok: false, message: "Passoff couldn’t save these check results." };
  }
}

export async function submitVerificationEvidence(options: {
  apiBaseUrl: string;
  sessionToken: string;
  body: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const response = await fetch(
      `${options.apiBaseUrl}/api/sdk/v1/verification/evidence`,
      {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${options.sessionToken}`,
        },
        body: JSON.stringify(options.body),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
