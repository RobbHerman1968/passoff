import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  organizationMemberships,
  organizations,
  projects,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { AuthzError, requireActiveWorkspaceMembership } from "@/lib/auth/authorization";

export type TenantContext = {
  organizationId: string;
  workspaceId: string;
  projectId: string;
  projectSlug: string;
  userId: string;
  organizationName: string;
  workspaceName: string;
  projectName: string;
  userName: string;
  userEmail: string;
};

export type WorkspaceScope = {
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  userEmail: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  clientName: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function defaultSlugs() {
  return {
    organizationSlug: process.env.PASSOFF_DEFAULT_ORGANIZATION_SLUG || "passoff",
    workspaceSlug: process.env.PASSOFF_DEFAULT_WORKSPACE_SLUG || "main",
    projectSlug: process.env.PASSOFF_DEFAULT_PROJECT_SLUG || "agent-website",
    /** Used only by plugin/service routes that authenticate without a browser session. */
    serviceUserEmail: process.env.PASSOFF_DEFAULT_USER_EMAIL || "rob.herman@toolsbydesign.com",
  };
}

async function requireAuthenticatedUser() {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !email) {
    redirect("/login");
  }

  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) {
    throw new Error("Your Pass-Off account could not be found. Sign out and sign in again.");
  }

  return user;
}

async function requireServiceUser() {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL === "1") {
    throw new Error("Service-user tenant resolution is development-only.");
  }
  const { serviceUserEmail } = defaultSlugs();
  const user = (await db.select().from(users).where(eq(users.email, serviceUserEmail)).limit(1))[0];
  if (!user) {
    throw new Error("The default Pass-Off owner has not been seeded.");
  }
  return user;
}

/** Kebab-case slug from a display name; falls back to `project` when empty. */
export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "project";
}

/** Accept a project UUID, slug, or `/projects/<id>` URL fragment from the plugin / dashboard. */
export function normalizeProjectKey(value: unknown): string {
  let key = typeof value === "string" ? value.trim() : "";
  if (!key) return "";
  try {
    const url = new URL(key);
    const match = url.pathname.match(/\/projects\/([^/]+)/i);
    if (match?.[1]) key = decodeURIComponent(match[1]);
  } catch {
    const match = key.match(/\/projects\/([^/?#]+)/i);
    if (match?.[1]) key = decodeURIComponent(match[1]);
  }
  return key.trim();
}

async function tenantFromProject(
  project: typeof projects.$inferSelect,
  user: typeof users.$inferSelect,
): Promise<TenantContext> {
  const membership = (
    await db
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.userId, user.id),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, user.id),
          eq(workspaceMemberships.workspaceId, project.workspaceId),
          eq(organizationMemberships.organizationId, project.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!membership) {
    throw new AuthzError("Not found.", 404);
  }

  const organization = (await db.select().from(organizations).where(eq(organizations.id, project.organizationId)).limit(1))[0];
  if (!organization) throw new AuthzError("Not found.", 404);
  const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, project.workspaceId)).limit(1))[0];
  if (!workspace) throw new AuthzError("Not found.", 404);

  return {
    organizationId: organization.id,
    workspaceId: workspace.id,
    projectId: project.id,
    projectSlug: project.slug,
    userId: user.id,
    organizationName: organization.name,
    workspaceName: workspace.name,
    projectName: project.name,
    userName: user.name || user.email,
    userEmail: user.email,
  };
}

/**
 * Active workspace for the signed-in user via membership.
 * Replaces shared default-workspace scoping.
 */
export async function getDefaultWorkspaceScope(): Promise<WorkspaceScope> {
  return requireActiveWorkspaceMembership();
}

export async function listWorkspaceProjects(workspaceId: string): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      slug: projects.slug,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.name));
  return rows;
}

/** Development-only prototype default project within the caller's own workspace when present. */
export async function getPrototypeTenantContext(): Promise<TenantContext> {
  const { projectSlug } = defaultSlugs();
  const scope = await getDefaultWorkspaceScope();
  const user = await requireAuthenticatedUser();
  const project = (
    await db
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, scope.workspaceId), eq(projects.slug, projectSlug)))
      .limit(1)
  )[0];
  if (!project) {
    throw new Error(
      "No prototype project found in your workspace. Create an approval room from the dashboard, or seed the owner workspace for local Figma prototypes.",
    );
  }
  return tenantFromProject(project, user);
}

async function tenantContextForProjectKey(
  projectKeyInput: unknown,
  user: typeof users.$inferSelect,
): Promise<TenantContext> {
  const projectKey = normalizeProjectKey(projectKeyInput);
  if (!projectKey) throw new Error("A Pass-Off project key is required.");

  if (uuidPattern.test(projectKey)) {
    const project = (await db.select().from(projects).where(eq(projects.id, projectKey)).limit(1))[0];
    if (!project) throw new AuthzError("Not found.", 404);
    return tenantFromProject(project, user);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(projectKey) || projectKey.length > 80) {
    throw new Error("Enter the project UUID from the Pass-Off URL (/projects/<id>), or the project slug.");
  }

  const memberships = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, user.id),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .where(eq(workspaceMemberships.userId, user.id));

  for (const membership of memberships) {
    const project = (
      await db
        .select()
        .from(projects)
        .where(and(eq(projects.workspaceId, membership.workspaceId), eq(projects.slug, projectKey)))
        .limit(1)
    )[0];
    if (project) return tenantFromProject(project, user);
  }

  throw new AuthzError("Not found.", 404);
}

export async function getTenantContextForProjectKey(projectKeyInput: unknown): Promise<TenantContext> {
  return tenantContextForProjectKey(projectKeyInput, await requireAuthenticatedUser());
}

/** Plugin/service auth only — resolves tenant as the seeded owner without a browser session. */
export async function getServiceTenantContextForProjectKey(projectKeyInput: unknown): Promise<TenantContext> {
  return tenantContextForProjectKey(projectKeyInput, await requireServiceUser());
}

/** Prefer an explicit project key; otherwise use the seeded default project. */
export async function resolveTenantContext(projectKeyInput?: unknown): Promise<TenantContext> {
  const projectKey = normalizeProjectKey(projectKeyInput);
  if (projectKey) return getTenantContextForProjectKey(projectKey);
  return getPrototypeTenantContext();
}

export async function resolveTenantFromRequest(request: Request, bodyProjectKey?: unknown): Promise<TenantContext> {
  const urlKey = new URL(request.url).searchParams.get("projectKey");
  return resolveTenantContext(bodyProjectKey ?? urlKey);
}

export async function allocateUniqueProjectSlug(workspaceId: string, name: string): Promise<string> {
  const base = slugifyProjectName(name).slice(0, 72);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = (
      await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, candidate)))
        .limit(1)
    )[0];
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a unique project slug.");
}
