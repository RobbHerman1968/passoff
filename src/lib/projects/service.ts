import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  activityEvents,
  deployments,
  issues,
  projectEnvironments,
  projects,
  reviewIssueCounters,
  reviews,
  users,
} from "@/db/schema";
import { createEnvironment } from "@/lib/environments/service";
import {
  PROJECT_ACTIVITY,
  REVIEW_ACTIVITY,
} from "@/lib/projects/constants";
import {
  canDeleteProjects,
  canMutateProjects,
} from "@/lib/projects/permissions";
import { createUniqueProjectSlug } from "@/lib/projects/slug";
import type { ProjectStatus, ReviewStatus } from "@/lib/projects/statuses";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const openIssueSql = sql`${issues.status}::text in ('open', 'in_progress', 'ready_for_verification') and ${issues.deletedAt} is null`;

export type ServiceError =
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unavailable"
  | "archived_readonly";

export type ProjectListItem = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  version: number;
  updatedAt: Date;
  ownerName: string | null;
  reviewCount: number;
  environmentCount: number;
  openIssueCount: number;
};

export type ProjectDetail = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  version: number;
  updatedAt: Date;
  createdAt: Date;
  ownerName: string | null;
  ownerUserId: string | null;
  reviewCount: number;
  openIssueCount: number;
};

export type ReviewListItem = {
  id: string;
  projectId: string;
  environmentId: string;
  deploymentId: string;
  name: string;
  status: ReviewStatus;
  version: number;
  archivedAt: Date | null;
  updatedAt: Date;
  ownerName: string | null;
  environmentName: string;
  deploymentIdentifier: string;
  openIssueCount: number;
  isHistorical: boolean;
};

export type ReviewDetail = ReviewListItem & {
  projectName: string;
  projectStatus: ProjectStatus;
  openedAt: Date | null;
  closedAt: Date | null;
  websiteStartingUrl: string | null;
  websiteVerifiedAt: Date | null;
  websiteLastSeenAt: Date | null;
  websiteIsEnabled: boolean | null;
  websitePublicKey: string | null;
  websiteAllowedOrigins: string[] | null;
};

export type ProjectListFilters = {
  q?: string;
  status?: "active" | "archived" | "all";
};

export type ReviewListFilters = {
  q?: string;
  status?: "all" | "archived" | ReviewStatus;
};

function ownerDisplayName(name: string | null, email: string | null) {
  return name?.trim() || email?.trim() || "Unknown owner";
}

async function insertActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  values: {
    workspaceId: string;
    projectId?: string | null;
    reviewId?: string | null;
    actorUserId: string;
    type: string;
    data?: Record<string, unknown>;
  },
) {
  await tx.insert(activityEvents).values({
    workspaceId: values.workspaceId,
    projectId: values.projectId ?? null,
    reviewId: values.reviewId ?? null,
    actorUserId: values.actorUserId,
    type: values.type,
    data: values.data ?? {},
  });
}

export async function listProjects(
  context: WorkspaceContext,
  filters: ProjectListFilters = {},
): Promise<ProjectListItem[]> {
  const status = filters.status ?? "active";
  const q = filters.q?.trim() ?? "";

  const conditions = [
    eq(projects.workspaceId, context.workspaceId),
    isNull(projects.deletedAt),
  ];

  if (status === "active") {
    conditions.push(eq(projects.status, "active"));
  } else if (status === "archived") {
    conditions.push(eq(projects.status, "archived"));
  }

  if (q) {
    conditions.push(ilike(projects.name, `%${q.replace(/[%_]/g, "\\$&")}%`));
  }

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      version: projects.version,
      updatedAt: projects.updatedAt,
      ownerName: users.name,
      ownerEmail: users.email,
      reviewCount: sql<number>`coalesce(count(distinct ${reviews.id}), 0)`.mapWith(
        Number,
      ),
      environmentCount: sql<number>`coalesce(count(distinct ${projectEnvironments.id}), 0)`.mapWith(
        Number,
      ),
      openIssueCount: sql<number>`coalesce(count(distinct ${issues.id}) filter (where ${openIssueSql}), 0)`.mapWith(
        Number,
      ),
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerUserId))
    .leftJoin(
      reviews,
      and(eq(reviews.projectId, projects.id), eq(reviews.workspaceId, context.workspaceId)),
    )
    .leftJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.projectId, projects.id),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .leftJoin(
      issues,
      and(eq(issues.reviewId, reviews.id), eq(issues.workspaceId, context.workspaceId)),
    )
    .where(and(...conditions))
    .groupBy(
      projects.id,
      projects.name,
      projects.slug,
      projects.status,
      projects.version,
      projects.updatedAt,
      users.name,
      users.email,
    )
    .orderBy(desc(projects.updatedAt), asc(projects.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt,
    ownerName: ownerDisplayName(row.ownerName, row.ownerEmail),
    reviewCount: row.reviewCount,
    environmentCount: row.environmentCount,
    openIssueCount: row.openIssueCount,
  }));
}

