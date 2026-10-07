import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  assets,
  issueEvidence,
  subscriptions,
  videoAssets,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createIssue } from "@/lib/issues/service";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";

/** Database-backed fixtures. Only import from tests that use TEST_DATABASE_URL. */

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

export async function createOwnerContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Owner",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");
  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("workspace failed");
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
    membershipId: membership.membershipId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

export async function addWorkspaceMember(
  owner: WorkspaceContext,
  label: string,
): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Member",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("member failed");
  const [membership] = await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: owner.workspaceId,
      userId: created.user.id,
      role: "member",
      status: "active",
    })
    .returning({ membershipId: workspaceMemberships.id, role: workspaceMemberships.role });

  return {
    membershipId: membership.membershipId,
    workspaceId: owner.workspaceId,
    workspaceName: owner.workspaceName,
    workspaceSlug: owner.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

export async function seedReviewWithIssue(label: string) {
  const context = await createOwnerContext(label);
  const project = await createProject(context, `${label} Project`);
  if (!project.ok) throw new Error("project failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: `${label} Review`,
    websiteUrl: `https://${label.toLowerCase()}-${Date.now()}.example.com/start`,
  });
  if (!review.ok) throw new Error("review failed");
  const created = await createIssue(context, {
    reviewId: review.review.id,
    body: `${label} contrast issue`,
  });
  if (!created.ok) throw new Error("issue failed");
  return {
    context,
    projectId: project.project.id,
    reviewId: review.review.id,
    issueId: created.issue.id,
    issueNumber: created.issue.number,
    scope: {
      projectId: project.project.id,
      reviewId: review.review.id,
      issueNumber: created.issue.number,
    },
  };
}

export type SeedVideoStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "needs_attention"
  | "failed";

/**
 * Saves a video record for an issue without calling Mux. Ready clips get a provider
 * asset and playback id so playback checks have something to authorize.
 */
export async function seedVideoEvidence(input: {
  workspaceId: string;
  reviewId: string;
  issueId: string;
  status?: SeedVideoStatus;
  lifecycle?: "current" | "replacement" | "retired" | "removed";
  durationMs?: number;
  uploadedByUserId?: string | null;
  createdAt?: Date;
  failureReason?: string | null;
}) {
  const status = input.status ?? "ready";
  const videoAssetId = randomUUID();
  const evidenceId = randomUUID();
  const originalAssetId = randomUUID();
  const durationMs = input.durationMs ?? 40_000;
  const hasUpload = status !== "pending";
  const hasAsset = status === "ready" || status === "needs_attention";
  const providerUploadId = hasUpload ? `upload_${randomUUID()}` : null;
  const providerAssetId = hasAsset ? `asset_${randomUUID()}` : null;
  const providerPlaybackId = status === "ready" ? `playback_${randomUUID()}` : null;
  const createdAt = input.createdAt ?? new Date();

  await db.insert(assets).values({
    id: originalAssetId,
    workspaceId: input.workspaceId,
    reviewId: input.reviewId,
    kind: "video_original",
    status,
    storageProvider: "mux",
    storageKey: providerUploadId ?? `pending:${videoAssetId}`,
    durationMs,
    uploadedByUserId: input.uploadedByUserId ?? null,
    createdAt,
  });
  await db.insert(issueEvidence).values({
    id: evidenceId,
    workspaceId: input.workspaceId,
    issueId: input.issueId,
    assetId: originalAssetId,
    kind: "video",
    captureMethod: "manual_attachment",
    captureStatus:
      status === "ready" ? "ready" : status === "failed" ? "failed" : "pending",
    createdByUserId: input.uploadedByUserId ?? null,
  });
  await db.insert(videoAssets).values({
    id: videoAssetId,
    workspaceId: input.workspaceId,
    issueId: input.issueId,
    evidenceId,
    originalAssetId,
    lifecycle: input.lifecycle ?? "current",
    durationMs,
    declaredDurationMs: durationMs,
    processingStatus: status,
    failureReason: input.failureReason ?? null,
    providerUploadId,
    providerAssetId,
    providerPlaybackId,
    createdAt,
  });

  return {
    videoAssetId,
    evidenceId,
    originalAssetId,
    providerUploadId,
    providerAssetId,
    providerPlaybackId,
  };
}

/** Gives a workspace an active paid plan so invitation tests have seats. No payment provider. */
export async function seedWorkspacePlan(
  workspaceId: string,
  plan: "free" | "studio" | "agency" = "studio",
) {
  await db
    .insert(subscriptions)
    .values({
      workspaceId,
      provider: "test",
      providerCustomerId: `test-${workspaceId}`,
      plan,
      status: "active",
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: { plan, status: "active", updatedAt: new Date() },
    });
}
