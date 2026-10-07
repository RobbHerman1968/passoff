import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  deployments,
  issueAnchors,
  issueEvidence,
  issues,
  projectEnvironments,
  reviews,
  verificationCheckResults,
  verificationRuns,
  verificationSessions,
} from "@/db/schema";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import type { IssueStatus } from "@/lib/issues/statuses";
import { canMutateProjects } from "@/lib/projects/permissions";
import {
  checksUsefulForStatus,
  parseHookAllowlist,
  selectedChecksFromInput,
} from "@/lib/verification/eligibility";
import { overallFromChecks } from "@/lib/verification/contract";
import { notifyVerificationRunFinished } from "@/lib/verification/notify";
import {
  parseIncomingCheck,
  sanitizeCheckedUrl,
  sanitizeLimitations,
} from "@/lib/verification/sanitize";
import {
  VERIFICATION_EXCHANGE_TTL_MS,
  buildVerificationLaunchUrl,
  createVerificationExchange,
  type VerificationSession,
} from "@/lib/verification/session";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type StartVerificationResult =
  | {
      ok: true;
      launchUrl: string;
      runId: string;
      expiresAt: string;
    }
  | {
      ok: false;
      error: "forbidden" | "not_found" | "validation" | "unavailable" | "rate_limited";
      title: string;
      next: string;
    };

function versionsMatch(expected: string, detected: string | null | undefined): boolean {
  if (!detected?.trim()) return false;
  return expected.trim().toLowerCase() === detected.trim().toLowerCase();
}

