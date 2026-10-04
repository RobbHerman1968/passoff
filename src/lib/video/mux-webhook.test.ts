import { createHmac, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  assets,
  issueEvidence,
  providerEvents,
  videoAssets,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createIssue } from "@/lib/issues/service";
import type { WorkspaceContext } from "@/lib/projects/context";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import { VIDEO_FAILURE_REASONS } from "@/lib/video/failure-reasons";

const WEBHOOK_SECRET = "test-mux-webhook-secret";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Video",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");

  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("workspace create failed");

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

async function seedVideoAsset(options?: {
  processingStatus?: "uploading" | "processing" | "ready" | "failed";
  durationMs?: number;
  providerAssetId?: string | null;
  providerPlaybackId?: string | null;
}) {
  const context = await createWorkspaceContext("mux");
  const project = await createProject(context, "Mux Project");
  if (!project.ok) throw new Error("project create failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: "Homepage",
    websiteUrl: "https://example.com",
  });
  if (!review.ok) throw new Error("review create failed");
  const issue = await createIssue(context, {
    reviewId: review.review.id,
    body: "Video evidence issue",
  });
  if (!issue.ok) throw new Error("issue create failed");

  const originalAssetId = randomUUID();
  const evidenceId = randomUUID();
  const videoAssetId = randomUUID();
  const uploadId = `upload_${randomUUID()}`;

  await db.insert(assets).values({
    id: originalAssetId,
    workspaceId: context.workspaceId,
    reviewId: review.review.id,
    kind: "video_original",
    status: options?.processingStatus ?? "uploading",
    storageProvider: "mux",
    storageKey: uploadId,
    durationMs: options?.durationMs ?? 30_000,
    uploadedByUserId: context.userId,
  });

  await db.insert(issueEvidence).values({
    id: evidenceId,
    workspaceId: context.workspaceId,
    issueId: issue.issue.id,
    assetId: originalAssetId,
    kind: "video",
    captureMethod: "manual_attachment",
    captureStatus: "pending",
    createdByUserId: context.userId,
  });

  await db.insert(videoAssets).values({
    id: videoAssetId,
    workspaceId: context.workspaceId,
    evidenceId,
    originalAssetId,
    durationMs: options?.durationMs ?? 30_000,
    processingStatus: options?.processingStatus ?? "uploading",
    providerUploadId: uploadId,
    providerAssetId: options?.providerAssetId ?? null,
    providerPlaybackId: options?.providerPlaybackId ?? null,
  });

  return {
    context,
    reviewId: review.review.id,
    issueId: issue.issue.id,
    videoAssetId,
    uploadId,
    originalAssetId,
    evidenceId,
  };
}

async function signBody(body: string, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { header: `t=${timestamp},v1=${signature}`, timestamp };
}