export async function getProjectForWorkspace(
  context: WorkspaceContext,
  projectId: string,
): Promise<ProjectDetail | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      version: projects.version,
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt,
      ownerUserId: projects.ownerUserId,
      ownerName: users.name,
      ownerEmail: users.email,
      reviewCount: sql<number>`coalesce(count(distinct ${reviews.id}), 0)`.mapWith(
        Number,
      ),
      openIssueCount: sql<number>`coalesce(count(distinct ${issues.id}) filter (where ${openIssueSql}), 0)`.mapWith(
        Number,
      ),
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerUserId))
    .leftJoin(
      reviews,
      and(eq(reviews.projectId, projects.id), eq(reviews.workspaceId, context.workspaceId)),
    )
    .leftJoin(
      issues,
      and(eq(issues.reviewId, reviews.id), eq(issues.workspaceId, context.workspaceId)),
    )
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, context.workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .groupBy(
      projects.id,
      projects.name,
      projects.slug,
      projects.status,
      projects.version,
      projects.updatedAt,
      projects.createdAt,
      projects.ownerUserId,
      users.name,
      users.email,
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    ownerUserId: row.ownerUserId,
    ownerName: ownerDisplayName(row.ownerName, row.ownerEmail),
    reviewCount: row.reviewCount,
    openIssueCount: row.openIssueCount,
  };
}

export async function createProject(
  context: WorkspaceContext,
  name: string,
): Promise<
  | { ok: true; project: { id: string; name: string } }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  try {
    return await db.transaction(async (tx) => {
      const slug = await createUniqueProjectSlug(context.workspaceId, name, tx);
      const now = new Date();

      const [project] = await tx
        .insert(projects)
        .values({
          workspaceId: context.workspaceId,
          ownerUserId: context.userId,
          name,
          slug,
          status: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: projects.id, name: projects.name });

      await insertActivity(tx, {
        workspaceId: context.workspaceId,
        projectId: project.id,
        actorUserId: context.userId,
        type: PROJECT_ACTIVITY.created,
        data: { name: project.name },
      });

      return { ok: true as const, project };
    });
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message:
        "We couldn’t create this project. Your project name is still here. Try again.",
    };
  }
}

async function mutateProject(
  context: WorkspaceContext,
  input: { projectId: string; version: number },
  next: {
    name?: string;
    status?: ProjectStatus;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
  },
  existingStatus?: ProjectStatus,
) {
  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({
      ...next,
      version: input.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, context.workspaceId),
        eq(projects.version, input.version),
        isNull(projects.deletedAt),
        existingStatus ? eq(projects.status, existingStatus) : undefined,
      ),
    )
    .returning({ id: projects.id });
  return updated;
}

export async function renameProject(
  context: WorkspaceContext,
  input: { projectId: string; name: string; version: number },
): Promise<
  | { ok: true; project: ProjectDetail }
  | { ok: false; error: ServiceError; project?: ProjectDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getProjectForWorkspace(context, input.projectId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "archived") {
    return { ok: false, error: "archived_readonly", project: existing };
  }

  const updated = await mutateProject(context, input, { name: input.name }, "active");
  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      project: await getProjectForWorkspace(context, input.projectId),
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: input.projectId,
    actorUserId: context.userId,
    type: PROJECT_ACTIVITY.renamed,
    data: { from: existing.name, to: input.name },
  });

  const project = await getProjectForWorkspace(context, input.projectId);
  if (!project) return { ok: false, error: "unavailable" };
  return { ok: true, project };
}

