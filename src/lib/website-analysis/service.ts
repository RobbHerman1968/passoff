import "server-only";

import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  projectEnvironments,
  projects,
  reviews,
  websiteAnalyses,
} from "@/db/schema";
import { collectPageSignals } from "@/lib/website-analysis/detect";
import { toEvidenceSummary } from "@/lib/website-analysis/evidence-summary";
import {
  buildDeterministicAnalysisResult,
  buildUnreachableAnalysisResult,
} from "@/lib/website-analysis/fallback";
import { fetchPageForAnalysis } from "@/lib/website-analysis/fetch-page";
import { analyzeEvidenceWithOpenAI } from "@/lib/website-analysis/openai-analyze";
import {
  isDetectedPlatform,
  type DetectedPlatform,
} from "@/lib/website-analysis/platforms";
import {
  acquireWebsiteAnalysisLock,
  enforceWebsiteAnalysisRateLimits,
  releaseWebsiteAnalysisLock,
} from "@/lib/website-analysis/rate-limit";
import {
  websiteAnalysisResultSchema,
  type AnalysisSource,
  type AnalysisStatus,
  type EvidenceSummary,
  type SanitizedEvidence,
} from "@/lib/website-analysis/schema";
import type { WebsiteAnalysisPublic } from "@/lib/website-analysis/types";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type { WebsiteAnalysisPublic } from "@/lib/website-analysis/types";

type ServiceError =
  | "forbidden"
  | "not_found"
  | "archived_readonly"
  | "rate_limited"
  | "in_progress"
  | "unavailable";

type AnalyzeInput = {
  projectId: string;
  reviewId: string;
  force?: boolean;
  manualPlatform?: string;
};

async function loadReviewInstallation(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
) {
  const [row] = await db
    .select({
      reviewId: reviews.id,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      startingUrl: projectEnvironments.baseUrl,
      allowedOrigins: projectEnvironments.allowedOrigins,
      projectStatus: projects.status,
    })
    .from(reviews)
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, reviews.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
        eq(projectEnvironments.projectId, projectId),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, reviews.projectId),
        eq(projects.workspaceId, context.workspaceId),
      ),
    )
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.projectId, projectId),
        eq(reviews.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);

  return row ?? null;
}

