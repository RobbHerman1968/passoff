import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  DEFAULT_CONSENT_SETTINGS,
  activityEvents,
  deployments,
  projectEnvironments,
  projects,
} from "@/db/schema";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import { ENVIRONMENT_ACTIVITY } from "@/lib/projects/constants";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { EnvironmentKind } from "@/lib/projects/statuses";
import { createPublicInstallationKey, normalizeWebsiteUrl } from "@/lib/projects/urls";

export type ServiceError =
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unavailable"
  | "archived_readonly";

export type EnvironmentDetail = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  kind: EnvironmentKind;
  baseUrl: string;
  allowedOrigins: string[];
  publicKey: string;
  isEnabled: boolean;
  verifiedAt: Date | null;
  lastSeenAt: Date | null;
  version: number;
};

function uniqueEnvironmentName(name: string, existing: Set<string>): string {
  if (!existing.has(name.toLowerCase())) return name;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const candidate = `${name} ${attempt}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} ${crypto.randomUUID().slice(0, 8)}`;
}

export function validateAllowedOrigins(origins: string[]): {
  ok: true;
  origins: string[];
} | { ok: false; message: string } {
  const normalized: string[] = [];
  for (const origin of origins) {
    const result = normalizeOrigin(origin);
    if (!result.ok) {
      return {
        ok: false,
        message: "Allowed origins must be exact http or https addresses without usernames or passwords.",
      };
    }
    if (!normalized.includes(result.origin)) {
      normalized.push(result.origin);
    }
  }
  if (normalized.length === 0) {
    return { ok: false, message: "Add at least one allowed origin." };
  }
  return { ok: true, origins: normalized };
}

export async function createEnvironment(
  context: WorkspaceContext,
  input: {
    projectId: string;
    name: string;
    kind: EnvironmentKind;
    websiteUrl: string;
  },
): Promise<
  | { ok: true; environment: EnvironmentDetail }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const normalized = normalizeWebsiteUrl(input.websiteUrl);
  if (!normalized.ok) {
    return { ok: false, error: "validation", message: normalized.message };
  }

  const origins = validateAllowedOrigins([normalized.allowedOrigin]);
  if (!origins.ok) {
    return { ok: false, error: "validation", message: origins.message };
  }

  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .select({
          id: projects.id,
          status: projects.status,
        })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.workspaceId, context.workspaceId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1)
        .for("update");

      if (!project) {
        return { ok: false as const, error: "not_found" as const };
      }
      if (project.status === "archived") {
        return { ok: false as const, error: "archived_readonly" as const };
      }

      const existingNames = await tx
        .select({ name: projectEnvironments.name })
        .from(projectEnvironments)
        .where(
          and(
            eq(projectEnvironments.projectId, input.projectId),
            eq(projectEnvironments.workspaceId, context.workspaceId),
          ),
        );

      const name = uniqueEnvironmentName(
        input.name,
        new Set(existingNames.map((row) => row.name.toLowerCase())),
      );
      const now = new Date();

      const [environment] = await tx
        .insert(projectEnvironments)
        .values({
          workspaceId: context.workspaceId,
          projectId: input.projectId,
          name,
          kind: input.kind,
          baseUrl: normalized.startingUrl,
          allowedOrigins: origins.origins,
          publicKey: createPublicInstallationKey(),
          isEnabled: true,
          consentSettings: DEFAULT_CONSENT_SETTINGS,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(activityEvents).values({
        workspaceId: context.workspaceId,
        projectId: input.projectId,
        actorUserId: context.userId,
        type: ENVIRONMENT_ACTIVITY.created,
        data: { name },
      });

      return {
        ok: true as const,
        environment: {
          id: environment.id,
          workspaceId: environment.workspaceId,
          projectId: environment.projectId,
          name: environment.name,
          kind: environment.kind,
          baseUrl: environment.baseUrl,
          allowedOrigins: environment.allowedOrigins,
          publicKey: environment.publicKey,
          isEnabled: environment.isEnabled,
          verifiedAt: environment.verifiedAt,
          lastSeenAt: environment.lastSeenAt,
          version: environment.version,
        },
      };
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return {
        ok: false,
        error: "conflict",
        message: "An environment with this name already exists in the project.",
      };
    }
    return { ok: false, error: "unavailable" };
  }
}

export async function recordManualDeployment(
  context: WorkspaceContext,
  input: {
    environmentId: string;
    identifier: string;
    displayLabel?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<
  | { ok: true; deploymentId: string }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const identifier = input.identifier.trim();
  if (!identifier) {
    return { ok: false, error: "validation", message: "Enter a version identifier." };
  }

  try {
    return await db.transaction(async (tx) => {
      const [environment] = await tx
        .select({
          id: projectEnvironments.id,
          workspaceId: projectEnvironments.workspaceId,
          projectId: projectEnvironments.projectId,
          projectStatus: projects.status,
        })
        .from(projectEnvironments)
        .innerJoin(
          projects,
          and(
            eq(projects.id, projectEnvironments.projectId),
            eq(projects.workspaceId, context.workspaceId),
            isNull(projects.deletedAt),
          ),
        )
        .where(
          and(
            eq(projectEnvironments.id, input.environmentId),
            eq(projectEnvironments.workspaceId, context.workspaceId),
          ),
        )
        .limit(1);

      if (!environment) {
        return { ok: false as const, error: "not_found" as const };
      }
      if (environment.projectStatus === "archived") {
        return { ok: false as const, error: "archived_readonly" as const };
      }

      const now = new Date();
      const [deployment] = await tx
        .insert(deployments)
        .values({
          workspaceId: environment.workspaceId,
          projectId: environment.projectId,
          environmentId: environment.id,
          identifier,
          displayLabel: input.displayLabel ?? null,
          url: input.url ?? null,
          source: "manual",
          metadata: input.metadata ?? {},
          recordedAt: now,
          createdByUserId: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: deployments.id });

      return { ok: true as const, deploymentId: deployment.id };
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return {
        ok: false,
        error: "conflict",
        message: "That version identifier already exists in this environment.",
      };
    }
    return { ok: false, error: "unavailable" };
  }
}

export { isOriginAllowed };