export async function archiveProject(
  context: WorkspaceContext,
  input: { projectId: string; version: number },
): Promise<
  | { ok: true; project: ProjectDetail }
  | { ok: false; error: ServiceError; project?: ProjectDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getProjectForWorkspace(context, input.projectId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "archived") return { ok: true, project: existing };

  const now = new Date();
  const updated = await mutateProject(
    context,
    input,
    { status: "archived", archivedAt: now },
    "active",
  );
  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      project: await getProjectForWorkspace(context, input.projectId),
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: input.projectId,
    actorUserId: context.userId,
    type: PROJECT_ACTIVITY.archived,
    data: { name: existing.name },
  });

  const project = await getProjectForWorkspace(context, input.projectId);
  if (!project) return { ok: false, error: "unavailable" };
  return { ok: true, project };
}

export async function restoreProject(
  context: WorkspaceContext,
  input: { projectId: string; version: number },
): Promise<
  | { ok: true; project: ProjectDetail }
  | { ok: false; error: ServiceError; project?: ProjectDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getProjectForWorkspace(context, input.projectId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "active") return { ok: true, project: existing };

  const updated = await mutateProject(
    context,
    input,
    { status: "active", archivedAt: null },
    "archived",
  );
  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      project: await getProjectForWorkspace(context, input.projectId),
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: input.projectId,
    actorUserId: context.userId,
    type: PROJECT_ACTIVITY.restored,
    data: { name: existing.name },
  });

  const project = await getProjectForWorkspace(context, input.projectId);
  if (!project) return { ok: false, error: "unavailable" };
  return { ok: true, project };
}

export async function softDeleteProject(
  context: WorkspaceContext,
  input: { projectId: string; version: number; confirmationName: string },
): Promise<
  | { ok: true }
  | { ok: false; error: ServiceError; message?: string; project?: ProjectDetail | null }
> {
  if (!canDeleteProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getProjectForWorkspace(context, input.projectId);
  if (!existing) return { ok: false, error: "not_found" };

  if (input.confirmationName.trim() !== existing.name) {
    return {
      ok: false,
      error: "validation",
      message: "Type the project name exactly to confirm deletion.",
      project: existing,
    };
  }

  const now = new Date();
  const updated = await mutateProject(context, input, { deletedAt: now });
  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      project: await getProjectForWorkspace(context, input.projectId),
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: input.projectId,
    actorUserId: context.userId,
    type: PROJECT_ACTIVITY.deleted,
    data: { name: existing.name },
  });

  return { ok: true };
}

