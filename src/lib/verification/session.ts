import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  deployments,
  issues,
  projectEnvironments,
  reviews,
  verificationExchanges,
  verificationRuns,
  verificationSessions,
} from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import { isPublicInstallationKey } from "@/lib/installations/snippet";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import { VERIFICATION_HASH_PARAM } from "@/lib/verification/contract";

export const VERIFICATION_EXCHANGE_TTL_MS = 2 * 60 * 1000;
export const VERIFICATION_SESSION_TTL_MS = 15 * 60 * 1000;
export const VERIFICATION_EXCHANGE_BYTES = 24;
export const VERIFICATION_SESSION_TOKEN_BYTES = 32;

export type VerificationSession = {
  sessionId: string;
  runId: string;
  workspaceId: string;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  environmentId: string;
  environmentName: string;
  deploymentId: string;
  expectedVersion: string;
  allowedOrigin: string;
  pageRoute: string | null;
  selectedChecks: string[];
  namedHook: string | null;
  hookAllowlist: string[];
  returnPath: string;
  actorUserId: string;
};

function rawToken(bytes: number): { raw: string; hash: string } {
  const raw = randomBytes(bytes).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function buildVerificationLaunchUrl(
  startingUrl: string,
  exchangeCode: string,
): string {
  const url = new URL(startingUrl);
  const existing = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(existing);
  params.set(VERIFICATION_HASH_PARAM, exchangeCode);
  url.hash = params.toString();
  return url.toString();
}

export async function createVerificationExchange(input: {
  workspaceId: string;
  projectId: string;
  reviewId: string;
  issueId: string;
  environmentId: string;
  deploymentId: string;
  actorUserId: string;
  runId: string;
  allowedOrigin: string;
  pageRoute: string | null;
  targetUrl: string;
  selectedChecks: string[];
  namedHook: string | null;
}): Promise<{ rawCode: string; expiresAt: Date }> {
  const origin = normalizeOrigin(input.allowedOrigin);
  if (!origin.ok) {
    throw new Error("invalid_origin");
  }
  const { raw, hash } = rawToken(VERIFICATION_EXCHANGE_BYTES);
  const expiresAt = new Date(Date.now() + VERIFICATION_EXCHANGE_TTL_MS);
  await db.insert(verificationExchanges).values({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    issueId: input.issueId,
    environmentId: input.environmentId,
    deploymentId: input.deploymentId,
    actorUserId: input.actorUserId,
    runId: input.runId,
    codeHash: hash,
    allowedOrigin: origin.origin,
    pageRoute: input.pageRoute,
    targetUrl: input.targetUrl,
    selectedChecks: input.selectedChecks,
    namedHook: input.namedHook,
    expiresAt,
  });
  return { rawCode: raw, expiresAt };
}

export type VerificationExchangeResult =
  | {
      ok: true;
      sessionToken: string;
      expiresAt: string;
      corsOrigin: string;
      session: VerificationSession;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 429;
      code?: string;
      corsOrigin?: string;
      retryAfterSeconds?: number;
    };

export async function exchangeVerificationSession(options: {
  installationKey: string;
  exchangeCode: string;
  headerOrigin: string | null;
  rateLimitSubjects: string[];
}): Promise<VerificationExchangeResult> {
  if (!isPublicInstallationKey(options.installationKey)) {
    return { ok: false, status: 404, code: "invalid" };
  }
  const header = normalizeOrigin(options.headerOrigin);
  if (!header.ok) {
    return { ok: false, status: 403, code: "origin" };
  }
  const rate = await enforceInstallationRateLimit({
    scope: "verification_session_exchange",
    subjects: [options.installationKey, header.origin, ...options.rateLimitSubjects],
  });
  if (!rate.ok) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: rate.retryAfterSeconds,
      corsOrigin: header.origin,
    };
  }

  const codeHash = hashToken(options.exchangeCode);
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(verificationExchanges)
        .where(eq(verificationExchanges.codeHash, codeHash))
        .limit(1)
        .for("update");

      if (!locked) {
        return { ok: false as const, status: 404 as const, code: "invalid" as const };
      }
      if (locked.consumedAt) {
        return { ok: false as const, status: 403 as const, code: "expired" as const };
      }
      if (locked.expiresAt <= now) {
        return { ok: false as const, status: 403 as const, code: "expired" as const };
      }
      if (locked.allowedOrigin !== header.origin) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "origin" as const,
          corsOrigin: header.origin,
        };
      }

      const [env] = await tx
        .select({
          id: projectEnvironments.id,
          name: projectEnvironments.name,
          publicKey: projectEnvironments.publicKey,
          isEnabled: projectEnvironments.isEnabled,
          allowedOrigins: projectEnvironments.allowedOrigins,
          hookAllowlist: projectEnvironments.verificationHookAllowlist,
          workspaceId: projectEnvironments.workspaceId,
        })
        .from(projectEnvironments)
        .where(
          and(
            eq(projectEnvironments.id, locked.environmentId),
            eq(projectEnvironments.workspaceId, locked.workspaceId),
          ),
        )
        .limit(1);

      if (!env || env.publicKey !== options.installationKey) {
        return { ok: false as const, status: 403 as const, code: "wrong_environment" as const };
      }
      if (!env.isEnabled) {
        return { ok: false as const, status: 403 as const, code: "disabled" as const };
      }
      if (!isOriginAllowed(header.origin, env.allowedOrigins)) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "origin" as const,
          corsOrigin: header.origin,
        };
      }

      const [issue] = await tx
        .select({
          id: issues.id,
          number: issues.number,
          body: issues.body,
        })
        .from(issues)
        .where(
          and(
            eq(issues.id, locked.issueId),
            eq(issues.workspaceId, locked.workspaceId),
            eq(issues.projectId, locked.projectId),
            eq(issues.reviewId, locked.reviewId),
          ),
        )
        .limit(1);
      if (!issue) {
        return { ok: false as const, status: 404 as const, code: "invalid" as const };
      }

      const [deployment] = await tx
        .select({ identifier: deployments.identifier })
        .from(deployments)
        .where(
          and(
            eq(deployments.id, locked.deploymentId),
            eq(deployments.workspaceId, locked.workspaceId),
          ),
        )
        .limit(1);
      if (!deployment) {
        return { ok: false as const, status: 404 as const, code: "invalid" as const };
      }

      const [review] = await tx
        .select({ archivedAt: reviews.archivedAt, status: reviews.status })
        .from(reviews)
        .where(
          and(eq(reviews.id, locked.reviewId), eq(reviews.workspaceId, locked.workspaceId)),
        )
        .limit(1);
      if (!review || review.archivedAt) {
        return { ok: false as const, status: 403 as const, code: "archived" as const };
      }

      await tx
        .update(verificationExchanges)
        .set({ consumedAt: now })
        .where(eq(verificationExchanges.id, locked.id));

      const token = rawToken(VERIFICATION_SESSION_TOKEN_BYTES);
      const sessionExpires = new Date(Date.now() + VERIFICATION_SESSION_TTL_MS);
      const [sessionRow] = await tx
        .insert(verificationSessions)
        .values({
          workspaceId: locked.workspaceId,
          projectId: locked.projectId,
          reviewId: locked.reviewId,
          issueId: locked.issueId,
          environmentId: locked.environmentId,
          deploymentId: locked.deploymentId,
          actorUserId: locked.actorUserId,
          runId: locked.runId ?? locked.id,
          tokenHash: token.hash,
          allowedOrigin: locked.allowedOrigin,
          pageRoute: locked.pageRoute,
          selectedChecks: locked.selectedChecks,
          namedHook: locked.namedHook,
          expiresAt: sessionExpires,
        })
        .returning({ id: verificationSessions.id, runId: verificationSessions.runId });

      if (locked.runId) {
        await tx
          .update(verificationRuns)
          .set({ state: "locating", updatedAt: now })
          .where(
            and(
              eq(verificationRuns.id, locked.runId),
              eq(verificationRuns.workspaceId, locked.workspaceId),
              isNull(verificationRuns.completedAt),
            ),
          );
      }

      const title = issue.body.split("\n")[0]?.trim().slice(0, 80) || `Issue #${issue.number}`;
      const session: VerificationSession = {
        sessionId: sessionRow.id,
        runId: sessionRow.runId,
        workspaceId: locked.workspaceId,
        projectId: locked.projectId,
        reviewId: locked.reviewId,
        issueId: issue.id,
        issueNumber: issue.number,
        issueTitle: title,
        environmentId: env.id,
        environmentName: env.name,
        deploymentId: locked.deploymentId,
        expectedVersion: deployment.identifier,
        allowedOrigin: locked.allowedOrigin,
        pageRoute: locked.pageRoute,
        selectedChecks: locked.selectedChecks,
        namedHook: locked.namedHook,
        hookAllowlist: env.hookAllowlist ?? [],
        returnPath: `/projects/${locked.projectId}/reviews/${locked.reviewId}/issues/${issue.number}`,
        actorUserId: locked.actorUserId,
      };

      return {
        ok: true as const,
        sessionToken: token.raw,
        expiresAt: sessionExpires.toISOString(),
        corsOrigin: header.origin,
        session,
      };
    });
  } catch {
    return { ok: false, status: 404, code: "invalid" };
  }
}

