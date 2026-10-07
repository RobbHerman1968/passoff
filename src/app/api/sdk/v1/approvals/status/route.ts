import { getGuestApprovalOffer } from "@/lib/approvals/requests";
import { toSdkApprovalView } from "@/lib/approvals/sdk-view";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import {
  resolveSdkSession,
  sdkSessionErrorMessage,
} from "@/lib/sdk/session";

export const runtime = "nodejs";

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

/**
 * Guest-safe approval status for the embed. Tells the panel whether this exact link may
 * decide right now, so the embed never offers a button the server would refuse.
 */
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
  const { session, corsOrigin } = sessionLookup;

  try {
    const offer = await getGuestApprovalOffer(session);
    return sdkJsonResponse(
      { ok: true, approval: offer ? toSdkApprovalView(offer) : null },
      200,
      corsOrigin,
      METHODS,
    );
  } catch {
    return sdkJsonResponse(
      {
        ok: false,
        error: "unavailable",
        message: "Passoff couldn’t load the approval status. Try again in a moment.",
      },
      503,
      corsOrigin,
      METHODS,
    );
  }
}
