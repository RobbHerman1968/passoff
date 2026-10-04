import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { projectEnvironments, projects, reviews } from "@/db/schema";
import { getPassoffEmbedBaseUrl } from "@/lib/installations/embed-config";
import {
  resolveInstallationStatus,
  type InstallationStatus,
} from "@/lib/installations/status";
import { buildInstallSnippet } from "@/lib/installations/snippet";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { canMutateProjects } from "@/lib/projects/permissions";

export type WebsiteInstallationDetail = {
  id: string;
  reviewId: string;
  publicKey: string;
  startingUrl: string;
  allowedOrigins: string[];
  isEnabled: boolean;
  verifiedAt: Date | null;
  lastSeenAt: Date | null;
  status: InstallationStatus;
  installSnippet: string | null;
  embedConfigured: boolean;
};

type ServiceError = "forbidden" | "not_found" | "unavailable" | "archived_readonly";

async function loadEnvironmentForReview(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
) {
  const [row] = await db
    .select({
      installationId: projectEnvironments.id,
      reviewId: reviews.id,
      publicKey: projectEnvironments.publicKey,
      startingUrl: projectEnvironments.baseUrl,
      allowedOrigins: projectEnvironments.allowedOrigins,
      isEnabled: projectEnvironments.isEnabled,
      verifiedAt: projectEnvironments.verifiedAt,
      lastSeenAt: projectEnvironments.lastSeenAt,
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

function toDetail(
  row: NonNullable<Awaited<ReturnType<typeof loadEnvironmentForReview>>>,
): WebsiteInstallationDetail {
  const embed = getPassoffEmbedBaseUrl();
  const status = resolveInstallationStatus({
    isEnabled: row.isEnabled,
    verifiedAt: row.verifiedAt,
    lastSeenAt: row.lastSeenAt,
    allowedOrigins: row.allowedOrigins,
  });

  let installSnippet: string | null = null;
  if (embed.ok) {
    try {
      installSnippet = buildInstallSnippet({
        installationKey: row.publicKey,
        embedBaseUrl: embed.baseUrl,
      });
    } catch {
      installSnippet = null;
    }
  }

  return {
    id: row.installationId,
    reviewId: row.reviewId,
    publicKey: row.publicKey,
    startingUrl: row.startingUrl,
    allowedOrigins: row.allowedOrigins,
    isEnabled: row.isEnabled,
    verifiedAt: row.verifiedAt,
    lastSeenAt: row.lastSeenAt,
    status,
    installSnippet,
    embedConfigured: embed.ok,
  };
}

export async function getWebsiteInstallationForReview(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
): Promise<WebsiteInstallationDetail | null> {
  const row = await loadEnvironmentForReview(context, projectId, reviewId);
  if (!row) return null;
  return toDetail(row);
}

export async function setWebsiteInstallationEnabled(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; enabled: boolean },
): Promise<
  | { ok: true; installation: WebsiteInstallationDetail }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const row = await loadEnvironmentForReview(
    context,
    input.projectId,
    input.reviewId,
  );
  if (!row) {
    return { ok: false, error: "not_found" };
  }
  if (row.projectStatus === "archived") {
    return {
      ok: false,
      error: "archived_readonly",
      message: "Restore this project before changing website setup.",
    };
  }

  try {
    const now = new Date();
    await db
      .update(projectEnvironments)
      .set({
        isEnabled: input.enabled,
        updatedAt: now,
        version: sql`${projectEnvironments.version} + 1`,
      })
      .where(
        and(
          eq(projectEnvironments.id, row.installationId),
          eq(projectEnvironments.workspaceId, context.workspaceId),
        ),
      );

    const updated = await getWebsiteInstallationForReview(
      context,
      input.projectId,
      input.reviewId,
    );
    if (!updated) {
      return { ok: false, error: "unavailable" };
    }
    return { ok: true, installation: updated };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