function toPublic(row: {
  id: string;
  status: AnalysisStatus;
  source: string | null;
  result: Record<string, unknown> | null;
  evidenceSummary: Record<string, unknown> | null;
  modelId: string | null;
  completedAt: Date | null;
  cached?: boolean;
  message?: string | null;
}): WebsiteAnalysisPublic {
  const parsedResult = row.result
    ? websiteAnalysisResultSchema.safeParse(row.result)
    : null;

  return {
    id: row.id,
    status: row.status,
    source: (row.source as AnalysisSource | null) ?? null,
    result: parsedResult?.success ? parsedResult.data : null,
    evidenceSummary: (row.evidenceSummary as EvidenceSummary | null) ?? null,
    modelId: row.modelId,
    cached: Boolean(row.cached),
    tailoredAvailable: row.source === "openai" || row.source === "cached",
    message: row.message ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function getLatestWebsiteAnalysis(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
): Promise<WebsiteAnalysisPublic | null> {
  const review = await loadReviewInstallation(context, projectId, reviewId);
  if (!review) return null;

  const [row] = await db
    .select()
    .from(websiteAnalyses)
    .where(
      and(
        eq(websiteAnalyses.workspaceId, context.workspaceId),
        eq(websiteAnalyses.projectId, projectId),
        eq(websiteAnalyses.reviewId, reviewId),
        ne(websiteAnalyses.status, "running"),
        isNotNull(websiteAnalyses.completedAt),
      ),
    )
    .orderBy(desc(websiteAnalyses.completedAt))
    .limit(1);

  if (!row) return null;
  return toPublic(row);
}

async function findCachedAnalysis(input: {
  workspaceId: string;
  reviewId: string;
  fingerprint: string;
}) {
  const [row] = await db
    .select()
    .from(websiteAnalyses)
    .where(
      and(
        eq(websiteAnalyses.workspaceId, input.workspaceId),
        eq(websiteAnalyses.reviewId, input.reviewId),
        eq(websiteAnalyses.evidenceFingerprint, input.fingerprint),
        sql`${websiteAnalyses.status} in ('succeeded', 'fallback')`,
        isNotNull(websiteAnalyses.completedAt),
      ),
    )
    .orderBy(desc(websiteAnalyses.completedAt))
    .limit(1);
  return row ?? null;
}

function unreachableEvidence(origin: string): SanitizedEvidence {
  return {
    normalizedOrigin: origin,
    finalUrlOrigin: origin,
    contentType: null,
    metaGenerator: null,
    safeHeaders: [],
    scriptAssets: [],
    stylesheetAssets: [],
    frameworkMarkers: [],
    cmsMarkers: [],
    hasGoogleTagManager: false,
    hasPassoffScript: false,
    appearsAuthenticated: false,
    appearsClientRendered: false,
    reachable: false,
    csp: {
      present: false,
      scriptSrcHosts: [],
      blocksInlineScripts: false,
      restrictsThirdPartyScripts: false,
      rawDirectiveNames: [],
    },
    deterministicCandidates: [
      {
        platform: "unknown",
        score: 0,
        reasons: ["The website could not be inspected from Passoff."],
      },
    ],
    conflictingEvidence: [],
    analyzerWarnings: [],
  };
}

export async function analyzeWebsiteForReview(
  context: WorkspaceContext,
  input: AnalyzeInput,
): Promise<
  | { ok: true; analysis: WebsiteAnalysisPublic }
  | { ok: false; error: ServiceError; message: string; retryAfterSeconds?: number }
> {
  if (!canMutateProjects(context)) {
    return {
      ok: false,
      error: "forbidden",
      message: "You don’t have permission to manage this review.",
    };
  }

  const review = await loadReviewInstallation(
    context,
    input.projectId,
    input.reviewId,
  );
  if (!review) {
    return {
      ok: false,
      error: "not_found",
      message: "We couldn’t find website setup for this review.",
    };
  }
  if (review.projectStatus === "archived") {
    return {
      ok: false,
      error: "archived_readonly",
      message: "Restore this project before analyzing the website.",
    };
  }

  let manualPlatform: DetectedPlatform | undefined;
  if (input.manualPlatform) {
    if (!isDetectedPlatform(input.manualPlatform)) {
      return {
        ok: false,
        error: "unavailable",
        message: "Choose a supported platform from the list.",
      };
    }
    manualPlatform = input.manualPlatform;
  }

  const rate = await enforceWebsiteAnalysisRateLimits({
    workspaceId: context.workspaceId,
    reviewId: input.reviewId,
  });
  if (!rate.ok) {
    return {
      ok: false,
      error: "rate_limited",
      message:
        "You’ve analyzed websites enough times for now. Try again in a little while.",
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const lock = await acquireWebsiteAnalysisLock({
    workspaceId: context.workspaceId,
    reviewId: input.reviewId,
  });
  if (!lock.ok) {
    return {
      ok: false,
      error: "in_progress",
      message: "An analysis is already running for this review. Wait a moment, then try again.",
      retryAfterSeconds: lock.retryAfterSeconds,
    };
  }

  let analysisId: string | null = null;

  try {
    const [running] = await db
      .insert(websiteAnalyses)
      .values({
        workspaceId: context.workspaceId,
        projectId: review.projectId,
        reviewId: review.reviewId,
        environmentId: review.environmentId,
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: websiteAnalyses.id });

    analysisId = running?.id ?? null;
    if (!analysisId) {
      return {
        ok: false,
        error: "unavailable",
        message: "We couldn’t start website analysis right now. Try again.",
      };
    }

    // Manual platform selection skips network/OpenAI when the customer chooses.
    if (manualPlatform) {
      const evidence = unreachableEvidence(
        (() => {
          try {
            return new URL(review.startingUrl).origin;
          } catch {
            return review.startingUrl;
          }
        })(),
      );
      const result = buildDeterministicAnalysisResult(evidence, {
        manualPlatform,
      });
      const summary = toEvidenceSummary(evidence);
      const completedAt = new Date();
      await db
        .update(websiteAnalyses)
        .set({
          status: "succeeded",
          source: "manual",
          result,
          evidenceSummary: summary,
          evidenceFingerprint: `manual:${manualPlatform}`,
          modelId: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(websiteAnalyses.id, analysisId));

      return {
        ok: true,
        analysis: toPublic({
          id: analysisId,
          status: "succeeded",
          source: "manual",
          result,
          evidenceSummary: summary,
          modelId: null,
          completedAt,
          cached: false,
          message: "Installation steps updated for the platform you chose.",
        }),
      };
    }

    const fetched = await fetchPageForAnalysis({
      startingUrl: review.startingUrl,
      allowedOrigins: review.allowedOrigins,
    });

    if (!fetched.ok) {
      const authenticated =
        fetched.reason === "http_error" &&
        (fetched.statusCode === 401 || fetched.statusCode === 403);
      const evidence = unreachableEvidence(
        (() => {
          try {
            return new URL(review.startingUrl).origin;
          } catch {
            return review.startingUrl;
          }
        })(),
      );
      evidence.appearsAuthenticated = Boolean(authenticated);
      if (authenticated) {
        evidence.analyzerWarnings.push("The page may require sign-in.");
      }

      const result = buildUnreachableAnalysisResult({
        message: fetched.message,
        appearsAuthenticated: authenticated,
      });
      const summary = toEvidenceSummary(evidence);
      const completedAt = new Date();
      await db
        .update(websiteAnalyses)
        .set({
          status: "unreachable",
          source: "deterministic",
          result,
          evidenceSummary: summary,
          evidenceFingerprint: `unreachable:${fetched.reason}`,
          errorCode: fetched.reason,
          modelId: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(websiteAnalyses.id, analysisId));

      return {
        ok: true,
        analysis: toPublic({
          id: analysisId,
          status: "unreachable",
          source: "deterministic",
          result,
          evidenceSummary: summary,
          modelId: null,
          completedAt,
          cached: false,
          message: fetched.message,
        }),
      };
    }

    const { evidence, fingerprint } = collectPageSignals({
      finalUrl: fetched.page.finalUrl,
      contentType: fetched.page.headers["content-type"] ?? null,
      headers: fetched.page.headers,
      body: fetched.page.body,
    });

    if (!input.force) {
      const cached = await findCachedAnalysis({
        workspaceId: context.workspaceId,
        reviewId: review.reviewId,
        fingerprint,
      });
      if (cached?.result) {
        const completedAt = new Date();
        await db
          .update(websiteAnalyses)
          .set({
            status: cached.status === "fallback" ? "fallback" : "succeeded",
            source: "cached",
            result: cached.result,
            evidenceSummary: cached.evidenceSummary,
            evidenceFingerprint: fingerprint,
            modelId: cached.modelId,
            completedAt,
            updatedAt: completedAt,
          })
          .where(eq(websiteAnalyses.id, analysisId));

        return {
          ok: true,
          analysis: toPublic({
            id: analysisId,
            status: cached.status === "fallback" ? "fallback" : "succeeded",
            source: "cached",
            result: cached.result,
            evidenceSummary: cached.evidenceSummary,
            modelId: cached.modelId,
            completedAt,
            cached: true,
            message: "Showing the latest analysis for this website.",
          }),
        };
      }
    }

    // At most one model call per analysis — no automatic retry loop.
    const openai = await analyzeEvidenceWithOpenAI(evidence);
    const completedAt = new Date();
    const summary = toEvidenceSummary(evidence);

    if (openai.ok) {
      await db
        .update(websiteAnalyses)
        .set({
          status: "succeeded",
          source: "openai",
          result: openai.result,
          evidenceSummary: summary,
          evidenceFingerprint: fingerprint,
          modelId: openai.modelId,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(websiteAnalyses.id, analysisId));

      return {
        ok: true,
        analysis: toPublic({
          id: analysisId,
          status: "succeeded",
          source: "openai",
          result: openai.result,
          evidenceSummary: summary,
          modelId: openai.modelId,
          completedAt,
          cached: false,
          message: null,
        }),
      };
    }

    const fallback = buildDeterministicAnalysisResult(evidence, {
      tailoredUnavailable: true,
    });
    await db
      .update(websiteAnalyses)
      .set({
        status: "fallback",
        source: "deterministic",
        result: fallback,
        evidenceSummary: summary,
        evidenceFingerprint: fingerprint,
        errorCode: openai.reason,
        modelId: null,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(websiteAnalyses.id, analysisId));

    return {
      ok: true,
      analysis: toPublic({
        id: analysisId,
        status: "fallback",
        source: "deterministic",
        result: fallback,
        evidenceSummary: summary,
        modelId: null,
        completedAt,
        cached: false,
        message: openai.message,
      }),
    };
  } catch {
    if (analysisId) {
      try {
        await db
          .update(websiteAnalyses)
          .set({
            status: "failed",
            errorCode: "unavailable",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(websiteAnalyses.id, analysisId));
      } catch {
        // ignore cleanup failures
      }
    }
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t analyze this website right now. Try again.",
    };
  } finally {
    await releaseWebsiteAnalysisLock({
      workspaceId: context.workspaceId,
      reviewId: input.reviewId,
    });
  }
}
