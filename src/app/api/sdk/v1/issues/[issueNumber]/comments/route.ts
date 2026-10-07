import { z } from "zod";

import {
  createGuestIssueComment,
  listGuestIssueComments,
} from "@/lib/comments/service";
import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { parseIssueNumberParam } from "@/lib/issues/url";
import {
  resolveSdkSession,
  sdkSessionErrorMessage,
} from "@/lib/sdk/session";

export const runtime = "nodejs";

const METHODS = "GET, POST, OPTIONS";
const COMMENT_REQUEST_MAX_BYTES = 16_000;

const createCommentBodySchema = z
  .object({
    body: z.string().max(ISSUE_COMMENT_MAX_LENGTH + 1_000),
  })
  .strict();

type RouteContext = { params: Promise<{ issueNumber: string }> };

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

export async function GET(request: Request, context: RouteContext) {
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

  const issueNumber = parseIssueNumberParam((await context.params).issueNumber);
  if (!issueNumber) {
    return sdkJsonResponse(
      { ok: false, error: "not_found", message: "This issue isn’t available." },
      404,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const listed = await listGuestIssueComments(sessionLookup.session, issueNumber);
  if (!listed.ok) {
    const notFound = listed.error === "not_found";
    return sdkJsonResponse(
      {
        ok: false,
        error: listed.error,
        message: notFound
          ? "This issue isn’t available."
          : "Passoff couldn’t load the discussion. Try again in a moment.",
      },
      notFound ? 404 : 503,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    {
      ok: true,
      comments: listed.comments,
      canComment: listed.canComment,
    },
    200,
    sessionLookup.corsOrigin,
    METHODS,
  );
}

export async function POST(request: Request, context: RouteContext) {
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

  const issueNumber = parseIssueNumberParam((await context.params).issueNumber);
  if (!issueNumber) {
    return sdkJsonResponse(
      { ok: false, error: "not_found", message: "This issue isn’t available." },
      404,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > COMMENT_REQUEST_MAX_BYTES) {
      return sdkJsonResponse(
        {
          ok: false,
          error: "validation",
          message: `Keep this reply under ${ISSUE_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
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
        message: "Passoff couldn’t read that reply. Try again.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const parsed = createCommentBodySchema.safeParse(raw);
  if (!parsed.success) {
    return sdkJsonResponse(
      { ok: false, error: "validation", message: "Enter a reply." },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const fingerprint = await getRequestFingerprint();
  const created = await createGuestIssueComment(sessionLookup.session, {
    issueNumber,
    body: parsed.data.body,
    rateLimitSubjects: [fingerprint],
  });

  if (!created.ok) {
    const status =
      created.error === "validation"
        ? 400
        : created.error === "rate_limited"
          ? 429
          : created.error === "not_found"
            ? 404
            : created.error === "unavailable"
              ? 503
              : 403;
    const message =
      created.message ??
      (created.error === "not_found"
        ? "This issue isn’t available."
        : created.error === "unavailable"
          ? "Passoff couldn’t save that reply. Your text is still here. Try again."
          : "You can’t reply on this review right now.");
    return sdkJsonResponse(
      { ok: false, error: created.error, message },
      status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    { ok: true, comment: created.comment },
    201,
    sessionLookup.corsOrigin,
    METHODS,
  );
}
