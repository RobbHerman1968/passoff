import { z } from "zod";

import { decideGuestApproval } from "@/lib/approvals/service";
import { APPROVAL_NOTE_MAX_LENGTH } from "@/lib/approvals/types";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import {
  resolveSdkSession,
  sdkSessionErrorMessage,
} from "@/lib/sdk/session";

export const runtime = "nodejs";

const METHODS = "POST, OPTIONS";
const REQUEST_MAX_BYTES = 8_000;

const decideBodySchema = z
  .object({
    decision: z.enum(["approved", "changes_requested"]),
    note: z.string().max(APPROVAL_NOTE_MAX_LENGTH + 500).optional(),
    deploymentId: z.string().uuid().optional(),
    requestId: z.string().uuid().optional(),
  })
  .strict();

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
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
  const { session, corsOrigin } = sessionLookup;

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > REQUEST_MAX_BYTES) {
      return sdkJsonResponse(
        {
          ok: false,
          error: "validation",
          message: `Keep the note under ${APPROVAL_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters.`,
        },
        400,
        corsOrigin,
        METHODS,
      );
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t read that decision. Try again.",
      },
      400,
      corsOrigin,
      METHODS,
    );
  }

  const parsed = decideBodySchema.safeParse(raw);
  if (!parsed.success) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Choose whether to approve or request changes.",
      },
      400,
      corsOrigin,
      METHODS,
    );
  }

  const result = await decideGuestApproval(session, {
    decision: parsed.data.decision,
    note: parsed.data.note,
    deploymentId: parsed.data.deploymentId ?? null,
    requestId: parsed.data.requestId ?? null,
  });

  if (!result.ok) {
    const status =
      result.error === "validation"
        ? 400
        : result.error === "forbidden"
          ? 403
          : result.error === "not_found"
            ? 404
            : result.error === "unavailable"
              ? 503
              : 409;
    return sdkJsonResponse(
      { ok: false, error: result.error, message: result.message },
      status,
      corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    {
      ok: true,
      approvalId: result.approvalId,
      decision: parsed.data.decision,
      message:
        parsed.data.decision === "approved"
          ? "Thanks. Your approval is recorded for this version."
          : "Thanks. Your requested changes were sent to the team.",
    },
    201,
    corsOrigin,
    METHODS,
  );
}
