import { NextResponse } from "next/server";
import { z } from "zod";

import {
  analyzeWebsiteForReview,
  getLatestWebsiteAnalysis,
} from "@/lib/website-analysis/service";
import { DETECTED_PLATFORMS } from "@/lib/website-analysis/platforms";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

const analyzeBodySchema = z.object({
  force: z.boolean().optional(),
  manualPlatform: z.enum(DETECTED_PLATFORMS).optional(),
});

function json(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: HeadersInit,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...extraHeaders,
    },
  });
}

type RouteContext = {
  params: Promise<{ projectId: string; reviewId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return json(
      {
        ok: false,
        error: "forbidden",
        message: "Sign in to view website analysis.",
      },
      401,
    );
  }

  const { projectId, reviewId } = await context.params;
  try {
    const analysis = await getLatestWebsiteAnalysis(
      auth.context,
      projectId,
      reviewId,
    );
    return json({ ok: true, analysis });
  } catch {
    return json(
      {
        ok: false,
        error: "unavailable",
        message: "We couldn’t load website analysis right now.",
      },
      503,
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return json(
      {
        ok: false,
        error: "forbidden",
        message: "Sign in to analyze this website.",
      },
      401,
    );
  }

  const { projectId, reviewId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json(
      {
        ok: false,
        error: "unavailable",
        message: "We couldn’t read that request. Try again.",
      },
      400,
    );
  }

  const parsed = analyzeBodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "unavailable",
        message: "Choose a supported option and try again.",
      },
      400,
    );
  }

  const result = await analyzeWebsiteForReview(auth.context, {
    projectId,
    reviewId,
    force: parsed.data.force,
    manualPlatform: parsed.data.manualPlatform,
  });

  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "not_found"
          ? 404
          : result.error === "rate_limited"
            ? 429
            : result.error === "in_progress"
              ? 409
              : 503;
    return json(
      {
        ok: false,
        error: result.error,
        message: result.message,
      },
      status,
      result.retryAfterSeconds
        ? { "Retry-After": String(result.retryAfterSeconds) }
        : undefined,
    );
  }

  return json({
    ok: true,
    analysis: result.analysis,
  });
}