export async function listProjectReviews(
  context: WorkspaceContext,
  projectId: string,
  filters: ReviewListFilters = {},
): Promise<ReviewListItem[] | null> {
  const project = await getProjectForWorkspace(context, projectId);
  if (!project) return null;

  const q = filters.q?.trim() ?? "";
  const status = filters.status ?? "all";

  const conditions = [
    eq(reviews.workspaceId, context.workspaceId),
    eq(reviews.projectId, projectId),
  ];

  if (status === "archived") {
    conditions.push(isNotNull(reviews.archivedAt));
  } else if (status !== "all") {
    conditions.push(eq(reviews.status, status));
    conditions.push(isNull(reviews.archivedAt));
  }

  if (q) {
    conditions.push(ilike(reviews.name, `%${q.replace(/[%_]/g, "\\$&")}%`));
  }

  const latestDeployment = db
    .select({
      environmentId: deployments.environmentId,
      latestRecordedAt: sql<Date>`max(${deployments.recordedAt})`.as("latest_recorded_at"),
    })
    .from(deployments)
    .where(eq(deployments.workspaceId, context.workspaceId))
    .groupBy(deployments.environmentId)
    .as("latest_deployment");

  const rows = await db
    .select({
      id: reviews.id,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      deploymentId: reviews.deploymentId,
      name: reviews.name,
      status: reviews.status,
      version: reviews.version,
      archivedAt: reviews.archivedAt,
      updatedAt: reviews.updatedAt,
      ownerName: users.name,
      ownerEmail: users.email,
      environmentName: projectEnvironments.name,
      deploymentIdentifier: deployments.identifier,
      deploymentRecordedAt: deployments.recordedAt,
      latestRecordedAt: latestDeployment.latestRecordedAt,
      openIssueCount: sql<number>`coalesce(count(distinct ${issues.id}) filter (where ${openIssueSql}), 0)`.mapWith(
        Number,
      ),
    })
    .from(reviews)
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, reviews.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .innerJoin(
      deployments,
      and(
        eq(deployments.id, reviews.deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
      ),
    )
    .leftJoin(
      latestDeployment,
      eq(latestDeployment.environmentId, reviews.environmentId),
    )
    .leftJoin(users, eq(users.id, reviews.ownerUserId))
    .leftJoin(
      issues,
      and(eq(issues.reviewId, reviews.id), eq(issues.workspaceId, context.workspaceId)),
    )
    .where(and(...conditions))
    .groupBy(
      reviews.id,
      reviews.projectId,
      reviews.environmentId,
      reviews.deploymentId,
      reviews.name,
      reviews.status,
      reviews.version,
      reviews.archivedAt,
      reviews.updatedAt,
      users.name,
      users.email,
      projectEnvironments.name,
      deployments.identifier,
      deployments.recordedAt,
      latestDeployment.latestRecordedAt,
    )
    .orderBy(desc(reviews.updatedAt), asc(reviews.name));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    deploymentId: row.deploymentId,
    name: row.name,
    status: row.status,
    version: row.version,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
    ownerName: ownerDisplayName(row.ownerName, row.ownerEmail),
    environmentName: row.environmentName,
    deploymentIdentifier: row.deploymentIdentifier,
    openIssueCount: row.openIssueCount,
    isHistorical:
      Boolean(row.latestRecordedAt) &&
      row.deploymentRecordedAt.getTime() < new Date(row.latestRecordedAt).getTime(),
  }));
}

