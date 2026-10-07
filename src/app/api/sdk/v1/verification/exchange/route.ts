import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { EXCHANGE_BODY_MAX_BYTES, sdkExchangeBodySchema } from "@/lib/sdk/sanitize";
import { getIssueAnchorForVerification } from "@/lib/verification/query";
import { exchangeVerificationSession } from "@/lib/verification/session";
import { absoluteUrl } from "@/lib/site";

export const runtime = "nodejs";

const METHODS = "POST, OPTIONS";

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > EXCHANGE_BODY_MAX_BYTES) {
    return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > EXCHANGE_BODY_MAX_BYTES) {
      return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
  }

  const parsed = sdkExchangeBodySchema.safeParse(raw);
  if (!parsed.success) {
    return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
  }

  const fingerprint = await getRequestFingerprint();
  const result = await exchangeVerificationSession({
    installationKey: parsed.data.installationKey,
    exchangeCode: parsed.data.exchangeCode,
    headerOrigin: request.headers.get("Origin"),
    rateLimitSubjects: [fingerprint],
  });

  if (!result.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: result.code ?? "invalid",
        message:
          result.code === "origin"
            ? "Passoff isn’t allowed on this website address."
            : result.code === "expired"
              ? "This check session expired. Return to the issue and try again."
              : result.code === "disabled"
                ? "Passoff is turned off for this website."
                : result.code === "wrong_environment"
                  ? "This isn’t the website environment for this issue."
                  : "Passoff couldn’t start these checks. Return to the issue and try again.",
      },
      result.status,
      result.corsOrigin,
      METHODS,
      result.retryAfterSeconds,
    );
  }

  const marker = await getIssueAnchorForVerification(
    result.session.workspaceId,
    result.session.issueId,
  );

  let siteOrigin = "";
  try {
    siteOrigin = new URL(absoluteUrl("/")).origin;
  } catch {
    siteOrigin = "";
  }

  return sdkJsonResponse(
    {
      ok: true,
      sessionToken: result.sessionToken,
      expiresAt: result.expiresAt,
      bootstrap: {
        issueNumber: result.session.issueNumber,
        issueTitle: result.session.issueTitle,
        environmentName: result.session.environmentName,
        expectedVersion: result.session.expectedVersion,
        pageRoute: result.session.pageRoute,
        selectedChecks: result.session.selectedChecks,
        namedHook: result.session.namedHook,
        hookAllowlist: result.session.hookAllowlist,
        returnPath: result.session.returnPath,
        siteOrigin,
        marker: marker
          ? {
              stableElementId: marker.stableElementId,
              approvedDataAttributes: marker.approvedDataAttributes ?? {},
              cssSelector: marker.cssSelector,
              ancestryFingerprint: marker.ancestryFingerprint,
              matchConfidence: marker.matchConfidence,
              viewportWidth: marker.viewportWidth,
              viewportHeight: marker.viewportHeight,
            }
          : null,
      },
    },
    200,
    result.corsOrigin,
    METHODS,
  );
}
