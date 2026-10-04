import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeVideoPlayback } from "@/lib/video/playback-service";

export const runtime = "nodejs";

const paramsSchema = z.object({
  videoAssetId: z.uuid(),
});

function privateJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ videoAssetId: string }> },
) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return privateJson(
      {
        ok: false,
        code: "not_found",
        message: "This video isn’t available.",
      },
      404,
    );
  }

  const result = await authorizeVideoPlayback(request, parsedParams.data.videoAssetId);
  if (!result.ok) {
    return privateJson(
      {
        ok: false,
        code: result.code,
        message: result.message,
      },
      result.status,
    );
  }

  return privateJson(
    {
      ok: true,
      playbackId: result.playbackId,
      tokens: result.tokens,
      expiresInSeconds: result.expiresInSeconds,
    },
    200,
  );
}
