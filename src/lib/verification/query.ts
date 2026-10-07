import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  deployments,
  issueAnchors,
  issueEvidence,
  issues,
  projectEnvironments,
  users,
  verificationCheckResults,
  verificationRuns,
} from "@/db/schema";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { runSummary } from "@/lib/verification/copy";
import type { VerificationCheckKind, VerificationOutcome } from "@/lib/verification/contract";

export type VerificationRunView = {
  id: string;
  state: string;
  overall: "passed" | "failed" | "uncertain" | "cancelled" | null;
  environmentName: string;
  versionLabel: string;
  route: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  viewportGroup: string | null;
  initiatorName: string;
  startedAt: Date;
  completedAt: Date | null;
  checks: Array<{
    kind: VerificationCheckKind;
    outcome: VerificationOutcome;
    summary: string;
    measurements: Record<string, unknown>;
    limitations: string[];
  }>;
  limitations: string[];
  failureCode: string | null;
  evidenceStatus: string;
  hasEvidence: boolean;
  summary: string;
  selectedChecks: string[];
  actualUrl: string | null;
};

export async function listVerificationRunsForIssue(
  context: WorkspaceContext,
  issueId: string,
): Promise<VerificationRunView[]> {
  const runs = await db
    .select({
      id: verificationRuns.id,
      state: verificationRuns.state,
      overall: verificationRuns.overallResult,
      route: verificationRuns.actualRoute,
      viewportWidth: verificationRuns.viewportWidth,
      viewportHeight: verificationRuns.viewportHeight,
      viewportGroup: verificationRuns.viewportGroup,
      startedAt: verificationRuns.startedAt,
      completedAt: verificationRuns.completedAt,
      limitations: verificationRuns.limitations,
      failureCode: verificationRuns.failureCode,
      evidenceState: verificationRuns.evidenceCaptureState,
      evidenceId: verificationRuns.evidenceId,
      selectedChecks: verificationRuns.selectedChecks,
      actualUrl: verificationRuns.actualUrl,
      environmentName: projectEnvironments.name,
      versionLabel: deployments.identifier,
      initiatorName: users.name,
      initiatorEmail: users.email,
    })
    .from(verificationRuns)
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, verificationRuns.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .innerJoin(
      deployments,
      and(
        eq(deployments.id, verificationRuns.deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
      ),
    )
    .leftJoin(users, eq(users.id, verificationRuns.initiatingUserId))
    .where(
      and(
        eq(verificationRuns.issueId, issueId),
        eq(verificationRuns.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(desc(verificationRuns.createdAt));

  if (runs.length === 0) return [];

  const results = await db
    .select()
    .from(verificationCheckResults)
    .where(eq(verificationCheckResults.workspaceId, context.workspaceId));

  const byRun = new Map<string, typeof results>();
  for (const row of results) {
    const list = byRun.get(row.runId) ?? [];
    list.push(row);
    byRun.set(row.runId, list);
  }

  return runs.map((run) => {
    const checks = (byRun.get(run.id) ?? []).map((item) => ({
      kind: item.kind as VerificationCheckKind,
      outcome: item.outcome as VerificationOutcome,
      summary: item.summary,
      measurements: item.measurements ?? {},
      limitations: item.limitations ?? [],
    }));
    const occlusion = checks.find((item) => item.kind === "bounding_box_overlap")
      ?.measurements.occlusionPercent;
    return {
      id: run.id,
      state: run.state,
      overall: run.overall,
      environmentName: run.environmentName,
      versionLabel: run.versionLabel,
      route: run.route,
      viewportWidth: run.viewportWidth,
      viewportHeight: run.viewportHeight,
      viewportGroup: run.viewportGroup,
      initiatorName: personDisplayName(run.initiatorName, run.initiatorEmail),
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      checks,
      limitations: run.limitations ?? [],
      failureCode: run.failureCode,
      evidenceStatus: run.evidenceState,
      hasEvidence: Boolean(run.evidenceId),
      selectedChecks: run.selectedChecks,
      actualUrl: run.actualUrl,
      summary: runSummary({
        overall: run.overall,
        kind: checks[0]?.kind,
        environmentName: run.environmentName,
        versionLabel: run.versionLabel,
        viewportWidth: run.viewportWidth,
        viewportHeight: run.viewportHeight,
        occlusionPercent: typeof occlusion === "number" ? occlusion : null,
        failureCode: run.failureCode,
      }),
    };
  });
}

export async function getVerificationCaptureForReview(
  context: WorkspaceContext,
  evidenceId: string,
) {
  const [row] = await db
    .select({
      id: issueEvidence.id,
      captureStatus: issueEvidence.captureStatus,
      sanitizedContext: issueEvidence.sanitizedContext,
    })
    .from(issueEvidence)
    .where(
      and(
        eq(issueEvidence.id, evidenceId),
        eq(issueEvidence.workspaceId, context.workspaceId),
        eq(issueEvidence.kind, "verification_capture"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getIssueAnchorForVerification(
  workspaceId: string,
  issueId: string,
) {
  const [row] = await db
    .select({
      stableElementId: issueAnchors.stableElementId,
      approvedDataAttributes: issueAnchors.approvedDataAttributes,
      cssSelector: issueAnchors.cssSelector,
      ancestryFingerprint: issueAnchors.domFingerprint,
      matchConfidence: issueAnchors.matchConfidence,
      viewportWidth: issueAnchors.viewportWidth,
      viewportHeight: issueAnchors.viewportHeight,
    })
    .from(issueAnchors)
    .innerJoin(
      issues,
      and(eq(issues.id, issueAnchors.issueId), eq(issues.workspaceId, workspaceId)),
    )
    .where(and(eq(issueAnchors.issueId, issueId), eq(issueAnchors.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}