export async function getReviewForWorkspace(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
): Promise<ReviewDetail | null> {
  const [row] = await db
    .select({
      id: reviews.id,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      deploymentId: reviews.deploymentId,
      name: reviews.name,
      status: reviews.status,
      version: reviews.version,
      archivedAt: reviews.archivedAt,
      updatedAt: reviews.updatedAt,
      openedAt: reviews.openedAt,
      closedAt: reviews.closedAt,
      ownerName: users.name,
      ownerEmail: users.email,
      projectName: projects.name,
      projectStatus: projects.status,
      environmentName: projectEnvironments.name,
      deploymentIdentifier: deployments.identifier,
      deploymentRecordedAt: deployments.recordedAt,
      websiteStartingUrl: projectEnvironments.baseUrl,
      websiteVerifiedAt: projectEnvironments.verifiedAt,
      websiteLastSeenAt: projectEnvironments.lastSeenAt,
      websiteIsEnabled: projectEnvironments.isEnabled,
      websitePublicKey: projectEnvironments.publicKey,
      websiteAllowedOrigins: projectEnvironments.allowedOrigins,
      openIssueCount: sql<number>`coalesce(count(distinct ${issues.id}) filter (where ${openIssueSql}), 0)`.mapWith(
        Number,
      ),
    })
    .from(reviews)
    .innerJoin(
      projects,
      and(
        eq(projects.id, reviews.projectId),
        eq(projects.workspaceId, context.workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, reviews.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .innerJoin(
      deployments,
      and(
        eq(deployments.id, reviews.deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
      ),
    )
    .leftJoin(users, eq(users.id, reviews.ownerUserId))
    .leftJoin(
      issues,
      and(eq(issues.reviewId, reviews.id), eq(issues.workspaceId, context.workspaceId)),
    )
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.projectId, projectId),
        eq(reviews.workspaceId, context.workspaceId),
      ),
    )
    .groupBy(
      reviews.id,
      reviews.projectId,
      reviews.environmentId,
      reviews.deploymentId,
      reviews.name,
      reviews.status,
      reviews.version,
      reviews.archivedAt,
      reviews.updatedAt,
      reviews.openedAt,
      reviews.closedAt,
      users.name,
      users.email,
      projects.name,
      projects.status,
      projectEnvironments.name,
      deployments.identifier,
      deployments.recordedAt,
      projectEnvironments.baseUrl,
      projectEnvironments.verifiedAt,
      projectEnvironments.lastSeenAt,
      projectEnvironments.isEnabled,
      projectEnvironments.publicKey,
      projectEnvironments.allowedOrigins,
    )
    .limit(1);

  if (!row) return null;

  const [latest] = await db
    .select({ recordedAt: deployments.recordedAt })
    .from(deployments)
    .where(
      and(
        eq(deployments.environmentId, row.environmentId),
        eq(deployments.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(desc(deployments.recordedAt))
    .limit(1);

  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    deploymentId: row.deploymentId,
    name: row.name,
    status: row.status,
    version: row.version,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    ownerName: ownerDisplayName(row.ownerName, row.ownerEmail),
    environmentName: row.environmentName,
    deploymentIdentifier: row.deploymentIdentifier,
    openIssueCount: row.openIssueCount,
    isHistorical: Boolean(
      latest && latest.recordedAt.getTime() > row.deploymentRecordedAt.getTime(),
    ),
    projectName: row.projectName,
    projectStatus: row.projectStatus,
    websiteStartingUrl: row.websiteStartingUrl,
    websiteVerifiedAt: row.websiteVerifiedAt,
    websiteLastSeenAt: row.websiteLastSeenAt,
    websiteIsEnabled: row.websiteIsEnabled,
    websitePublicKey: row.websitePublicKey,
    websiteAllowedOrigins: row.websiteAllowedOrigins,
  };
}

export async function createWebsiteReview(
  context: WorkspaceContext,
  input: { projectId: string; name: string; websiteUrl: string },
): Promise<
  | { ok: true; review: { id: string; projectId: string } }
  | { ok: false; error: ServiceError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const project = await getProjectForWorkspace(context, input.projectId);
  if (!project) return { ok: false, error: "not_found" };
  if (project.status === "archived") {
    return { ok: false, error: "archived_readonly" };
  }

  const environment = await createEnvironment(context, {
    projectId: input.projectId,
    name: input.name,
    kind: "custom",
    websiteUrl: input.websiteUrl,
  });
  if (!environment.ok) {
    return {
      ok: false,
      error: environment.error,
      message: environment.message,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [deployment] = await tx
        .insert(deployments)
        .values({
          workspaceId: context.workspaceId,
          projectId: input.projectId,
          environmentId: environment.environment.id,
          identifier: "initial",
          displayLabel: "Initial version",
          url: environment.environment.baseUrl,
          source: "manual",
          metadata: {},
          recordedAt: now,
          createdByUserId: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: deployments.id });

      const [review] = await tx
        .insert(reviews)
        .values({
          workspaceId: context.workspaceId,
          projectId: input.projectId,
          environmentId: environment.environment.id,
          deploymentId: deployment.id,
          ownerUserId: context.userId,
          name: input.name,
          status: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: reviews.id, projectId: reviews.projectId });

      await tx.insert(reviewIssueCounters).values({
        reviewId: review.id,
        nextIssueNumber: 1,
      });

      await tx
        .update(projects)
        .set({ updatedAt: now })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.workspaceId, context.workspaceId),
            isNull(projects.deletedAt),
          ),
        );

      await insertActivity(tx, {
        workspaceId: context.workspaceId,
        projectId: input.projectId,
        reviewId: review.id,
        actorUserId: context.userId,
        type: REVIEW_ACTIVITY.created,
        data: {
          name: input.name,
          environmentId: environment.environment.id,
          deploymentId: deployment.id,
        },
      });

      return { ok: true as const, review };
    });
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message:
        "We couldn’t add this review. Your details are still here. Try again.",
    };
  }
}