export async function startVerificationRun(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    checks?: string[];
    namedHook?: string | null;
    deploymentId?: string | null;
  },
): Promise<StartVerificationResult> {
  if (!canMutateProjects(context)) {
    return {
      ok: false,
      error: "forbidden",
      title: "You don’t have permission to run these checks.",
      next: "Ask a workspace member to run them, or record a manual check.",
    };
  }

  const rate = await enforceInstallationRateLimit({
    scope: "verification_exchange_create",
    subjects: [context.workspaceId, context.userId],
  });
  if (!rate.ok) {
    return {
      ok: false,
      error: "rate_limited",
      title: "Too many check sessions were started just now.",
      next: "Wait a few minutes, then try again.",
    };
  }

  const [row] = await db
    .select({
      issueId: issues.id,
      issueStatus: issues.status,
      issueBody: issues.body,
      issueEnvironmentId: issues.environmentId,
      reviewId: reviews.id,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      reviewDeploymentId: reviews.deploymentId,
      envName: projectEnvironments.name,
      envEnabled: projectEnvironments.isEnabled,
      envBaseUrl: projectEnvironments.baseUrl,
      envOrigins: projectEnvironments.allowedOrigins,
      envVerifiedAt: projectEnvironments.verifiedAt,
      envLastSeenAt: projectEnvironments.lastSeenAt,
      hookAllowlist: projectEnvironments.verificationHookAllowlist,
      pageUrl: issueAnchors.pageUrl,
      pageRoute: issueAnchors.route,
      matchConfidence: issueAnchors.matchConfidence,
    })
    .from(issues)
    .innerJoin(
      reviews,
      and(eq(reviews.id, issues.reviewId), eq(reviews.workspaceId, context.workspaceId)),
    )
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, reviews.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .where(
      and(
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, input.projectId),
        eq(issues.reviewId, input.reviewId),
        eq(issues.number, input.issueNumber),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      ok: false,
      error: "not_found",
      title: "This issue isn’t available.",
      next: "Go back to the review and choose another issue.",
    };
  }

  if (!checksUsefulForStatus(row.issueStatus as IssueStatus)) {
    return {
      ok: false,
      error: "validation",
      title: "This issue isn’t in a state where checks are useful.",
      next: "Reopen the issue, or record a manual verification instead.",
    };
  }

  if (!row.pageUrl && !row.pageRoute) {
    return {
      ok: false,
      error: "validation",
      title: "This issue isn’t linked to a place on the website.",
      next: "Relink the issue, then run the checks.",
    };
  }

  if (!row.envEnabled) {
    return {
      ok: false,
      error: "validation",
      title: "Passoff is turned off for this website.",
      next: "Turn it on in website setup, then try again.",
    };
  }

  if (!row.envVerifiedAt && !row.envLastSeenAt) {
    return {
      ok: false,
      error: "validation",
      title: "Passoff isn’t installed on this website yet.",
      next: "Open website setup and add the install code, then try again.",
    };
  }

  const deploymentId = input.deploymentId || row.reviewDeploymentId;
  const [deployment] = await db
    .select({
      id: deployments.id,
      identifier: deployments.identifier,
      url: deployments.url,
      environmentId: deployments.environmentId,
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.projectId, row.projectId),
        eq(deployments.environmentId, row.environmentId),
      ),
    )
    .limit(1);

  if (!deployment) {
    return {
      ok: false,
      error: "validation",
      title: "A recorded deployment is needed before checks can run.",
      next: "Record a deployment, then try again.",
    };
  }

  const selected = selectedChecksFromInput({
    checks: input.checks,
    namedHook: input.namedHook,
    allowlist: row.hookAllowlist ?? [],
  });
  if (selected.error && selected.checks.length === 0) {
    return {
      ok: false,
      error: "validation",
      title: selected.error.title,
      next: selected.error.next,
    };
  }

  const origin = normalizeOrigin(row.envOrigins[0] ?? row.envBaseUrl);
  if (!origin.ok || !isOriginAllowed(origin.origin, row.envOrigins)) {
    return {
      ok: false,
      error: "validation",
      title: "Passoff doesn’t have an allowed website address for this environment.",
      next: "Open the correct environment, then try again.",
    };
  }

  let targetUrl: string;
  try {
    if (row.pageUrl) {
      targetUrl = new URL(row.pageUrl).toString();
    } else {
      targetUrl = new URL(row.pageRoute || "/", row.envBaseUrl).toString();
    }
  } catch {
    return {
      ok: false,
      error: "validation",
      title: "Passoff couldn’t build a website address for this issue.",
      next: "Relink the issue, then try again.",
    };
  }

  const targetOrigin = normalizeOrigin(targetUrl);
  if (!targetOrigin.ok || !isOriginAllowed(targetOrigin.origin, row.envOrigins)) {
    return {
      ok: false,
      error: "validation",
      title: "The issue page isn’t on the allowed website address.",
      next: "Open the correct environment, then try again.",
    };
  }

  try {
    const [run] = await db
      .insert(verificationRuns)
      .values({
        workspaceId: context.workspaceId,
        projectId: row.projectId,
        reviewId: row.reviewId,
        issueId: row.issueId,
        environmentId: row.environmentId,
        deploymentId: deployment.id,
        initiatingUserId: context.userId,
        state: "preparing",
        selectedChecks: selected.checks,
        namedHook: selected.namedHook,
        expectedVersion: deployment.identifier,
        actualRoute: row.pageRoute,
        actualUrl: sanitizeCheckedUrl(targetUrl),
        anchorMatchConfidence: row.matchConfidence ?? "unchecked",
        contractVersion: 1,
      })
      .returning({ id: verificationRuns.id });

    const exchange = await createVerificationExchange({
      workspaceId: context.workspaceId,
      projectId: row.projectId,
      reviewId: row.reviewId,
      issueId: row.issueId,
      environmentId: row.environmentId,
      deploymentId: deployment.id,
      actorUserId: context.userId,
      runId: run.id,
      allowedOrigin: targetOrigin.origin,
      pageRoute: row.pageRoute,
      targetUrl,
      selectedChecks: selected.checks,
      namedHook: selected.namedHook,
    });

    return {
      ok: true,
      launchUrl: buildVerificationLaunchUrl(targetUrl, exchange.rawCode),
      runId: run.id,
      expiresAt: new Date(Date.now() + VERIFICATION_EXCHANGE_TTL_MS).toISOString(),
    };
  } catch {
    return {
      ok: false,
      error: "unavailable",
      title: "Passoff couldn’t start these checks.",
      next: "Try again in a moment.",
    };
  }
}