export type VerificationSessionLookup =
  | { ok: true; session: VerificationSession; corsOrigin: string }
  | {
      ok: false;
      reason: "missing" | "invalid" | "expired" | "origin" | "disabled" | "completed";
      status: 401 | 403 | 404;
      corsOrigin?: string;
    };

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function resolveVerificationSession(
  request: Request,
): Promise<VerificationSessionLookup> {
  const token = readBearerToken(request);
  const header = normalizeOrigin(request.headers.get("Origin"));
  if (!token) {
    return { ok: false, reason: "missing", status: 401 };
  }
  if (!header.ok) {
    return { ok: false, reason: "origin", status: 403 };
  }

  const tokenHash = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: verificationSessions.id,
      workspaceId: verificationSessions.workspaceId,
      projectId: verificationSessions.projectId,
      reviewId: verificationSessions.reviewId,
      issueId: verificationSessions.issueId,
      environmentId: verificationSessions.environmentId,
      deploymentId: verificationSessions.deploymentId,
      actorUserId: verificationSessions.actorUserId,
      runId: verificationSessions.runId,
      allowedOrigin: verificationSessions.allowedOrigin,
      pageRoute: verificationSessions.pageRoute,
      selectedChecks: verificationSessions.selectedChecks,
      namedHook: verificationSessions.namedHook,
      expiresAt: verificationSessions.expiresAt,
      completedAt: verificationSessions.completedAt,
      revokedAt: verificationSessions.revokedAt,
      envName: projectEnvironments.name,
      envEnabled: projectEnvironments.isEnabled,
      envOrigins: projectEnvironments.allowedOrigins,
      hookAllowlist: projectEnvironments.verificationHookAllowlist,
      issueNumber: issues.number,
      issueBody: issues.body,
      expectedVersion: deployments.identifier,
    })
    .from(verificationSessions)
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, verificationSessions.environmentId),
        eq(projectEnvironments.workspaceId, verificationSessions.workspaceId),
      ),
    )
    .innerJoin(
      issues,
      and(
        eq(issues.id, verificationSessions.issueId),
        eq(issues.workspaceId, verificationSessions.workspaceId),
      ),
    )
    .innerJoin(
      deployments,
      and(
        eq(deployments.id, verificationSessions.deploymentId),
        eq(deployments.workspaceId, verificationSessions.workspaceId),
      ),
    )
    .where(eq(verificationSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return { ok: false, reason: "invalid", status: 401, corsOrigin: header.origin };
  }
  if (row.revokedAt || row.expiresAt <= now) {
    return { ok: false, reason: "expired", status: 403, corsOrigin: header.origin };
  }
  if (row.completedAt) {
    return { ok: false, reason: "completed", status: 403, corsOrigin: header.origin };
  }
  if (!row.envEnabled) {
    return { ok: false, reason: "disabled", status: 403, corsOrigin: header.origin };
  }
  if (
    header.origin !== row.allowedOrigin ||
    !isOriginAllowed(header.origin, row.envOrigins)
  ) {
    return { ok: false, reason: "origin", status: 403, corsOrigin: header.origin };
  }

  const title = row.issueBody.split("\n")[0]?.trim().slice(0, 80) || `Issue #${row.issueNumber}`;
  return {
    ok: true,
    corsOrigin: header.origin,
    session: {
      sessionId: row.sessionId,
      runId: row.runId,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      reviewId: row.reviewId,
      issueId: row.issueId,
      issueNumber: row.issueNumber,
      issueTitle: title,
      environmentId: row.environmentId,
      environmentName: row.envName,
      deploymentId: row.deploymentId,
      expectedVersion: row.expectedVersion,
      allowedOrigin: row.allowedOrigin,
      pageRoute: row.pageRoute,
      selectedChecks: row.selectedChecks,
      namedHook: row.namedHook,
      hookAllowlist: row.hookAllowlist ?? [],
      returnPath: `/projects/${row.projectId}/reviews/${row.reviewId}/issues/${row.issueNumber}`,
      actorUserId: row.actorUserId,
    },
  };
}

export function verificationSessionErrorMessage(
  reason: Extract<VerificationSessionLookup, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "expired":
      return "This check session expired. Return to the issue and open the website again.";
    case "origin":
      return "Passoff isn’t allowed on this website address.";
    case "disabled":
      return "Passoff is turned off for this website.";
    case "completed":
      return "These checks already finished. Return to the issue to see the result.";
    default:
      return "Passoff couldn’t start these checks. Return to the issue and try again.";
  }
}