export async function openReview(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; version: number },
): Promise<
  | { ok: true; review: ReviewDetail }
  | { ok: false; error: ServiceError; message?: string; review?: ReviewDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.projectStatus === "archived" || existing.archivedAt) {
    return { ok: false, error: "archived_readonly", review: existing };
  }
  if (!existing.deploymentId) {
    return {
      ok: false,
      error: "validation",
      message: "Record a version before opening this review.",
      review: existing,
    };
  }
  if (existing.status === "open") return { ok: true, review: existing };

  const now = new Date();
  const [updated] = await db
    .update(reviews)
    .set({
      status: "open",
      openedAt: existing.openedAt ?? now,
      openedByUserId: context.userId,
      version: input.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.projectId, input.projectId),
        eq(reviews.workspaceId, context.workspaceId),
        eq(reviews.version, input.version),
        isNull(reviews.archivedAt),
      ),
    )
    .returning({ id: reviews.id });

  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      review: await getReviewForWorkspace(context, input.projectId, input.reviewId),
    };
  }

  const review = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!review) return { ok: false, error: "unavailable" };
  return { ok: true, review };
}

export async function renameReview(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    name: string;
    version: number;
  },
): Promise<
  | { ok: true; review: ReviewDetail }
  | { ok: false; error: ServiceError; review?: ReviewDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.projectStatus === "archived" || existing.archivedAt) {
    return { ok: false, error: "archived_readonly", review: existing };
  }

  const now = new Date();
  const [updated] = await db
    .update(reviews)
    .set({
      name: input.name,
      version: input.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.projectId, input.projectId),
        eq(reviews.workspaceId, context.workspaceId),
        eq(reviews.version, input.version),
        isNull(reviews.archivedAt),
      ),
    )
    .returning({ id: reviews.id });

  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      review: await getReviewForWorkspace(context, input.projectId, input.reviewId),
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    actorUserId: context.userId,
    type: REVIEW_ACTIVITY.renamed,
    data: { from: existing.name, to: input.name },
  });

  const review = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!review) return { ok: false, error: "unavailable" };
  return { ok: true, review };
}

export async function archiveReview(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; version: number },
): Promise<
  | { ok: true; review: ReviewDetail }
  | { ok: false; error: ServiceError; review?: ReviewDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.projectStatus === "archived") {
    return { ok: false, error: "archived_readonly", review: existing };
  }
  if (existing.archivedAt) return { ok: true, review: existing };

  const now = new Date();
  const [updated] = await db
    .update(reviews)
    .set({
      archivedAt: now,
      version: input.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.projectId, input.projectId),
        eq(reviews.workspaceId, context.workspaceId),
        eq(reviews.version, input.version),
        isNull(reviews.archivedAt),
      ),
    )
    .returning({ id: reviews.id });

  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      review: await getReviewForWorkspace(context, input.projectId, input.reviewId),
    };
  }

  const review = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!review) return { ok: false, error: "unavailable" };
  return { ok: true, review };
}

export async function restoreReview(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; version: number },
): Promise<
  | { ok: true; review: ReviewDetail }
  | { ok: false; error: ServiceError; review?: ReviewDetail | null }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.projectStatus === "archived") {
    return { ok: false, error: "archived_readonly", review: existing };
  }
  if (!existing.archivedAt) return { ok: true, review: existing };

  const now = new Date();
  const [updated] = await db
    .update(reviews)
    .set({
      archivedAt: null,
      version: input.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.projectId, input.projectId),
        eq(reviews.workspaceId, context.workspaceId),
        eq(reviews.version, input.version),
        isNotNull(reviews.archivedAt),
      ),
    )
    .returning({ id: reviews.id });

  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      review: await getReviewForWorkspace(context, input.projectId, input.reviewId),
    };
  }

  const review = await getReviewForWorkspace(context, input.projectId, input.reviewId);
  if (!review) return { ok: false, error: "unavailable" };
  return { ok: true, review };
}

export async function countProjectsForWorkspace(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)));
  return row?.value ?? 0;
}