export async function submitVerificationResults(options: {
  session: VerificationSession;
  corsOrigin: string;
  idempotencyKey: string | null;
  payload: {
    actualUrl?: unknown;
    actualRoute?: unknown;
    viewport?: unknown;
    version?: unknown;
    anchorConfidence?: unknown;
    checks?: unknown;
    cancelled?: unknown;
    evidenceFailed?: unknown;
    failureCode?: unknown;
    limitations?: unknown;
    runnerVersion?: unknown;
    documentReady?: unknown;
    layoutStable?: unknown;
  };
}): Promise<{ ok: true; overall: string; duplicate?: boolean } | { ok: false; code: string; status: number }> {
  const rate = await enforceInstallationRateLimit({
    scope: "verification_result_submit",
    subjects: [options.session.workspaceId, options.session.sessionId],
  });
  if (!rate.ok) {
    return { ok: false, code: "rate_limited", status: 429 };
  }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(verificationRuns)
    .where(
      and(
        eq(verificationRuns.id, options.session.runId),
        eq(verificationRuns.workspaceId, options.session.workspaceId),
        eq(verificationRuns.issueId, options.session.issueId),
        eq(verificationRuns.deploymentId, options.session.deploymentId),
      ),
    )
    .limit(1);

  if (!existing) {
    return { ok: false, code: "invalid", status: 404 };
  }

  if (
    options.idempotencyKey &&
    existing.resultIdempotencyKey &&
    existing.resultIdempotencyKey === options.idempotencyKey &&
    existing.completedAt
  ) {
    return { ok: true, overall: existing.overallResult ?? "uncertain", duplicate: true };
  }

  if (existing.completedAt) {
    return { ok: true, overall: existing.overallResult ?? "uncertain", duplicate: true };
  }

  const cancelled = options.payload.cancelled === true;
  const detected =
    options.payload.version && typeof options.payload.version === "object"
      ? (options.payload.version as Record<string, unknown>)
      : {};
  const detectedVersion =
    typeof detected.value === "string" ? detected.value.slice(0, 120) : null;
  const versionMethod =
    detected.method === "installation_deployment" ||
    detected.method === "application_release" ||
    detected.method === "environment_metadata" ||
    detected.method === "manual_confirmation"
      ? detected.method
      : "missing";

  const viewport =
    options.payload.viewport && typeof options.payload.viewport === "object"
      ? (options.payload.viewport as Record<string, unknown>)
      : {};

  const limitations = sanitizeLimitations(options.payload.limitations);
  let failureCode =
    typeof options.payload.failureCode === "string"
      ? options.payload.failureCode.slice(0, 64)
      : null;

  if (cancelled) {
    failureCode = "cancelled";
  } else if (options.payload.documentReady === false) {
    failureCode = "page_loading";
  } else if (options.payload.layoutStable === false) {
    failureCode = "layout_changing";
  } else if (!detectedVersion) {
    failureCode = failureCode ?? "version_mismatch";
  } else if (!versionsMatch(options.session.expectedVersion, detectedVersion)) {
    failureCode = "version_mismatch";
  }

  const incoming = Array.isArray(options.payload.checks)
    ? options.payload.checks.map(parseIncomingCheck).filter(Boolean)
    : [];

  const allowedKinds = new Set(options.session.selectedChecks);
  const checks = incoming.filter((item) => {
    if (!item) return false;
    if (!allowedKinds.has(item.kind)) return false;
    if (item.kind === "named_test_hook") {
      const name = item.hookName;
      return (
        Boolean(name) &&
        options.session.hookAllowlist.includes(name) &&
        name === (options.session.namedHook ?? name)
      );
    }
    return true;
  });

  const outcomes = checks.map((item) => item!.outcome);
  let overall: "passed" | "failed" | "uncertain" | "cancelled" = cancelled
    ? "cancelled"
    : failureCode === "version_mismatch" ||
        failureCode === "page_loading" ||
        failureCode === "layout_changing"
      ? "uncertain"
      : overallFromChecks(outcomes);

  if (overall === "passed" && checks.length === 0) {
    overall = "uncertain";
  }

  const evidenceFailed = options.payload.evidenceFailed === true;
  const evidenceState = evidenceFailed
    ? "failed"
    : options.payload.evidenceFailed === false
      ? "skipped"
      : existing.evidenceCaptureState;

  const state =
    cancelled
      ? "cancelled"
      : failureCode && failureCode !== "screenshot_failed"
        ? "needs_attention"
        : "complete";

  const completedByThisRequest = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(verificationRuns)
      .set({
        state,
        overallResult: overall,
        completedAt: now,
        actualUrl: sanitizeCheckedUrl(
          typeof options.payload.actualUrl === "string" ? options.payload.actualUrl : null,
        ),
        actualRoute:
          typeof options.payload.actualRoute === "string"
            ? options.payload.actualRoute.slice(0, 512)
            : existing.actualRoute,
        viewportWidth:
          typeof viewport.width === "number" ? Math.round(viewport.width) : existing.viewportWidth,
        viewportHeight:
          typeof viewport.height === "number"
            ? Math.round(viewport.height)
            : existing.viewportHeight,
        devicePixelRatio:
          typeof viewport.devicePixelRatio === "number"
            ? String(viewport.devicePixelRatio)
            : existing.devicePixelRatio,
        orientation:
          typeof viewport.orientation === "string"
            ? viewport.orientation.slice(0, 24)
            : existing.orientation,
        viewportGroup:
          typeof viewport.group === "string" ? viewport.group.slice(0, 24) : existing.viewportGroup,
        versionDetectionMethod: versionMethod,
        detectedVersion,
        limitations,
        failureCode,
        evidenceCaptureState: evidenceState,
        runnerVersion:
          typeof options.payload.runnerVersion === "string"
            ? options.payload.runnerVersion.slice(0, 40)
            : existing.runnerVersion,
        resultIdempotencyKey: options.idempotencyKey,
        updatedAt: now,
      })
      .where(
        and(
          eq(verificationRuns.id, existing.id),
          eq(verificationRuns.workspaceId, options.session.workspaceId),
          isNull(verificationRuns.completedAt),
        ),
      )
      .returning({ id: verificationRuns.id });

    if (!claimed) return false;

    for (const check of checks) {
      if (!check) continue;
      await tx
        .insert(verificationCheckResults)
        .values({
          workspaceId: options.session.workspaceId,
          runId: existing.id,
          kind: check.kind,
          outcome: check.outcome,
          summary: check.summary,
          measurements: check.measurements,
          limitations: check.limitations,
          hookName: check.hookName,
        })
        .onConflictDoNothing({
          target: [
            verificationCheckResults.runId,
            verificationCheckResults.kind,
            verificationCheckResults.hookName,
          ],
        });
    }

    await tx
      .update(verificationSessions)
      .set({ completedAt: now })
      .where(
        and(
          eq(verificationSessions.id, options.session.sessionId),
          eq(verificationSessions.workspaceId, options.session.workspaceId),
        ),
      );
    return true;
  });

  if (!completedByThisRequest) {
    const [completed] = await db
      .select({ overall: verificationRuns.overallResult })
      .from(verificationRuns)
      .where(
        and(
          eq(verificationRuns.id, existing.id),
          eq(verificationRuns.workspaceId, options.session.workspaceId),
        ),
      )
      .limit(1);
    return { ok: true, overall: completed?.overall ?? "uncertain", duplicate: true };
  }

  const webhookType =
    overall === "failed"
      ? "verification_run.failed"
      : overall === "uncertain"
        ? "verification_run.uncertain"
        : "verification_run.completed";

  await enqueueWebhookEventSafely({
    eventId: existing.id,
    subscribedType: webhookType,
    eventType: webhookType,
    occurredAt: now.toISOString(),
    workspaceId: options.session.workspaceId,
    projectId: options.session.projectId,
    reviewId: options.session.reviewId,
    issueId: options.session.issueId,
    issueNumber: options.session.issueNumber,
    actor: { type: "user", name: "Workspace member" },
    data: {
      overall,
      environmentName: options.session.environmentName,
      versionLabel: options.session.expectedVersion,
      viewport:
        typeof viewport.width === "number" && typeof viewport.height === "number"
          ? { width: viewport.width, height: viewport.height }
          : null,
      checks: checks.map((item) => ({
        kind: item!.kind,
        outcome: item!.outcome,
        summary: item!.summary,
      })),
      failureCode,
    },
  });

  try {
    await notifyVerificationRunFinished({
      workspaceId: options.session.workspaceId,
      projectId: options.session.projectId,
      reviewId: options.session.reviewId,
      issueId: options.session.issueId,
      issueNumber: options.session.issueNumber,
      runId: existing.id,
      initiatingUserId: options.session.actorUserId,
      overall,
      versionLabel: options.session.expectedVersion,
    });
  } catch {
    // Keep the run even if notifying fails.
  }

  return { ok: true, overall };
}

