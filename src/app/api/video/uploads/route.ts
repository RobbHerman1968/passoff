import { NextResponse } from "next/server";
import { z } from "zod";

import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import { createMuxDirectUpload, getMuxClient, MuxConfigurationError } from "@/lib/video/mux";
import {
  prepareVideoUploadReservation,
  saveVideoUploadReservation,
} from "@/lib/video/upload-service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const runtime = "nodejs";

const requestSchema = z.object({
  issueId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().regex(/^video\//),
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
    return noStoreJson(
      {
        ok: false,
        message: "Choose a video up to 3 minutes and 250 MB, then try again.",
      },
      400,
    );
  }

  const prepared = await prepareVideoUploadReservation(auth.context, parsed.data);
  if (!prepared.ok) {
    return noStoreJson({ ok: false, message: prepared.message }, prepared.status);
  }

  let directUpload;
  try {
    directUpload = await createMuxDirectUpload({
      origin: requestUrl.origin,
      videoAssetId: prepared.reservation.videoAssetId,
    });
  } catch (error) {
    const message =
      error instanceof MuxConfigurationError
        ? "Video uploads aren’t configured yet. Try again later."
        : "We couldn’t start this video upload. Try again.";
    return noStoreJson({ ok: false, message }, 503);
  }

  if (!directUpload.url) {
    return noStoreJson(
      { ok: false, message: "We couldn’t start this video upload. Try again." },
      503,
    );
  }

  try {
    await saveVideoUploadReservation(
      auth.context,
      parsed.data,
      prepared.reservation,
      directUpload.id,
    );
  } catch {
    await getMuxClient().video.uploads.cancel(directUpload.id).catch(() => undefined);
    return noStoreJson(
      { ok: false, message: "We couldn’t save this upload. Try again." },
      503,
    );
  }

  return noStoreJson(
    {
      ok: true,
      endpoint: directUpload.url,
      videoAssetId: prepared.reservation.videoAssetId,
    },
    201,
  );
}

