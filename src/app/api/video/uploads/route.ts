import { NextResponse } from "next/server";
import { z } from "zod";

import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import { videoLimitsSentence } from "@/lib/video/states";
import {
  cancelMuxUpload,
  createMuxDirectUpload,
  MuxConfigurationError,
} from "@/lib/video/mux";
import {
  attachProviderUpload,
  discardReservation,
  reserveVideoUpload,
} from "@/lib/video/upload-service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const runtime = "nodejs";

const requestSchema = z.object({
  issueId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  fileBytes: z.number().int().positive().max(VIDEO_EVIDENCE_COMMON_LIMITS.maxClipBytes),
  durationSeconds: z
    .number()
    .positive()
    .max(VIDEO_EVIDENCE_COMMON_LIMITS.maxClipDurationSeconds),
});

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Starts a video upload for an issue. Passoff checks permission, the issue, the plan, and
 * the file's reported size and length, saves the upload, then returns a one-time address
 * the browser sends the file to. The file itself never passes through Passoff.
 */
export async function POST(request: Request) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return noStoreJson(
      {
        ok: false,
        message:
          auth.reason === "unauthenticated"
            ? "Sign in to add video evidence."
            : "Finish setting up your workspace before adding video evidence.",
      },
      auth.reason === "unauthenticated" ? 401 : 403,
    );
  }

  const requestUrl = new URL(request.url);
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && requestOrigin !== requestUrl.origin) {
    return noStoreJson({ ok: false, message: "This upload request isn’t allowed." }, 403);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStoreJson({ ok: false, message: videoLimitsSentence() }, 400);
  }

  let reserved;
  try {
    reserved = await reserveVideoUpload(auth.context, parsed.data);
  } catch {
    return noStoreJson(
      { ok: false, message: "We couldn’t start this video upload. Try again." },
      503,
    );
  }
  if (!reserved.ok) {
    return noStoreJson(
      { ok: false, code: reserved.code, message: reserved.message },
      reserved.status,
    );
  }
  const { reservation } = reserved;

  let directUpload;
  try {
    directUpload = await createMuxDirectUpload({
      origin: requestUrl.origin,
      videoAssetId: reservation.videoAssetId,
    });
  } catch (error) {
    await discardReservation(auth.context, reservation).catch(() => undefined);
    const message =
      error instanceof MuxConfigurationError
        ? "Video uploads aren’t set up yet. Try again later."
        : "We couldn’t start this video upload. Try again.";
    return noStoreJson({ ok: false, message }, 503);
  }

  if (!directUpload.url) {
    await cancelMuxUpload(directUpload.id).catch(() => undefined);
    await discardReservation(auth.context, reservation).catch(() => undefined);
    return noStoreJson(
      { ok: false, message: "We couldn’t start this video upload. Try again." },
      503,
    );
  }

  try {
    await attachProviderUpload(auth.context, reservation, directUpload.id);
  } catch {
    await cancelMuxUpload(directUpload.id).catch(() => undefined);
    await discardReservation(auth.context, reservation).catch(() => undefined);
    return noStoreJson(
      { ok: false, message: "We couldn’t save this upload. Try again." },
      503,
    );
  }

  // Only the one-time upload address and our own record id leave the server.
  return noStoreJson(
    {
      ok: true,
      endpoint: directUpload.url,
      videoAssetId: reservation.videoAssetId,
      mode: reservation.mode,
    },
    201,
  );
}