export async function attachVerificationEvidence(options: {
  session: VerificationSession;
  captureStatus: "ready" | "failed" | "unavailable";
  mimeType?: string | null;
  base64?: string | null;
  byteLength?: number | null;
  annotation?: unknown;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const [run] = await db
    .select()
    .from(verificationRuns)
    .where(
      and(
        eq(verificationRuns.id, options.session.runId),
        eq(verificationRuns.workspaceId, options.session.workspaceId),
      ),
    )
    .limit(1);
  if (!run) return { ok: false, code: "invalid" };

  const [evidence] = await db
    .insert(issueEvidence)
    .values({
      workspaceId: options.session.workspaceId,
      issueId: options.session.issueId,
      kind: "verification_capture",
      captureMethod: "browser_reconstruction",
      captureStatus: options.captureStatus,
      sanitizedContext: {
        purpose: "verification_capture",
        afterOriginal: true,
        mimeType: options.mimeType,
        byteLength: options.byteLength,
        ...(options.base64 ? { pngBase64: options.base64 } : {}),
        ...(options.annotation ? { annotation: options.annotation } : {}),
        ...(options.reason ? { reason: options.reason.slice(0, 400) } : {}),
        environmentName: options.session.environmentName,
        versionLabel: options.session.expectedVersion,
        route: options.session.pageRoute,
      },
      capturedAt: new Date(),
      createdByUserId: options.session.actorUserId,
    })
    .returning({ id: issueEvidence.id });

  await db
    .update(verificationRuns)
    .set({
      evidenceId: evidence.id,
      evidenceCaptureState: options.captureStatus === "ready" ? "ready" : "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verificationRuns.id, run.id),
        eq(verificationRuns.workspaceId, options.session.workspaceId),
      ),
    );

  return { ok: true };
}

export async function cancelVerificationSession(session: VerificationSession) {
  const now = new Date();
  await db
    .update(verificationSessions)
    .set({ completedAt: now, revokedAt: now })
    .where(
      and(
        eq(verificationSessions.id, session.sessionId),
        eq(verificationSessions.workspaceId, session.workspaceId),
      ),
    );
  await db
    .update(verificationRuns)
    .set({
      state: "cancelled",
      overallResult: "cancelled",
      completedAt: now,
      failureCode: "cancelled",
      updatedAt: now,
    })
    .where(
      and(
        eq(verificationRuns.id, session.runId),
        eq(verificationRuns.workspaceId, session.workspaceId),
      ),
    );
}

export async function updateVerificationHookAllowlist(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; namesText: string },
): Promise<{ ok: true; names: string[] } | { ok: false; error: "forbidden" | "not_found" }> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const parsed = parseHookAllowlist(input.namesText);
  const [review] = await db
    .select({ environmentId: reviews.environmentId })
    .from(reviews)
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.projectId, input.projectId),
        eq(reviews.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!review) return { ok: false, error: "not_found" };

  await db
    .update(projectEnvironments)
    .set({ verificationHookAllowlist: parsed, updatedAt: new Date() })
    .where(
      and(
        eq(projectEnvironments.id, review.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    );
  return { ok: true, names: parsed };
}
