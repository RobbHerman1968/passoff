import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  organizationMemberships,
  organizations,
  subscriptions,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

async function allocateUniqueOrgSlug(base: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, 40)}-${randomBytes(3).toString("hex")}`;
    const existing = (
      await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, candidate)).limit(1)
    )[0];
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate an organization slug.");
}

/**
 * Creates a private organization + workspace + owner memberships + persisted trial.
 * Idempotent: if the user already owns an active workspace, returns that instead.
 * Never joins the seeded shared default workspace.
 */
export async function createPrivateTenantForUser(userId: string) {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new Error("User not found.");

  const existingMembership = (
    await db
      .select({
        workspaceId: workspaceMemberships.workspaceId,
        role: workspaceMemberships.role,
      })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.userId, userId))
      .limit(1)
  )[0];

  if (existingMembership) {
    return { workspaceId: existingMembership.workspaceId, created: false as const };
  }

  const displayName = (user.name || user.email.split("@")[0] || "Workspace").trim().slice(0, 80);
  const orgSlug = await allocateUniqueOrgSlug(slugify(`${displayName}-studio`));
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  const result = await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        name: `${displayName}'s studio`,
        slug: orgSlug,
        status: "active",
      })
      .returning();

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        organizationId: organization.id,
        name: "Main workspace",
        slug: "main",
        notificationEmail: user.email,
        replyToEmail: user.email,
      })
      .returning();

    await tx.insert(organizationMemberships).values({
      organizationId: organization.id,
      userId,
      role: "owner",
      status: "active",
    });

    await tx.insert(workspaceMemberships).values({
      workspaceId: workspace.id,
      userId,
      role: "owner",
    });

    await tx.insert(subscriptions).values({
      organizationId: organization.id,
      provider: "passoff",
      plan: "trial",
      status: "trialing",
      currentPeriodStart: trialStart,
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: 0,
    });

    return { organizationId: organization.id, workspaceId: workspace.id };
  });

  return { ...result, created: true as const };
}

/** @deprecated Prefer createPrivateTenantForUser — kept as alias for call-site migration. */
export async function ensureDefaultTenantMembership(userId: string) {
  await createPrivateTenantForUser(userId);
}

export async function getWorkspaceNotificationEmail(workspaceId: string): Promise<string | null> {
  const workspace = (
    await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  )[0];
  if (workspace?.notificationEmail?.trim()) return workspace.notificationEmail.trim();
  if (workspace?.replyToEmail?.trim()) return workspace.replyToEmail.trim();

  const owner = (
    await db
      .select({ email: users.email })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.role, "owner")))
      .limit(1)
  )[0];
  return owner?.email ?? null;
}