describe("Mux webhook verification and reconciliation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts a valid mux-signature and rejects invalid signatures", async () => {
    vi.stubEnv("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const { getMuxWebhookClient } = await import("@/lib/video/mux");
    const body = JSON.stringify({
      id: "evt_valid",
      type: "video.asset.ready",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: { id: "asset_x" },
      attempts: [],
      environment: { id: "env", name: "test" },
      object: { type: "event", id: "evt_valid" },
    });

    const valid = await signBody(body);
    await expect(
      getMuxWebhookClient().webhooks.unwrap(body, { "mux-signature": valid.header }),
    ).resolves.toMatchObject({ id: "evt_valid" });

    await expect(
      getMuxWebhookClient().webhooks.unwrap(body, {
        "mux-signature": "t=1,v1=deadbeef",
      }),
    ).rejects.toThrow();
  });

  it("reconciles upload asset created, ready, duplicate, and out-of-order events", async () => {
    vi.stubEnv("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const seeded = await seedVideoAsset();
    const { processMuxWebhookEvent } = await import("@/lib/video/webhook-service");
    const muxAssetId = `asset_${randomUUID()}`;
    const playbackId = `playback_${randomUUID()}`;

    const readyFirst = await processMuxWebhookEvent({
      id: `evt_ready_${randomUUID()}`,
      type: "video.asset.ready",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: muxAssetId,
        passthrough: seeded.videoAssetId,
        upload_id: seeded.uploadId,
        duration: 45,
        playback_ids: [{ id: playbackId, policy: "signed" }],
      },
    });
    expect(readyFirst).toEqual({ ok: true, status: "processed" });

    const [readyRow] = await db
      .select({
        processingStatus: videoAssets.processingStatus,
        providerPlaybackId: videoAssets.providerPlaybackId,
        durationMs: videoAssets.durationMs,
      })
      .from(videoAssets)
      .where(eq(videoAssets.id, seeded.videoAssetId));
    expect(readyRow?.processingStatus).toBe("ready");
    expect(readyRow?.providerPlaybackId).toBe(playbackId);
    expect(readyRow?.durationMs).toBe(45_000);

    const [evidence] = await db
      .select({ captureStatus: issueEvidence.captureStatus })
      .from(issueEvidence)
      .where(eq(issueEvidence.id, seeded.evidenceId));
    expect(evidence?.captureStatus).toBe("ready");

    const lateProcessing = await processMuxWebhookEvent({
      id: `evt_upload_${randomUUID()}`,
      type: "video.upload.asset_created",
      created_at: String(Math.floor(Date.now() / 1000) - 10),
      data: {
        id: seeded.uploadId,
        asset_id: muxAssetId,
        new_asset_settings: { passthrough: seeded.videoAssetId },
      },
    });
    expect(lateProcessing).toEqual({ ok: true, status: "processed" });

    const [stillReady] = await db
      .select({ processingStatus: videoAssets.processingStatus })
      .from(videoAssets)
      .where(eq(videoAssets.id, seeded.videoAssetId));
    expect(stillReady?.processingStatus).toBe("ready");

    const duplicateId = `evt_dup_${randomUUID()}`;
    const first = await processMuxWebhookEvent({
      id: duplicateId,
      type: "video.asset.ready",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: muxAssetId,
        passthrough: seeded.videoAssetId,
        upload_id: seeded.uploadId,
        duration: 45,
        playback_ids: [{ id: playbackId, policy: "signed" }],
      },
    });
    const second = await processMuxWebhookEvent({
      id: duplicateId,
      type: "video.asset.ready",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: muxAssetId,
        passthrough: seeded.videoAssetId,
        upload_id: seeded.uploadId,
        duration: 45,
        playback_ids: [{ id: playbackId, policy: "signed" }],
      },
    });
    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");

    const events = await db
      .select({ id: providerEvents.id })
      .from(providerEvents)
      .where(eq(providerEvents.providerEventId, duplicateId));
    expect(events).toHaveLength(1);
  });

  it(
    "marks processing failures and over-duration assets without exposing playback",
    async () => {
    const failedSeed = await seedVideoAsset({ processingStatus: "processing" });
    const { processMuxWebhookEvent } = await import("@/lib/video/webhook-service");
    const muxAssetId = `asset_${randomUUID()}`;

    await processMuxWebhookEvent({
      id: `evt_err_${randomUUID()}`,
      type: "video.asset.errored",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: muxAssetId,
        passthrough: failedSeed.videoAssetId,
        upload_id: failedSeed.uploadId,
        errors: { type: "invalid_input", messages: ["raw provider detail"] },
      },
    });

    const [failed] = await db
      .select({
        processingStatus: videoAssets.processingStatus,
        failureReason: videoAssets.failureReason,
        providerPlaybackId: videoAssets.providerPlaybackId,
      })
      .from(videoAssets)
      .where(eq(videoAssets.id, failedSeed.videoAssetId));
    expect(failed?.processingStatus).toBe("failed");
    expect(failed?.failureReason).toBe(VIDEO_FAILURE_REASONS.processing_failed);
    expect(failed?.providerPlaybackId).toBeNull();

    const longSeed = await seedVideoAsset({ processingStatus: "processing" });
    await processMuxWebhookEvent({
      id: `evt_long_${randomUUID()}`,
      type: "video.asset.ready",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: `asset_${randomUUID()}`,
        passthrough: longSeed.videoAssetId,
        upload_id: longSeed.uploadId,
        duration: 181,
        playback_ids: [{ id: `playback_${randomUUID()}`, policy: "signed" }],
      },
    });

    const [longRow] = await db
      .select({
        processingStatus: videoAssets.processingStatus,
        failureReason: videoAssets.failureReason,
        providerPlaybackId: videoAssets.providerPlaybackId,
      })
      .from(videoAssets)
      .where(eq(videoAssets.id, longSeed.videoAssetId));
    expect(longRow?.processingStatus).toBe("needs_attention");
    expect(longRow?.failureReason).toBe(VIDEO_FAILURE_REASONS.duration_exceeded);
    expect(longRow?.providerPlaybackId).toBeNull();
  },
    20_000,
  );

  it("handles deletion safely when the local record is already gone", async () => {
    const { processMuxWebhookEvent } = await import("@/lib/video/webhook-service");
    const result = await processMuxWebhookEvent({
      id: `evt_del_${randomUUID()}`,
      type: "video.asset.deleted",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: `asset_missing_${randomUUID()}`,
        passthrough: randomUUID(),
      },
    });
    expect(result).toEqual({ ok: true, status: "ignored" });
  });

  it("rejects webhook route requests with invalid signatures without mutating state", async () => {
    vi.stubEnv("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const seeded = await seedVideoAsset();
    const { POST } = await import("@/app/api/webhooks/mux/route");
    const body = JSON.stringify({
      id: `evt_route_${randomUUID()}`,
      type: "video.asset.ready",
      created_at: String(Math.floor(Date.now() / 1000)),
      data: {
        id: `asset_${randomUUID()}`,
        passthrough: seeded.videoAssetId,
        upload_id: seeded.uploadId,
        duration: 20,
        playback_ids: [{ id: `playback_${randomUUID()}`, policy: "signed" }],
      },
      attempts: [],
      environment: { id: "env", name: "test" },
      object: { type: "event", id: "evt" },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/mux", {
        method: "POST",
        headers: { "mux-signature": "t=1,v1=invalid" },
        body,
      }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const [row] = await db
      .select({ processingStatus: videoAssets.processingStatus })
      .from(videoAssets)
      .where(eq(videoAssets.id, seeded.videoAssetId));
    expect(row?.processingStatus).toBe("uploading");
  });
});
