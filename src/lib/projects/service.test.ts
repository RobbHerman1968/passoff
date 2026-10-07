import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  projects,
  reviewIssueCounters,
  workspaceMemberships,
  workspaces,
  projectEnvironments,
} from "@/db/schema";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createCredentialsUser } from "@/lib/auth/users";
import type { WorkspaceContext } from "@/lib/projects/context";
import {
  archiveProject,
  archiveReview,
  createProject,
  createWebsiteReview,
  getProjectForWorkspace,
  getReviewForWorkspace,
  listProjectReviews,
  listProjects,
  renameProject,
  renameReview,
  restoreProject,
  restoreReview,
  softDeleteProject,
} from "@/lib/projects/service";
import { seedWorkspacePlan } from "@/test/workspace-fixtures";
import { createUniqueProjectSlug as createSlug } from "@/lib/projects/slug";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<{
  context: WorkspaceContext;
  password: string;
  email: string;
}> {
  const email = uniqueEmail(label);
  const password = "long-enough-password";
  const created = await createCredentialsUser({
    firstName: "Project",
    lastName: label,
    email,
    password,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("user create failed");

  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  expect(workspace.ok).toBe(true);
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
    email,
    password,
    context: {
      membershipId: membership.membershipId,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      workspaceSlug: membership.workspaceSlug,
      role: membership.role,
      userId: created.user.id,
      userName: created.user.name ?? null,
      userEmail: created.user.email,
    },
  };
}

async function createMemberContext(
  ownerContext: WorkspaceContext,
  label: string,
): Promise<WorkspaceContext> {
  const email = uniqueEmail(label);
  const created = await createCredentialsUser({
    firstName: "Member",
    lastName: label,
    email,
    password: "long-enough-password",
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("member create failed");

  const [membership] = await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: ownerContext.workspaceId,
      userId: created.user.id,
      role: "member",
      status: "active",
    })
    .returning({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
    });

  return {
    membershipId: membership.membershipId,
    workspaceId: ownerContext.workspaceId,
    workspaceName: ownerContext.workspaceName,
    workspaceSlug: ownerContext.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

describe("project and review service", () => {
  it("lists projects only for the active team and excludes soft-deleted ones", async () => {
    const teamA = await createWorkspaceContext("lista");
    const teamB = await createWorkspaceContext("listb");

    const createdA = await createProject(teamA.context, "Alpha Site");
    const createdB = await createProject(teamB.context, "Beta Site");
    expect(createdA.ok && createdB.ok).toBe(true);
    if (!createdA.ok || !createdB.ok) return;

    const listA = await listProjects(teamA.context);
    expect(listA.map((project) => project.name)).toEqual(["Alpha Site"]);
    expect(
      await getProjectForWorkspace(teamA.context, createdB.project.id),
    ).toBeNull();

    const project = await getProjectForWorkspace(teamA.context, createdA.project.id);
    expect(project).not.toBeNull();
    if (!project) return;

    const deleted = await softDeleteProject(teamA.context, {
      projectId: project.id,
      version: project.version,
      confirmationName: project.name,
    });
    expect(deleted.ok).toBe(true);
    expect(
      await getProjectForWorkspace(teamA.context, createdA.project.id),
    ).toBeNull();
    expect(
      (await listProjects(teamA.context, { status: "all" })).find(
        (item) => item.id === createdA.project.id,
      ),
    ).toBeUndefined();
  });

  it("creates projects with unique slugs and owner metadata", async () => {
    const { context } = await createWorkspaceContext("slug");
    const first = await createProject(context, "Launch Site");
    const second = await createProject(context, "Launch Site");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const [row1] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, first.project.id));
    const [row2] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, second.project.id));

    expect(row1.slug).toBe("launch-site");
    expect(row2.slug).toBe("launch-site-2");
    expect(row1.ownerUserId).toBe(context.userId);
    expect(row1.status).toBe("active");
    expect(row1.version).toBe(1);

    const collision = await createSlug(context.workspaceId, "Launch Site");
    expect(collision).not.toBe("launch-site");
    expect(collision).not.toBe("launch-site-2");
  });

  it("renames with compare-and-swap version checking", async () => {
    const { context } = await createWorkspaceContext("rename");
    const created = await createProject(context, "Original Name");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const project = await getProjectForWorkspace(context, created.project.id);
    expect(project).not.toBeNull();
    if (!project) return;

    const stale = await renameProject(context, {
      projectId: project.id,
      name: "Stale Name",
      version: project.version,
    });
    expect(stale.ok).toBe(true);

    const conflict = await renameProject(context, {
      projectId: project.id,
      name: "Conflict Name",
      version: project.version,
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error).toBe("conflict");
    expect(conflict.project?.name).toBe("Stale Name");
  });

  it("archives and restores projects", async () => {
    const { context } = await createWorkspaceContext("archive");
    const created = await createProject(context, "Archive Me");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const project = await getProjectForWorkspace(context, created.project.id);
    if (!project) return;

    const archived = await archiveProject(context, {
      projectId: project.id,
      version: project.version,
    });
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.project.status).toBe("archived");

    const activeList = await listProjects(context, { status: "active" });
    expect(activeList.find((item) => item.id === project.id)).toBeUndefined();
    const archivedList = await listProjects(context, { status: "archived" });
    expect(archivedList.find((item) => item.id === project.id)?.name).toBe(
      "Archive Me",
    );

    const restored = await restoreProject(context, {
      projectId: project.id,
      version: archived.project.version,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.project.status).toBe("active");
  });

  it("allows only the team owner to soft-delete a project", async () => {
    const owner = await createWorkspaceContext("ownerdel");
    const member = await createMemberContext(owner.context, "memdel");
    const created = await createProject(owner.context, "Delete Target");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const project = await getProjectForWorkspace(owner.context, created.project.id);
    if (!project) return;

    const memberDelete = await softDeleteProject(member, {
      projectId: project.id,
      version: project.version,
      confirmationName: project.name,
    });
    expect(memberDelete.ok).toBe(false);
    if (memberDelete.ok) return;
    expect(memberDelete.error).toBe("forbidden");

    const ownerDelete = await softDeleteProject(owner.context, {
      projectId: project.id,
      version: project.version,
      confirmationName: project.name,
    });
    expect(ownerDelete.ok).toBe(true);

    const [row] = await db
      .select({ deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, project.id));
    expect(row.deletedAt).not.toBeNull();
  });

  it("creates website reviews with installation and counter records", async () => {
    const { context } = await createWorkspaceContext("webrev");
    const created = await createProject(context, "Website Project");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const review = await createWebsiteReview(context, {
      projectId: created.project.id,
      name: "Homepage",
      websiteUrl: "https://example.com/start",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    const detail = await getReviewForWorkspace(
      context,
      created.project.id,
      review.review.id,
    );
    expect(detail).not.toBeNull();
    if (!detail) return;
    expect(detail.status).toBe("draft");
    expect(detail.deploymentIdentifier).toBe("initial");
    expect(detail.websiteStartingUrl).toBe("https://example.com/start");
    expect(detail.websiteVerifiedAt).toBeNull();
    expect(detail.websiteIsEnabled).toBe(true);

    const [installation] = await db
      .select()
      .from(projectEnvironments)
      .where(eq(projectEnvironments.id, detail.environmentId));
    expect(installation.allowedOrigins).toEqual(["https://example.com"]);
    expect(installation.publicKey.startsWith("pk_")).toBe(true);

    const [counter] = await db
      .select()
      .from(reviewIssueCounters)
      .where(eq(reviewIssueCounters.reviewId, review.review.id));
    expect(counter.nextIssueNumber).toBe(1);

    const counts = await listProjects(context);
    expect(counts[0]?.reviewCount).toBe(1);
    expect(counts[0]?.environmentCount).toBe(1);
  });

  it("does not create standalone video reviews", async () => {
    const { context } = await createWorkspaceContext("vidrev");
    const created = await createProject(context, "Video Project");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect("createVideoReview" in (await import("@/lib/projects/service"))).toBe(
      false,
    );
  });

  it("denies cross-project and cross-team review access", async () => {
    const teamA = await createWorkspaceContext("xteama");
    const teamB = await createWorkspaceContext("xteamb");
    const projectA = await createProject(teamA.context, "A");
    const projectB = await createProject(teamB.context, "B");
    expect(projectA.ok && projectB.ok).toBe(true);
    if (!projectA.ok || !projectB.ok) return;

    const reviewA = await createWebsiteReview(teamA.context, {
      projectId: projectA.project.id,
      name: "A review",
      websiteUrl: "https://a.example.com",
    });
    expect(reviewA.ok).toBe(true);
    if (!reviewA.ok) return;

    expect(
      await getReviewForWorkspace(
        teamB.context,
        projectA.project.id,
        reviewA.review.id,
      ),
    ).toBeNull();
    expect(
      await getReviewForWorkspace(
        teamA.context,
        projectB.project.id,
        reviewA.review.id,
      ),
    ).toBeNull();
  });

  it("renames, archives, and restores reviews with version checks", async () => {
    const { context } = await createWorkspaceContext("revops");
    const project = await createProject(context, "Ops");
    expect(project.ok).toBe(true);
    if (!project.ok) return;

    const created = await createWebsiteReview(context, {
      projectId: project.project.id,
      name: "Draft cut",
      websiteUrl: "https://ops.example.com",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const review = await getReviewForWorkspace(
      context,
      project.project.id,
      created.review.id,
    );
    expect(review).not.toBeNull();
    if (!review) return;

    const renamed = await renameReview(context, {
      projectId: project.project.id,
      reviewId: review.id,
      name: "Updated cut",
      version: review.version,
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;

    const conflict = await renameReview(context, {
      projectId: project.project.id,
      reviewId: review.id,
      name: "Lost update",
      version: review.version,
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error).toBe("conflict");

    const archived = await archiveReview(context, {
      projectId: project.project.id,
      reviewId: review.id,
      version: renamed.review.version,
    });
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.review.archivedAt).not.toBeNull();

    const archivedOnly = await listProjectReviews(
      context,
      project.project.id,
      { status: "archived" },
    );
    expect(archivedOnly?.some((item) => item.id === review.id)).toBe(true);

    const restored = await restoreReview(context, {
      projectId: project.project.id,
      reviewId: review.id,
      version: archived.review.version,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.review.archivedAt).toBeNull();
  });

  it("filters projects and reviews by search terms", async () => {
    const { context } = await createWorkspaceContext("search");
    await seedWorkspacePlan(context.workspaceId, "studio");
    await createProject(context, "Northwind Website");
    await createProject(context, "Southwind Film");
    const matches = await listProjects(context, { q: "North" });
    expect(matches.map((project) => project.name)).toEqual([
      "Northwind Website",
    ]);

    const project = matches[0];
    await createWebsiteReview(context, {
      projectId: project.id,
      name: "Marketing site",
      websiteUrl: "https://north.example.com",
    });
    await createWebsiteReview(context, {
      projectId: project.id,
      name: "Launch reel",
      websiteUrl: "https://reel.example.com",
    });

    const websiteOnly = await listProjectReviews(context, project.id, {
      q: "Marketing",
    });
    expect(websiteOnly?.map((review) => review.name)).toEqual([
      "Marketing site",
    ]);

    const searchReviews = await listProjectReviews(context, project.id, {
      q: "reel",
    });
    expect(searchReviews?.map((review) => review.name)).toEqual(["Launch reel"]);
  });

  it("is safe against concurrent project creation for the same name", async () => {
    const { context } = await createWorkspaceContext("double");
    const results = await Promise.all([
      createProject(context, "Concurrent Project"),
      createProject(context, "Concurrent Project"),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const ids = results
      .filter((result): result is { ok: true; project: { id: string; name: string } } =>
        result.ok,
      )
      .map((result) => result.project.id);
    expect(new Set(ids).size).toBe(2);

    const rows = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(
        and(eq(projects.workspaceId, context.workspaceId), isNull(projects.deletedAt)),
      );
    const slugs = rows.map((row) => row.slug).sort();
    expect(slugs).toEqual(["concurrent-project", "concurrent-project-2"]);
  });
});
