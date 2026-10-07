import { z } from "zod";

import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import { parseIssueNumberParam } from "@/lib/issues/url";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { resolveSdkSession, sdkSessionErrorMessage } from "@/lib/sdk/session";
import {
  createGuestVideoNote,
  listVideoNotesForGuest,
} from "@/lib/video/annotations/service";

export const runtime = "nodejs";

const METHODS = "GET, POST, OPTIONS";
const REQUEST_MAX_BYTES = 16_000;

const createBodySchema = z
  .object({
    videoAssetId: z.uuid(),
    timestampMs: z.number().finite().min(0).max(24 * 60 * 60 * 1000),
    x: z.number().finite().min(0).max(1).nullable().optional(),
    y: z.number().finite().min(0).max(1).nullable().optional(),
    body: z.string().max(ISSUE_COMMENT_MAX_LENGTH + 1_000),
  })
  .strict();

type RouteContext = { params: Promise<{ issueNumber: string }> };

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

/** Public notes on this issue's video. Private notes are never part of this response. */
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

  const listed = await listVideoNotesForGuest(sessionLookup.session, issueNumber);
  if (!listed.ok) {
    const notFound = listed.error === "not_found";
    return sdkJsonResponse(
      {
        ok: false,
        error: listed.error,
        message: notFound
          ? "This issue isn’t available."
          : "Passoff couldn’t load the video notes. Try again in a moment.",
      },
      notFound ? 404 : 503,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    { ok: true, notes: listed.notes, canComment: listed.canComment },
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
    if (text.length > REQUEST_MAX_BYTES) {
      return sdkJsonResponse(
        {
          ok: false,
          error: "validation",
          message: `Keep this note under ${ISSUE_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
        },
        400,
        sessionLookup.corsOrigin,
        METHODS,
      );
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return sdkJsonResponse(
      { ok: false, error: "validation", message: "Passoff couldn’t read that note. Try again." },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Check the time and your note, then try again.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const fingerprint = await getRequestFingerprint();
  const created = await createGuestVideoNote(sessionLookup.session, {
    issueNumber,
    ...parsed.data,
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
            : created.error === "video_unavailable"
              ? 409
              : created.error === "unavailable"
                ? 503
                : 403;
    return sdkJsonResponse(
      { ok: false, error: created.error, message: created.message },
      status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    { ok: true, note: created.note, notes: created.notes },
    201,
    sessionLookup.corsOrigin,
    METHODS,
  );
}
