import "server-only";

import {
  clearInstallationRateLimit,
  enforceInstallationRateLimit,
  seedInstallationRateLimit,
  type RateLimitResult,
} from "@/lib/installations/rate-limit";

export async function enforceWebsiteAnalysisRateLimits(input: {
  workspaceId: string;
  reviewId: string;
}): Promise<RateLimitResult> {
  const workspace = await enforceInstallationRateLimit({
    scope: "website_analysis_workspace",
    subjects: [input.workspaceId],
  });
  if (!workspace.ok) return workspace;
  return enforceInstallationRateLimit({
    scope: "website_analysis_review",
    subjects: [input.workspaceId, input.reviewId],
  });
}

/**
 * Single-flight lock for a review analysis.
 * maxAttempts=1 means a second concurrent claim is blocked for the lock window.
 */
export async function acquireWebsiteAnalysisLock(input: {
  workspaceId: string;
  reviewId: string;
}): Promise<RateLimitResult> {
  return enforceInstallationRateLimit({
    scope: "website_analysis_lock",
    subjects: [input.workspaceId, input.reviewId, "lock"],
  });
}

export async function releaseWebsiteAnalysisLock(input: {
  workspaceId: string;
  reviewId: string;
}) {
  await clearInstallationRateLimit("website_analysis_lock", [
    input.workspaceId,
    input.reviewId,
    "lock",
  ]);
}

export async function seedWebsiteAnalysisRateLimitForTests(input: {
  kind: "workspace" | "review" | "lock";
  workspaceId: string;
  reviewId?: string;
  attemptCount: number;
  blockedUntil?: Date | null;
}) {
  if (input.kind === "workspace") {
    await seedInstallationRateLimit({
      scope: "website_analysis_workspace",
      subjects: [input.workspaceId],
      attemptCount: input.attemptCount,
      blockedUntil: input.blockedUntil,
    });
    return;
  }
  if (input.kind === "lock") {
    await seedInstallationRateLimit({
      scope: "website_analysis_lock",
      subjects: [input.workspaceId, input.reviewId ?? "", "lock"],
      attemptCount: input.attemptCount,
      blockedUntil: input.blockedUntil,
    });
    return;
  }
  await seedInstallationRateLimit({
    scope: "website_analysis_review",
    subjects: [input.workspaceId, input.reviewId ?? ""],
    attemptCount: input.attemptCount,
    blockedUntil: input.blockedUntil,
  });
}

export async function clearWebsiteAnalysisRateLimitsForTests(input: {
  workspaceId: string;
  reviewId: string;
}) {
  await clearInstallationRateLimit("website_analysis_workspace", [
    input.workspaceId,
  ]);
  await clearInstallationRateLimit("website_analysis_review", [
    input.workspaceId,
    input.reviewId,
  ]);
  await clearInstallationRateLimit("website_analysis_lock", [
    input.workspaceId,
    input.reviewId,
    "lock",
  ]);
}
