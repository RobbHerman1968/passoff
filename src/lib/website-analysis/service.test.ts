import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { workspaceMemberships, workspaces } from "@/db/schema";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createCredentialsUser } from "@/lib/auth/users";
import { FIXTURE_HTML } from "@/lib/website-analysis/fixtures";
import type { WorkspaceContext } from "@/lib/projects/context";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import {
  clearWebsiteAnalysisRateLimitsForTests,
  seedWebsiteAnalysisRateLimitForTests,
} from "@/lib/website-analysis/rate-limit";

const fetchMock = vi.fn();
const openaiMock = vi.fn();

vi.mock("@/lib/website-analysis/fetch-page", () => ({
  fetchPageForAnalysis: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("@/lib/website-analysis/openai-analyze", () => ({
  analyzeEvidenceWithOpenAI: (...args: unknown[]) => openaiMock(...args),
}));

import {
  analyzeWebsiteForReview,
} from "@/lib/website-analysis/service";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Analyze",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");

  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("team create failed");

  const [membership] = await db
    .select({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      workspaceSlug: workspaces.slug,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, created.user.id),
        eq(workspaceMemberships.workspaceId, workspace.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);

  return {
    membershipId: membership.membershipId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

async function seedReview() {
  const context = await createWorkspaceContext("analysis");
  const project = await createProject(context, "Analysis Project");
  if (!project.ok) throw new Error("project create failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: "Homepage",
    websiteUrl: "https://example.com/start",
  });
  if (!review.ok) throw new Error("review create failed");
  return {
    context,
    projectId: project.project.id,
    reviewId: review.review.id,
  };
}

describe("analyzeWebsiteForReview", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    openaiMock.mockReset();
  });

  afterEach(async () => {
    // no-op cleanup; rate limits are unique per review/workspace
  });

  it("returns OpenAI-backed analysis for Next.js fixtures", async () => {
    const seeded = await seedReview();
    fetchMock.mockResolvedValue({
      ok: true,
      page: {
        finalUrl: "https://example.com/start",
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: FIXTURE_HTML.nextjs,
        redirected: false,
        redirectCount: 0,
      },
    });
    openaiMock.mockResolvedValue({
      ok: true,
      modelId: "test-model",
      result: {
        detectedPlatform: "nextjs",
        confidence: "high",
        evidence: ["Next.js markers were present."],
        recommendedMethod: "nextjs_script",
        steps: ["Open the root layout file for the Next.js app."],
        placement: "Add Passoff in the root layout with next/script.",
        verificationSteps: ["Open the website and check installation."],
        cautions: [],
        requiresDeveloper: true,
        alternateMethods: ["generic_html_body"],
        existingInstallationDetected: false,
        needsClarification: false,
        clarificationQuestion: null,
      },
    });

    const result = await analyzeWebsiteForReview(seeded.context, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
      force: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.result?.detectedPlatform).toBe("nextjs");
    expect(result.analysis.source).toBe("openai");
    expect(openaiMock).toHaveBeenCalledTimes(1);
    await clearWebsiteAnalysisRateLimitsForTests({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
    });
  });

  it("falls back when OpenAI is unavailable", async () => {
    const seeded = await seedReview();
    fetchMock.mockResolvedValue({
      ok: true,
      page: {
        finalUrl: "https://example.com/start",
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: FIXTURE_HTML.wordpress,
        redirected: false,
        redirectCount: 0,
      },
    });
    openaiMock.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      message:
        "Tailored guidance is temporarily unavailable because the assistant is busy. Showing the closest reviewed installation steps instead.",
    });

    const result = await analyzeWebsiteForReview(seeded.context, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
      force: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.status).toBe("fallback");
    expect(result.analysis.result?.detectedPlatform).toBe("wordpress");
    expect(result.analysis.message).toMatch(/temporarily unavailable/i);
    await clearWebsiteAnalysisRateLimitsForTests({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
    });
  });

  it("reuses a cached analysis when evidence is unchanged", async () => {
    const seeded = await seedReview();
    fetchMock.mockResolvedValue({
      ok: true,
      page: {
        finalUrl: "https://example.com/start",
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: FIXTURE_HTML.genericHtml,
        redirected: false,
        redirectCount: 0,
      },
    });
    openaiMock.mockResolvedValue({
      ok: true,
      modelId: "test-model",
      result: {
        detectedPlatform: "generic_html",
        confidence: "low",
        evidence: ["No strong platform markers were found."],
        recommendedMethod: "generic_html_body",
        steps: ["Paste before </body>."],
        placement: "Before closing body tag",
        verificationSteps: ["Check installation."],
        cautions: [],
        requiresDeveloper: false,
        alternateMethods: ["gtm_custom_html"],
        existingInstallationDetected: false,
        needsClarification: true,
        clarificationQuestion: "Which platform do you use?",
      },
    });

    const first = await analyzeWebsiteForReview(seeded.context, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
      force: true,
    });
    expect(first.ok).toBe(true);

    const second = await analyzeWebsiteForReview(seeded.context, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
      force: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.analysis.cached).toBe(true);
    expect(openaiMock).toHaveBeenCalledTimes(1);
    await clearWebsiteAnalysisRateLimitsForTests({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
    });
  });

  it("denies cross-workspace access", async () => {
    const owner = await seedReview();
    const stranger = await createWorkspaceContext("stranger");

    const result = await analyzeWebsiteForReview(stranger, {
      projectId: owner.projectId,
      reviewId: owner.reviewId,
      force: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unreachable guidance for authenticated websites", async () => {
    const seeded = await seedReview();
    fetchMock.mockResolvedValue({
      ok: false,
      reason: "http_error",
      statusCode: 401,
      message:
        "We couldn’t inspect this site because it requires sign-in or blocked our request.",
    });

    const result = await analyzeWebsiteForReview(seeded.context, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
      force: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.status).toBe("unreachable");
    expect(result.analysis.result?.needsClarification).toBe(true);
    expect(openaiMock).not.toHaveBeenCalled();
    await clearWebsiteAnalysisRateLimitsForTests({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
    });
  });

  it("rate limits repeated workspace analysis", async () => {
    const seeded = await seedReview();
    await seedWebsiteAnalysisRateLimitForTests({
      kind: "workspace",
      workspaceId: seeded.context.workspaceId,
      attemptCount: 40,
      blockedUntil: new Date(Date.now() + 60_000),
    });

    const result = await analyzeWebsiteForReview(seeded.context, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
      force: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("rate_limited");
    await clearWebsiteAnalysisRateLimitsForTests({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
    });
  });
});
