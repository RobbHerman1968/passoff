import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { assets, subscriptions } from "@/db/schema";
import { pricingPlans, type PricingPlan } from "@/lib/pricing";

export type Entitlements = {
  planId: PricingPlan["id"];
  status: string;
  maxActiveRooms: number;
  maxStorageBytes: number;
  maxMembers: number;
  vendorBadge: boolean;
  customDomain: boolean;
  trialEndsAt: Date | null;
  /** When trial/paid access has ended — rooms remain readable, mutations blocked. */
  isExpired: boolean;
  canMutate: boolean;
  canCreateRooms: boolean;
};

const PLAN_CAPS: Record<
  PricingPlan["id"],
  Omit<Entitlements, "planId" | "status" | "trialEndsAt" | "isExpired" | "canMutate" | "canCreateRooms">
> = {
  trial: {
    maxActiveRooms: 2,
    maxStorageBytes: 2 * 1024 * 1024 * 1024,
    maxMembers: 1,
    vendorBadge: true,
    customDomain: false,
  },
  solo: {
    maxActiveRooms: 5,
    maxStorageBytes: 10 * 1024 * 1024 * 1024,
    maxMembers: 1,
    vendorBadge: true,
    customDomain: false,
  },
  studio: {
    maxActiveRooms: 25,
    maxStorageBytes: 100 * 1024 * 1024 * 1024,
    maxMembers: 3,
    vendorBadge: false,
    customDomain: false,
  },
  agency: {
    maxActiveRooms: 100,
    maxStorageBytes: 500 * 1024 * 1024 * 1024,
    maxMembers: 10,
    vendorBadge: false,
    customDomain: true,
  },
};

function deriveAccess(status: string, periodEnd: Date | null, planId: PricingPlan["id"]) {
  const now = Date.now();
  const expiredByDate = Boolean(periodEnd && periodEnd.getTime() < now);
  const inactiveStatuses = new Set(["canceled", "unpaid", "incomplete_expired", "expired"]);
  const isExpired =
    inactiveStatuses.has(status) ||
    (planId === "trial" && (status === "trialing" || status === "expired") && expiredByDate) ||
    (status === "past_due" && expiredByDate);

  const canMutate = !isExpired && ["trialing", "active", "past_due"].includes(status);
  const canCreateRooms = canMutate && ["trialing", "active"].includes(status);
  return { isExpired, canMutate, canCreateRooms };
}

export async function getOrganizationEntitlements(organizationId: string): Promise<Entitlements> {
  const row = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1)
  )[0];

  if (!row) {
    // Missing subscription must NOT invent a rolling 14-day window.
    // Treat as expired until a trial row is created (signup should always create one).
    return {
      planId: "trial",
      status: "expired",
      trialEndsAt: null,
      isExpired: true,
      canMutate: false,
      canCreateRooms: false,
      ...PLAN_CAPS.trial,
    };
  }

  const planId = (pricingPlans.find((p) => p.id === row.plan)?.id || "trial") as PricingPlan["id"];
  const access = deriveAccess(row.status, row.currentPeriodEnd, planId);
  return {
    planId,
    status: access.isExpired && planId === "trial" ? "expired" : row.status,
    trialEndsAt: row.currentPeriodEnd,
    ...PLAN_CAPS[planId],
    ...access,
  };
}

export async function assertCanCreateRoom(organizationId: string, activeRoomCount: number) {
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements.canCreateRooms) {
    throw new Error(
      entitlements.isExpired
        ? "Your trial has ended. Upgrade to Solo to create new approval rooms. Existing rooms remain readable."
        : "Your plan cannot create new approval rooms right now.",
    );
  }
  if (activeRoomCount >= entitlements.maxActiveRooms) {
    throw new Error(
      `Your ${entitlements.planId} plan allows ${entitlements.maxActiveRooms} active approval rooms. Archive a room or upgrade.`,
    );
  }
  return entitlements;
}

export async function assertCanMutate(organizationId: string) {
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements.canMutate) {
    throw new Error(
      "Your trial or subscription has expired. Existing approval rooms remain readable; upgrade to continue editing.",
    );
  }
  return entitlements;
}

export async function getWorkspaceStorageUsageBytes(workspaceId: string) {
  const row = (
    await db
      .select({ total: sql<number>`coalesce(sum(${assets.bytes}), 0)` })
      .from(assets)
      .where(and(eq(assets.workspaceId, workspaceId), eq(assets.uploadStatus, "ready")))
  )[0];
  return Number(row?.total || 0);
}

export async function assertStorageAllowance(organizationId: string, workspaceId: string, additionalBytes: number) {
  const entitlements = await getOrganizationEntitlements(organizationId);
  await assertCanMutate(organizationId);
  const used = await getWorkspaceStorageUsageBytes(workspaceId);
  if (used + additionalBytes > entitlements.maxStorageBytes) {
    throw new Error(
      `This upload would exceed your ${entitlements.planId} storage allowance (${Math.round(entitlements.maxStorageBytes / (1024 * 1024 * 1024))} GB).`,
    );
  }
  return entitlements;
}

export async function upsertSubscriptionMirror(input: {
  organizationId: string;
  provider: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  plan: string;
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const existing = (
    await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, input.organizationId),
          eq(subscriptions.provider, input.provider),
        ),
      )
      .limit(1)
  )[0];

  if (existing) {
    await db
      .update(subscriptions)
      .set({
        providerCustomerId: input.providerCustomerId ?? existing.providerCustomerId,
        providerSubscriptionId: input.providerSubscriptionId ?? existing.providerSubscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart ?? existing.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd ?? existing.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ? 1 : 0,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing.id));
    return existing.id;
  }

  // Prefer updating any existing org subscription (e.g. trial → stripe) over inserting a second row.
  const anyExisting = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, input.organizationId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1)
  )[0];

  if (anyExisting) {
    await db
      .update(subscriptions)
      .set({
        provider: input.provider,
        providerCustomerId: input.providerCustomerId ?? anyExisting.providerCustomerId,
        providerSubscriptionId: input.providerSubscriptionId ?? anyExisting.providerSubscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart ?? anyExisting.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd ?? anyExisting.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ? 1 : 0,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, anyExisting.id));
    return anyExisting.id;
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      organizationId: input.organizationId,
      provider: input.provider,
      providerCustomerId: input.providerCustomerId ?? null,
      providerSubscriptionId: input.providerSubscriptionId ?? null,
      plan: input.plan,
      status: input.status,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ? 1 : 0,
    })
    .returning({ id: subscriptions.id });
  return created.id;
}
