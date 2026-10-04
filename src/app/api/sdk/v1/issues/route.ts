import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { createSdkIssue, listSdkIssuesForPage } from "@/lib/sdk/issues";
import { normalizePageUrl } from "@/lib/sdk/page-url";
import {
  CREATE_ISSUE_BODY_MAX_BYTES,
  sanitizeIdempotencyKey,
  sdkCreateIssueBodySchema,
} from "@/lib/sdk/sanitize";
import {
  resolveSdkSession,
  sdkSessionErrorMessage,
} from "@/lib/sdk/session";

export const runtime = "nodejs";

const METHODS = "GET, POST, OPTIONS";

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

export async function GET(request: Request) {
  const sessionLookup = await resolveSdkSession(request);
  if (!sessionLookup.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: sessionLookup.reason,
        message: sdkSessionErrorMessage(sessionLookup.reason),
      },
      sessionLookup.status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const url = new URL(request.url);
  const pageUrl = normalizePageUrl(url.searchParams.get("pageUrl"));
  if (!pageUrl) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t tell which page to load.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const listed = await listSdkIssuesForPage(sessionLookup.session, pageUrl);
  if (!listed.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t tell which page to load.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    {
      ok: true,
      issues: listed.issues,
      canComment: sessionLookup.session.canComment,
    },
    200,
    sessionLookup.corsOrigin,
    METHODS,
  );
}

export async function POST(request: Request) {
  const sessionLookup = await resolveSdkSession(request);
  if (!sessionLookup.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: sessionLookup.reason,
        message: sdkSessionErrorMessage(sessionLookup.reason),
      },
      sessionLookup.status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  if (!sessionLookup.session.canComment) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "commenting_disabled",
        message: sdkSessionErrorMessage("commenting_disabled"),
      },
      403,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > CREATE_ISSUE_BODY_MAX_BYTES
  ) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "That feedback is too large to send. Try again without the picture.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > CREATE_ISSUE_BODY_MAX_BYTES) {
      return sdkJsonResponse(
        {
          ok: false,
          error: "validation",
          message:
            "That feedback is too large to send. Try again without the picture.",
        },
        400,
        sessionLookup.corsOrigin,
        METHODS,
      );
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t read that feedback. Try again.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const parsed = sdkCreateIssueBodySchema.safeParse(raw);
  if (!parsed.success) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Enter your feedback, then try adding it again.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const headerKey = sanitizeIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );
  const bodyKey = sanitizeIdempotencyKey(parsed.data.idempotencyKey);
  const idempotencyKey = headerKey ?? bodyKey;
  if (!idempotencyKey) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t safely retry this feedback. Try again.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const fingerprint = await getRequestFingerprint();
  const rate = await enforceInstallationRateLimit({
    scope: "sdk_issue_write",
    subjects: [
      sessionLookup.session.sessionId,
      sessionLookup.session.reviewId,
      fingerprint,
    ],
  });
  if (!rate.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "rate_limited",
        message: "Too many requests. Wait a moment, then try again.",
      },
      429,
      sessionLookup.corsOrigin,
      METHODS,
      rate.retryAfterSeconds,
    );
  }

  const created = await createSdkIssue(sessionLookup.session, {
    body: parsed.data.body,
    priority: parsed.data.priority,
    pageUrl: parsed.data.pageUrl,
    anchor: parsed.data.anchor,
    screenshot: parsed.data.screenshot,
    idempotencyKey,
  });

  if (!created.ok) {
    const status =
      created.error === "validation"
        ? 400
        : created.error === "unavailable"
          ? 503
          : 403;
    const message =
      created.message ??
      (created.error === "commenting_disabled"
        ? sdkSessionErrorMessage("commenting_disabled")
        : created.error === "closed"
          ? sdkSessionErrorMessage("closed")
          : created.error === "unavailable"
            ? "Passoff couldn’t save that feedback. Your text is still here — try again."
            : "You can’t add feedback on this review right now.");
    return sdkJsonResponse(
      { ok: false, error: created.error, message },
      status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    {
      ok: true,
      issue: created.issue,
      replayed: created.replayed,
    },
    created.replayed ? 200 : 201,
    sessionLookup.corsOrigin,
    METHODS,
  );
}
