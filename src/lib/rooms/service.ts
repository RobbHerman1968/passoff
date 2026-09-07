import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  approvals,
  assets,
  blobDeletionJobs,
  handoffItems,
  projects,
  reviewers,
  revisionAssets,
  revisions,
  roomComments,
  shareLinks,
} from "@/db/schema";
import { getWorkspaceNotificationEmail } from "@/lib/auth/tenant-membership";
import { writeAuditEvent } from "@/lib/rooms/audit";
import {
  clampPercent,
  computeRevisionDigest,
  generateShareToken,
  hashShareToken,
  sanitizeCommentBody,
} from "@/lib/rooms/crypto";
import {
  assertCanCreateRoom,
  assertCanMutate,
  assertStorageAllowance,
} from "@/lib/rooms/entitlements";
import { enqueueOutbox } from "@/lib/rooms/outbox";
import { logWarn } from "@/lib/logging";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_HANDOFF_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  assetPublicUrl,
  buildHandoffObjectPath,
  buildTenantObjectPath,
  checksumSha256,
  deleteAssetBytes,
  getStorageAdapter,
  writeAssetBytes,
} from "@/lib/rooms/storage";
import {
  serializeApprovalReceipt,
  type ApprovalReceiptSource,
  type ApprovalReceiptView,
} from "@/lib/rooms/approval-receipt";
import { DEFAULT_APPROVAL_STATEMENT } from "@/lib/rooms/types";
import { getSiteUrl } from "@/lib/site";
import {
  allocateUniqueProjectSlug,
  type WorkspaceScope,
} from "@/lib/tenant/scope";

const ACTIVE_ROOM_STATUSES = ["DRAFT", "SENT", "VIEWED", "CHANGES_REQUESTED", "APPROVED"] as const;

export async function countActiveRooms(workspaceId: string) {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        inArray(projects.status, [...ACTIVE_ROOM_STATUSES]),
      ),
    );
  return rows.length;
}

export async function createRoom(
  scope: WorkspaceScope,
  input: { name: string; clientName: string },
) {
  const name = input.name.trim().slice(0, 120);
  const clientName = input.clientName.trim().slice(0, 120);
  if (!name) throw new Error("A project name is required.");
  if (!clientName) throw new Error("A client name is required.");

  await assertCanMutate(scope.organizationId);
  const activeCount = await countActiveRooms(scope.workspaceId);
  await assertCanCreateRoom(scope.organizationId, activeCount);

  const slug = await allocateUniqueProjectSlug(scope.workspaceId, name);

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        name,
        clientName,
        slug,
        status: "DRAFT",
      })
      .returning();

    const [revision] = await tx
      .insert(revisions)
      .values({
        workspaceId: scope.workspaceId,
        projectId: project.id,
        number: 1,
        status: "DRAFT",
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId: project.id,
        actorType: "user",
        actorId: scope.userId,
        action: "project.created",
        targetType: "project",
        targetId: project.id,
        metadata: { revisionId: revision.id },
      },
      tx as unknown as typeof db,
    );

    return { project, revision };
  });
}

export async function listRooms(workspaceId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      slug: projects.slug,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      currentPublishedRevisionId: projects.currentPublishedRevisionId,
      approvedRevisionId: projects.approvedRevisionId,
      handoffReleasedAt: projects.handoffReleasedAt,
    })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(desc(projects.updatedAt));
}

export async function getRoomOrThrow(workspaceId: string, projectId: string) {
  const project = (
    await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .limit(1)
  )[0];
  if (!project) throw new Error("Room not found.");
  return project;
}

export async function getRoomBundle(workspaceId: string, projectId: string) {
  const project = await getRoomOrThrow(workspaceId, projectId);
  const revisionRows = await db
    .select()
    .from(revisions)
    .where(eq(revisions.projectId, projectId))
    .orderBy(desc(revisions.number));

  const draft = revisionRows.find((r) => r.status === "DRAFT") || null;
  const published =
    revisionRows.find((r) => r.id === project.currentPublishedRevisionId) ||
    revisionRows.find((r) => r.status === "PUBLISHED") ||
    null;

  const focusRevisionId = draft?.id || published?.id || revisionRows[0]?.id;
  const membership = focusRevisionId
    ? await db
        .select({
          revisionAssetId: revisionAssets.id,
          sortOrder: revisionAssets.sortOrder,
          asset: assets,
        })
        .from(revisionAssets)
        .innerJoin(assets, eq(revisionAssets.assetId, assets.id))
        .where(eq(revisionAssets.revisionId, focusRevisionId))
        .orderBy(asc(revisionAssets.sortOrder))
    : [];

  const share = (
    await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.projectId, projectId), eq(shareLinks.status, "ACTIVE")))
      .orderBy(desc(shareLinks.createdAt))
      .limit(1)
  )[0];

  const comments = published
    ? await db
        .select()
        .from(roomComments)
        .where(eq(roomComments.revisionId, published.id))
        .orderBy(asc(roomComments.createdAt))
    : [];

  const approvalReceipts = await listApprovalReceiptsForProject(projectId, {
    includeReviewerEmail: true,
  });

  const handoff = await db
    .select()
    .from(handoffItems)
    .where(eq(handoffItems.projectId, projectId))
    .orderBy(asc(handoffItems.sortOrder));

  return {
    project,
    revisions: revisionRows,
    draft,
    published,
    membership: membership.map((row) => ({
      revisionAssetId: row.revisionAssetId,
      sortOrder: row.sortOrder,
      asset: {
        ...row.asset,
        url: row.asset.objectKey ? assetPublicUrl(row.asset.id) : row.asset.externalUrl,
      },
    })),
    shareLink: share
      ? {
          id: share.id,
          status: share.status,
          expiresAt: share.expiresAt,
          viewCount: share.viewCount,
          lastViewedAt: share.lastViewedAt,
        }
      : null,
    comments,
    approvals: approvalReceipts,
    handoff,
  };
}

/** Build approval receipt views from existing approval/revision/reviewer/asset rows. */
export async function listApprovalReceiptsForProject(
  projectId: string,
  options?: { includeReviewerEmail?: boolean; decision?: "approved" | "changes_requested" },
): Promise<ApprovalReceiptView[]> {
  const project = (
    await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  )[0];
  if (!project) return [];

  const approvalConditions = [eq(approvals.projectId, projectId)];
  if (options?.decision) {
    approvalConditions.push(eq(approvals.decision, options.decision));
  }

  const rows = await db
    .select({
      approval: approvals,
      reviewerName: reviewers.name,
      reviewerEmail: reviewers.email,
      revisionNumber: revisions.number,
      revisionId: revisions.id,
    })
    .from(approvals)
    .innerJoin(reviewers, eq(approvals.reviewerId, reviewers.id))
    .innerJoin(revisions, eq(approvals.revisionId, revisions.id))
    .where(and(...approvalConditions))
    .orderBy(desc(approvals.approvedAt));

  const revisionIds = [...new Set(rows.map((row) => row.revisionId))];
  const assetsByRevision = new Map<string, string[]>();
  if (revisionIds.length > 0) {
    const assetRows = await db
      .select({
        revisionId: revisionAssets.revisionId,
        label: assets.label,
        sortOrder: revisionAssets.sortOrder,
      })
      .from(revisionAssets)
      .innerJoin(assets, eq(revisionAssets.assetId, assets.id))
      .where(inArray(revisionAssets.revisionId, revisionIds))
      .orderBy(asc(revisionAssets.sortOrder));
    for (const row of assetRows) {
      const list = assetsByRevision.get(row.revisionId) || [];
      list.push(row.label);
      assetsByRevision.set(row.revisionId, list);
    }
  }

  return rows.map((row) => {
    const source: ApprovalReceiptSource = {
      id: row.approval.id,
      decision: row.approval.decision,
      acceptanceStatement: row.approval.acceptanceStatement,
      contentDigest: row.approval.contentDigest,
      approvedAt: row.approval.approvedAt,
      supersededAt: row.approval.supersededAt,
      projectName: project.name,
      clientName: project.clientName,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      reviewerName: row.reviewerName,
      reviewerEmail: row.reviewerEmail,
      assetNames: assetsByRevision.get(row.revisionId) || [],
    };
    return serializeApprovalReceipt(source, {
      includeReviewerEmail: options?.includeReviewerEmail !== false,
    });
  });
}

export async function ensureDraftRevision(workspaceId: string, projectId: string) {
  const existing = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.projectId, projectId),
          eq(revisions.workspaceId, workspaceId),
          eq(revisions.status, "DRAFT"),
        ),
      )
      .limit(1)
  )[0];
  if (existing) return existing;

  const latest = (
    await db
      .select()
      .from(revisions)
      .where(eq(revisions.projectId, projectId))
      .orderBy(desc(revisions.number))
      .limit(1)
  )[0];

  const [created] = await db
    .insert(revisions)
    .values({
      workspaceId,
      projectId,
      number: (latest?.number || 0) + 1,
      status: "DRAFT",
    })
    .returning();
  return created;
}

export async function uploadRoomAsset(input: {
  scope: WorkspaceScope;
  projectId: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
  kind?: "image" | "pdf" | "screenshot";
  width?: number | null;
  height?: number | null;
}) {
  const project = await getRoomOrThrow(input.scope.workspaceId, input.projectId);
  if (project.status === "ARCHIVED") throw new Error("Archived rooms cannot accept new assets.");

  const mime = input.mime.toLowerCase();
  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error("Only images and PDFs are supported.");
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be 25 MB or smaller.");
  }

  await assertCanMutate(input.scope.organizationId);
  await assertStorageAllowance(
    input.scope.organizationId,
    input.scope.workspaceId,
    input.bytes.byteLength,
  );

  const draft = await ensureDraftRevision(input.scope.workspaceId, input.projectId);
  const objectKey = buildTenantObjectPath({
    workspaceId: input.scope.workspaceId,
    projectId: input.projectId,
    revisionId: draft.id,
    filename: input.fileName,
  });
  const stored = await writeAssetBytes(objectKey, input.bytes, input.mime);
  const checksum = checksumSha256(input.bytes);
  const kind =
    input.kind ||
    (mime === "application/pdf" ? "pdf" : "image");
  const storage = getStorageAdapter();

  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        kind,
        label: input.fileName.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled",
        objectKey: stored.pathname,
        blobUrl: stored.url ?? null,
        storageProvider: storage.provider,
        uploadStatus: "ready",
        revisionId: draft.id,
        mime: input.mime,
        bytes: input.bytes.byteLength,
        checksum,
        width: input.width ?? null,
        height: input.height ?? null,
        uploadedByUserId: input.scope.userId,
      })
      .returning();

    const maxSort = (
      await tx
        .select({ value: sql<number>`coalesce(max(${revisionAssets.sortOrder}), -1)` })
        .from(revisionAssets)
        .where(eq(revisionAssets.revisionId, draft.id))
    )[0]?.value;

    const [member] = await tx
      .insert(revisionAssets)
      .values({
        revisionId: draft.id,
        assetId: asset.id,
        sortOrder: (maxSort ?? -1) + 1,
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        actorType: "user",
        actorId: input.scope.userId,
        action: "asset.uploaded",
        targetType: "asset",
        targetId: asset.id,
      },
      tx as unknown as typeof db,
    );

    return { asset, revisionAssetId: member.id, revisionId: draft.id };
  });
}

export async function addExternalUrlAsset(input: {
  scope: WorkspaceScope;
  projectId: string;
  url: string;
  label?: string;
}) {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");
  await getRoomOrThrow(input.scope.workspaceId, input.projectId);
  const draft = await ensureDraftRevision(input.scope.workspaceId, input.projectId);

  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        kind: "url",
        label: (input.label || url).slice(0, 200),
        externalUrl: url,
        uploadedByUserId: input.scope.userId,
      })
      .returning();

    const maxSort = (
      await tx
        .select({ value: sql<number>`coalesce(max(${revisionAssets.sortOrder}), -1)` })
        .from(revisionAssets)
        .where(eq(revisionAssets.revisionId, draft.id))
    )[0]?.value;

    await tx.insert(revisionAssets).values({
      revisionId: draft.id,
      assetId: asset.id,
      sortOrder: (maxSort ?? -1) + 1,
    });

    return asset;
  });
}

export async function publishRevision(scope: WorkspaceScope, projectId: string) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  const draft = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.projectId, projectId),
          eq(revisions.workspaceId, scope.workspaceId),
          eq(revisions.status, "DRAFT"),
        ),
      )
      .limit(1)
  )[0];
  if (!draft) throw new Error("No draft revision to publish.");

  const members = await db
    .select({
      assetId: revisionAssets.assetId,
      sortOrder: revisionAssets.sortOrder,
      checksum: assets.checksum,
    })
    .from(revisionAssets)
    .innerJoin(assets, eq(revisionAssets.assetId, assets.id))
    .where(eq(revisionAssets.revisionId, draft.id))
    .orderBy(asc(revisionAssets.sortOrder));

  if (members.length === 0) throw new Error("Add at least one asset before publishing.");

  const digest = computeRevisionDigest(members);

  return db.transaction(async (tx) => {
    if (project.currentPublishedRevisionId) {
      await tx
        .update(revisions)
        .set({ status: "SUPERSEDED", supersededAt: new Date(), updatedAt: new Date() })
        .where(eq(revisions.id, project.currentPublishedRevisionId));
    }

    await tx
      .update(revisions)
      .set({
        status: "PUBLISHED",
        contentDigest: digest,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(revisions.id, draft.id));

    const nextStatus =
      project.status === "APPROVED" || project.status === "CHANGES_REQUESTED"
        ? "SENT"
        : project.status === "DRAFT"
          ? "SENT"
          : project.status === "ARCHIVED"
            ? "SENT"
            : "SENT";

    await tx
      .update(projects)
      .set({
        currentPublishedRevisionId: draft.id,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId,
        actorType: "user",
        actorId: scope.userId,
        action: "revision.published",
        targetType: "revision",
        targetId: draft.id,
        metadata: { digest, number: draft.number },
      },
      tx as unknown as typeof db,
    );

    return { revisionId: draft.id, digest, number: draft.number };
  });
}

export async function createOrRotateShareLink(
  scope: WorkspaceScope,
  projectId: string,
  options?: { expiresInDays?: number; notifyEmail?: string },
) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (!project.currentPublishedRevisionId) {
    throw new Error("Publish a revision before creating a share link.");
  }

  const rawToken = generateShareToken();
  const tokenHash = hashShareToken(rawToken);
  const expiresAt =
    options?.expiresInDays && options.expiresInDays > 0
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const link = await db.transaction(async (tx) => {
    await tx
      .update(shareLinks)
      .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shareLinks.projectId, projectId), eq(shareLinks.status, "ACTIVE")));

    const [created] = await tx
      .insert(shareLinks)
      .values({
        workspaceId: scope.workspaceId,
        projectId,
        tokenHash,
        scope: "review",
        status: "ACTIVE",
        expiresAt,
        createdByUserId: scope.userId,
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId,
        actorType: "user",
        actorId: scope.userId,
        action: "share_link.created",
        targetType: "share_link",
        targetId: created.id,
      },
      tx as unknown as typeof db,
    );

    return created;
  });

  if (options?.notifyEmail) {
    const shareUrl = `${getSiteUrl()}/share/${rawToken}`;
    const emailResult = await enqueueOutbox({
      type: "email.share",
      payload: {
        to: options.notifyEmail,
        projectName: project.name,
        clientName: project.clientName,
        shareUrl,
        replyTo: await getWorkspaceNotificationEmail(scope.workspaceId),
      },
      idempotencyKey: `email.share:${link.id}:${options.notifyEmail.toLowerCase()}`,
    });
    return {
      id: link.id,
      token: rawToken,
      expiresAt: link.expiresAt,
      notification: emailResult.queued
        ? { status: "queued" as const }
        : { status: "skipped" as const, reason: emailResult.reason || "duplicate" },
    };
  }

  return { id: link.id, token: rawToken, expiresAt: link.expiresAt, notification: null };
}

export async function resolveShareToken(rawToken: string) {
  const tokenHash = hashShareToken(rawToken);
  const link = (
    await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, tokenHash)).limit(1)
  )[0];
  if (!link || link.status !== "ACTIVE") throw new Error("This share link is invalid or revoked.");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    await db
      .update(shareLinks)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(shareLinks.id, link.id));
    throw new Error("This share link has expired.");
  }

  const project = (
    await db.select().from(projects).where(eq(projects.id, link.projectId)).limit(1)
  )[0];
  if (!project) throw new Error("This share link is invalid or revoked.");
  if (!project.currentPublishedRevisionId) throw new Error("Nothing has been published for review yet.");

  const revision = (
    await db
      .select()
      .from(revisions)
      .where(eq(revisions.id, project.currentPublishedRevisionId))
      .limit(1)
  )[0];
  if (!revision || revision.status === "DRAFT") {
    throw new Error("Nothing has been published for review yet.");
  }

  const membership = await db
    .select({
      revisionAssetId: revisionAssets.id,
      sortOrder: revisionAssets.sortOrder,
      asset: assets,
    })
    .from(revisionAssets)
    .innerJoin(assets, eq(revisionAssets.assetId, assets.id))
    .where(eq(revisionAssets.revisionId, revision.id))
    .orderBy(asc(revisionAssets.sortOrder));

  return { link, project, revision, membership };
}

export async function recordShareView(linkId: string, projectId: string, workspaceId: string) {
  const project = (
    await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  )[0];
  if (!project) return;

  await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      lastViewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shareLinks.id, linkId));

  if (project.status === "SENT") {
    await db
      .update(projects)
      .set({ status: "VIEWED", updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  await writeAuditEvent({
    workspaceId,
    projectId,
    actorType: "system",
    action: "share.viewed",
    targetType: "share_link",
    targetId: linkId,
  });
}

export async function upsertReviewer(input: {
  workspaceId: string;
  projectId: string;
  name: string;
  email: string;
}) {
  const email = input.email.trim().toLowerCase().slice(0, 320);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Your name is required.");
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");

  const existing = (
    await db
      .select()
      .from(reviewers)
      .where(and(eq(reviewers.projectId, input.projectId), eq(reviewers.email, email)))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.name !== name) {
      await db
        .update(reviewers)
        .set({ name, updatedAt: new Date() })
        .where(eq(reviewers.id, existing.id));
    }
    return { ...existing, name };
  }

  const [created] = await db
    .insert(reviewers)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      email,
      name,
    })
    .returning();
  return created;
}

export async function createPublicComment(input: {
  workspaceId: string;
  projectId: string;
  revisionId: string;
  revisionAssetId: string;
  reviewerId: string;
  xPercent: number;
  yPercent: number;
  body: string;
  notifyTo?: string | null;
  projectName?: string;
  clientName?: string;
  reviewerName?: string;
}) {
  const project = (
    await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
  )[0];
  if (!project || project.currentPublishedRevisionId !== input.revisionId) {
    throw new Error("Comments are only accepted on the current published revision.");
  }
  if (project.status === "APPROVED" || project.status === "ARCHIVED") {
    throw new Error("Comments are locked after approval.");
  }

  const body = sanitizeCommentBody(input.body);
  if (!body) throw new Error("Comment text is required.");

  const member = (
    await db
      .select()
      .from(revisionAssets)
      .where(
        and(
          eq(revisionAssets.id, input.revisionAssetId),
          eq(revisionAssets.revisionId, input.revisionId),
        ),
      )
      .limit(1)
  )[0];
  if (!member) throw new Error("That review item was not found.");

  const [comment] = await db
    .insert(roomComments)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      revisionId: input.revisionId,
      revisionAssetId: input.revisionAssetId,
      reviewerId: input.reviewerId,
      xPercent: String(clampPercent(input.xPercent)),
      yPercent: String(clampPercent(input.yPercent)),
      body,
      status: "OPEN",
    })
    .returning();

  await writeAuditEvent({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorType: "reviewer",
    actorId: input.reviewerId,
    action: "comment.created",
    targetType: "comment",
    targetId: comment.id,
  });

  if (input.notifyTo) {
    await enqueueOutbox({
      type: "email.comment",
      payload: {
        to: input.notifyTo,
        projectName: input.projectName || "project",
        clientName: input.clientName,
        reviewerName: input.reviewerName,
        body,
        ownerUrl: `${getSiteUrl()}/rooms/${input.projectId}`,
        roomUrl: `${getSiteUrl()}/rooms/${input.projectId}`,
      },
      idempotencyKey: `email.comment:${comment.id}`,
    });
  }

  return comment;
}

export async function updatePublicComment(input: {
  workspaceId: string;
  projectId: string;
  revisionId: string;
  commentId: string;
  reviewerId: string;
  body: string;
}) {
  const project = (
    await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
  )[0];
  if (!project || project.currentPublishedRevisionId !== input.revisionId) {
    throw new Error("Comments can only be edited on the current published revision.");
  }
  if (project.status === "APPROVED" || project.status === "ARCHIVED") {
    throw new Error("Comments are locked after approval.");
  }

  const body = sanitizeCommentBody(input.body);
  if (!body) throw new Error("Comment text is required.");

  const comment = (
    await db
      .select()
      .from(roomComments)
      .where(
        and(
          eq(roomComments.id, input.commentId),
          eq(roomComments.workspaceId, input.workspaceId),
          eq(roomComments.projectId, input.projectId),
          eq(roomComments.revisionId, input.revisionId),
        ),
      )
      .limit(1)
  )[0];
  if (!comment) throw new Error("Comment not found.");
  if (comment.reviewerId !== input.reviewerId) {
    const err = new Error("You can only edit comments you left.");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  if (comment.status !== "OPEN") {
    throw new Error("Only open comments can be edited.");
  }

  const [updated] = await db
    .update(roomComments)
    .set({ body, updatedAt: new Date() })
    .where(eq(roomComments.id, input.commentId))
    .returning();

  await writeAuditEvent({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorType: "reviewer",
    actorId: input.reviewerId,
    action: "comment.updated",
    targetType: "comment",
    targetId: input.commentId,
  });

  return updated;
}

export async function resolveComment(scope: WorkspaceScope, commentId: string, status: "RESOLVED" | "WONT_FIX" | "OPEN") {
  const comment = (
    await db
      .select()
      .from(roomComments)
      .where(and(eq(roomComments.id, commentId), eq(roomComments.workspaceId, scope.workspaceId)))
      .limit(1)
  )[0];
  if (!comment) throw new Error("Comment not found.");

  const [updated] = await db
    .update(roomComments)
    .set({
      status,
      resolvedAt: status === "OPEN" ? null : new Date(),
      resolvedByUserId: status === "OPEN" ? null : scope.userId,
      updatedAt: new Date(),
    })
    .where(eq(roomComments.id, commentId))
    .returning();

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    projectId: comment.projectId,
    actorType: "user",
    actorId: scope.userId,
    action: "comment.resolved",
    targetType: "comment",
    targetId: commentId,
    metadata: { status },
  });

  return updated;
}

export async function submitPublicDecision(input: {
  workspaceId: string;
  projectId: string;
  revisionId: string;
  reviewerId: string;
  decision: "approve" | "request_changes";
  acceptanceStatement?: string;
  notifyTo?: string | null;
  reviewerEmail?: string | null;
  reviewerName?: string | null;
}) {
  const project = await getRoomOrThrow(input.workspaceId, input.projectId);
  if (project.currentPublishedRevisionId !== input.revisionId) {
    throw new Error("Only the current published revision can receive a decision.");
  }

  const revision = (
    await db.select().from(revisions).where(eq(revisions.id, input.revisionId)).limit(1)
  )[0];
  if (!revision || revision.status !== "PUBLISHED") {
    throw new Error("This revision is not open for decisions.");
  }

  const ownerNotify =
    input.notifyTo || (await getWorkspaceNotificationEmail(input.workspaceId));
  const ownerUrl = `${getSiteUrl()}/rooms/${input.projectId}`;
  const clientName = input.reviewerName || project.clientName || "A client";

  if (input.decision === "request_changes") {
    return db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({ status: "CHANGES_REQUESTED", updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));

      const [approval] = await tx
        .insert(approvals)
        .values({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          revisionId: input.revisionId,
          reviewerId: input.reviewerId,
          acceptanceStatement: "Changes requested",
          contentDigest: revision.contentDigest || "",
          decision: "changes_requested",
        })
        .returning();

      await writeAuditEvent(
        {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          actorType: "reviewer",
          actorId: input.reviewerId,
          action: "revision.changes_requested",
          targetType: "revision",
          targetId: input.revisionId,
        },
        tx as unknown as typeof db,
      );

      if (ownerNotify) {
        await enqueueOutbox(
          {
            type: "email.changes_requested",
            payload: {
              to: ownerNotify,
              projectName: project.name,
              clientName,
              ownerUrl,
              roomUrl: ownerUrl,
            },
            idempotencyKey: `email.changes_requested:${approval.id}`,
          },
          tx as unknown as typeof db,
        );
      }

      return { approval, projectStatus: "CHANGES_REQUESTED" as const };
    });
  }

  const statement = (input.acceptanceStatement || DEFAULT_APPROVAL_STATEMENT).trim().slice(0, 2000);
  if (!statement) throw new Error("An acceptance statement is required.");
  if (!revision.contentDigest) throw new Error("Revision digest is missing; republish and try again.");

  const members = await db
    .select({
      assetId: revisionAssets.assetId,
      sortOrder: revisionAssets.sortOrder,
      checksum: assets.checksum,
    })
    .from(revisionAssets)
    .innerJoin(assets, eq(revisionAssets.assetId, assets.id))
    .where(eq(revisionAssets.revisionId, input.revisionId));

  const digest = computeRevisionDigest(members);
  if (digest !== revision.contentDigest) {
    throw new Error("Revision contents changed. Ask the agency to republish, then approve again.");
  }

  // Idempotent: existing approval for this revision+reviewer+digest wins.
  const existingApproval = (
    await db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.revisionId, input.revisionId),
          eq(approvals.reviewerId, input.reviewerId),
          eq(approvals.decision, "approved"),
          eq(approvals.contentDigest, digest),
        ),
      )
      .limit(1)
  )[0];
  if (existingApproval) {
    return { approval: existingApproval, projectStatus: "APPROVED" as const, idempotent: true as const };
  }

  return db.transaction(async (tx) => {
    const locked = (
      await tx
        .select()
        .from(revisions)
        .where(and(eq(revisions.id, input.revisionId), eq(revisions.status, "PUBLISHED")))
        .limit(1)
    )[0];
    if (!locked) {
      // Another concurrent approval may have just succeeded.
      const raced = (
        await tx
          .select()
          .from(approvals)
          .where(
            and(
              eq(approvals.revisionId, input.revisionId),
              eq(approvals.decision, "approved"),
              eq(approvals.contentDigest, digest),
            ),
          )
          .limit(1)
      )[0];
      if (raced) return { approval: raced, projectStatus: "APPROVED" as const, idempotent: true as const };
      throw new Error("This revision is no longer available for approval.");
    }

    await tx
      .update(revisions)
      .set({ status: "APPROVED", updatedAt: new Date() })
      .where(eq(revisions.id, input.revisionId));

    await tx
      .update(projects)
      .set({
        status: "APPROVED",
        approvedRevisionId: input.revisionId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.projectId));

    const [approval] = await tx
      .insert(approvals)
      .values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        revisionId: input.revisionId,
        reviewerId: input.reviewerId,
        acceptanceStatement: statement,
        contentDigest: digest,
        decision: "approved",
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actorType: "reviewer",
        actorId: input.reviewerId,
        action: "revision.approved",
        targetType: "approval",
        targetId: approval.id,
        metadata: { digest, revisionNumber: revision.number },
      },
      tx as unknown as typeof db,
    );

    if (ownerNotify) {
      await enqueueOutbox(
        {
          type: "email.approval",
          payload: {
            to: ownerNotify,
            projectName: project.name,
            clientName,
            contentDigest: digest,
            ownerUrl,
            roomUrl: ownerUrl,
          },
          idempotencyKey: `email.approval:${approval.id}`,
        },
        tx as unknown as typeof db,
      );
    }

    if (input.reviewerEmail) {
      await enqueueOutbox(
        {
          type: "email.receipt",
          payload: {
            to: input.reviewerEmail,
            projectName: project.name,
            contentDigest: digest,
            approvalId: approval.id,
          },
          idempotencyKey: `email.receipt:${approval.id}`,
        },
        tx as unknown as typeof db,
      );
    }

    return { approval, projectStatus: "APPROVED" as const, idempotent: false as const };
  });
}

export async function reopenRoom(scope: WorkspaceScope, projectId: string) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status !== "APPROVED" && project.status !== "CHANGES_REQUESTED") {
    throw new Error("Only approved or changes-requested rooms can be reopened into a new draft.");
  }

  return db.transaction(async (tx) => {
    if (project.approvedRevisionId) {
      await tx
        .update(approvals)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(approvals.revisionId, project.approvedRevisionId),
            eq(approvals.decision, "approved"),
          ),
        );
    }

    const latest = (
      await tx
        .select()
        .from(revisions)
        .where(eq(revisions.projectId, projectId))
        .orderBy(desc(revisions.number))
        .limit(1)
    )[0];

    const [draft] = await tx
      .insert(revisions)
      .values({
        workspaceId: scope.workspaceId,
        projectId,
        number: (latest?.number || 0) + 1,
        status: "DRAFT",
      })
      .returning();

    await tx
      .update(projects)
      .set({ status: "DRAFT", updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId,
        actorType: "user",
        actorId: scope.userId,
        action: "project.reopened",
        targetType: "revision",
        targetId: draft.id,
      },
      tx as unknown as typeof db,
    );

    return draft;
  });
}

/**
 * Any handoff mutation after release clears handoffReleasedAt (option A).
 * Clients return to “preparing” until the owner releases again.
 */
async function clearHandoffReleaseInTx(
  tx: { update: typeof db.update },
  projectId: string,
  previouslyReleased: boolean,
) {
  if (!previouslyReleased) return false;
  await tx
    .update(projects)
    .set({ handoffReleasedAt: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  return true;
}

export async function addHandoffItem(input: {
  scope: WorkspaceScope;
  projectId: string;
  label: string;
  category?: string;
  notes?: string;
  externalUrl?: string;
  assetId?: string;
}) {
  const project = await getRoomOrThrow(input.scope.workspaceId, input.projectId);
  if (project.status !== "APPROVED" && project.status !== "ARCHIVED") {
    throw new Error("Release handoff after the client approves a revision.");
  }

  const externalUrl = input.externalUrl?.trim() || null;
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
    throw new Error("Link must start with http:// or https://");
  }

  if (input.assetId) {
    const asset = (
      await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, input.assetId),
            eq(assets.projectId, input.projectId),
            eq(assets.workspaceId, input.scope.workspaceId),
          ),
        )
        .limit(1)
    )[0];
    if (!asset) throw new Error("Handoff file not found.");
  }

  const category =
    input.category ||
    (input.assetId ? "file" : externalUrl ? "link" : "note");

  const wasReleased = Boolean(project.handoffReleasedAt);

  return db.transaction(async (tx) => {
    const releaseCleared = await clearHandoffReleaseInTx(tx, input.projectId, wasReleased);

    const maxSort = (
      await tx
        .select({ value: sql<number>`coalesce(max(${handoffItems.sortOrder}), -1)` })
        .from(handoffItems)
        .where(eq(handoffItems.projectId, input.projectId))
    )[0]?.value;

    const [item] = await tx
      .insert(handoffItems)
      .values({
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        label: input.label.trim().slice(0, 200),
        category: category.slice(0, 40),
        notes: input.notes?.trim().slice(0, 4000) || null,
        externalUrl,
        assetId: input.assetId || null,
        sortOrder: (maxSort ?? -1) + 1,
        createdByUserId: input.scope.userId,
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        actorType: "user",
        actorId: input.scope.userId,
        action: "handoff.item_added",
        targetType: "handoff_item",
        targetId: item.id,
        metadata: {
          category: item.category,
          visibleToClient: false,
          releaseCleared,
        },
      },
      tx as unknown as typeof db,
    );

    if (releaseCleared) {
      await writeAuditEvent(
        {
          workspaceId: input.scope.workspaceId,
          projectId: input.projectId,
          actorType: "user",
          actorId: input.scope.userId,
          action: "handoff.release_cleared",
          targetType: "project",
          targetId: input.projectId,
          metadata: { reason: "item_added", itemId: item.id },
        },
        tx as unknown as typeof db,
      );
    }

    return { item, releaseCleared };
  });
}

/**
 * Explicitly release prepared handoff items to the client share link.
 * Idempotent when already released.
 */
export async function releaseHandoff(scope: WorkspaceScope, projectId: string) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status !== "APPROVED" && project.status !== "ARCHIVED") {
    throw new Error("Release handoff after the client approves a revision.");
  }

  if (project.handoffReleasedAt) {
    return {
      released: true as const,
      alreadyReleased: true as const,
      releasedAt: project.handoffReleasedAt,
    };
  }

  const itemCount = (
    await db
      .select({ value: sql<number>`count(*)::int` })
      .from(handoffItems)
      .where(eq(handoffItems.projectId, projectId))
  )[0]?.value;

  if (!itemCount) {
    throw new Error("Add at least one handoff item before releasing to the client.");
  }

  const releasedAt = new Date();
  await db
    .update(projects)
    .set({ handoffReleasedAt: releasedAt, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    projectId,
    actorType: "user",
    actorId: scope.userId,
    action: "handoff.released",
    targetType: "project",
    targetId: projectId,
    metadata: { itemCount },
  });

  return {
    released: true as const,
    alreadyReleased: false as const,
    releasedAt,
  };
}

export async function uploadHandoffFile(input: {
  scope: WorkspaceScope;
  projectId: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
  label?: string;
  notes?: string;
  externalUrl?: string;
}) {
  const project = await getRoomOrThrow(input.scope.workspaceId, input.projectId);
  if (project.status !== "APPROVED") {
    throw new Error(
      project.status === "ARCHIVED"
        ? "Archived rooms cannot accept new handoff files."
        : "Release handoff after the client approves a revision.",
    );
  }

  const fileName = input.fileName.trim().slice(0, 200) || "handoff.bin";
  const lowerName = fileName.toLowerCase();
  let mime = input.mime.toLowerCase() || "application/octet-stream";
  if (mime === "application/octet-stream") {
    if (lowerName.endsWith(".pdf")) mime = "application/pdf";
    else if (lowerName.endsWith(".zip")) mime = "application/zip";
    else if (lowerName.endsWith(".png")) mime = "image/png";
    else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mime = "image/jpeg";
    else if (lowerName.endsWith(".webp")) mime = "image/webp";
    else if (lowerName.endsWith(".gif")) mime = "image/gif";
  }
  if (!(ALLOWED_HANDOFF_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error("Handoff uploads support images, PDFs, and ZIP files.");
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be 25 MB or smaller.");
  }

  await assertCanMutate(input.scope.organizationId);
  await assertStorageAllowance(
    input.scope.organizationId,
    input.scope.workspaceId,
    input.bytes.byteLength,
  );

  const objectKey = buildHandoffObjectPath({
    workspaceId: input.scope.workspaceId,
    projectId: input.projectId,
    filename: fileName,
  });
  const stored = await writeAssetBytes(objectKey, input.bytes, mime);
  const checksum = checksumSha256(input.bytes);
  const storage = getStorageAdapter();
  const label =
    (input.label?.trim() || fileName.replace(/\.[^.]+$/, "") || "Delivery file").slice(0, 200);

  const [asset] = await db
    .insert(assets)
    .values({
      workspaceId: input.scope.workspaceId,
      projectId: input.projectId,
      kind: mime === "application/pdf" ? "pdf" : mime.includes("zip") ? "file" : "image",
      label,
      objectKey: stored.pathname,
      blobUrl: stored.url ?? null,
      storageProvider: storage.provider,
      uploadStatus: "ready",
      mime,
      bytes: input.bytes.byteLength,
      checksum,
      uploadedByUserId: input.scope.userId,
    })
    .returning();

  try {
    const { item, releaseCleared } = await addHandoffItem({
      scope: input.scope,
      projectId: input.projectId,
      label,
      category: "file",
      notes: input.notes,
      externalUrl: input.externalUrl,
      assetId: asset.id,
    });
    return { item, asset, releaseCleared };
  } catch (error) {
    await deleteAssetBytes(stored.url || stored.pathname).catch(() => undefined);
    throw error;
  }
}

/**
 * Finalize a direct-to-Blob handoff upload after the client PUT succeeds.
 * Creates the asset + handoff item; clears release when mutating a released handoff.
 */
export async function completeHandoffDirectUpload(input: {
  scope: WorkspaceScope;
  projectId: string;
  pathname: string;
  blobUrl: string;
  contentType: string;
  size: number;
  fileName: string;
  uploadSessionId: string;
  label?: string;
  notes?: string;
  externalUrl?: string;
}) {
  const project = await getRoomOrThrow(input.scope.workspaceId, input.projectId);
  if (project.status !== "APPROVED") {
    throw new Error(
      project.status === "ARCHIVED"
        ? "Archived rooms cannot accept new handoff files."
        : "Release handoff after the client approves a revision.",
    );
  }

  const expectedPrefix = `workspaces/${input.scope.workspaceId}/rooms/${input.projectId}/handoff/`;
  if (!input.pathname.startsWith(expectedPrefix) || input.pathname.includes("..")) {
    throw new Error("Upload path is not owned by this room.");
  }
  if (input.uploadSessionId !== input.pathname) {
    throw new Error("Upload session mismatch.");
  }

  let mime = input.contentType.toLowerCase() || "application/octet-stream";
  const lowerName = input.fileName.toLowerCase();
  if (mime === "application/octet-stream") {
    if (lowerName.endsWith(".pdf")) mime = "application/pdf";
    else if (lowerName.endsWith(".zip")) mime = "application/zip";
    else if (lowerName.endsWith(".png")) mime = "image/png";
    else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mime = "image/jpeg";
    else if (lowerName.endsWith(".webp")) mime = "image/webp";
    else if (lowerName.endsWith(".gif")) mime = "image/gif";
  }
  if (!(ALLOWED_HANDOFF_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error("Handoff uploads support images, PDFs, and ZIP files.");
  }
  if (input.size <= 0 || input.size > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be between 1 byte and 25 MB.");
  }

  await assertCanMutate(input.scope.organizationId);
  await assertStorageAllowance(input.scope.organizationId, input.scope.workspaceId, input.size);

  const existing = (
    await db
      .select()
      .from(assets)
      .where(eq(assets.uploadSessionId, input.uploadSessionId))
      .limit(1)
  )[0];
  if (existing) {
    const existingItem = (
      await db
        .select()
        .from(handoffItems)
        .where(and(eq(handoffItems.assetId, existing.id), eq(handoffItems.projectId, input.projectId)))
        .limit(1)
    )[0];
    return {
      asset: existing,
      item: existingItem ?? null,
      releaseCleared: false,
      idempotent: true as const,
    };
  }

  const fileName = input.fileName.trim().slice(0, 200) || "handoff.bin";
  const label =
    (input.label?.trim() || fileName.replace(/\.[^.]+$/, "") || "Delivery file").slice(0, 200);
  const storage = getStorageAdapter();

  let asset: typeof assets.$inferSelect;
  try {
    const [created] = await db
      .insert(assets)
      .values({
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        kind: mime === "application/pdf" ? "pdf" : mime.includes("zip") ? "file" : "image",
        label,
        objectKey: input.pathname,
        blobUrl: input.blobUrl || null,
        storageProvider: storage.provider,
        uploadStatus: "ready",
        uploadSessionId: input.uploadSessionId,
        mime,
        bytes: input.size,
        uploadedByUserId: input.scope.userId,
      })
      .returning();
    asset = created;
  } catch (error) {
    await deleteAssetBytes(input.blobUrl || input.pathname).catch(() => undefined);
    throw error;
  }

  try {
    const { item, releaseCleared } = await addHandoffItem({
      scope: input.scope,
      projectId: input.projectId,
      label,
      category: "file",
      notes: input.notes,
      externalUrl: input.externalUrl,
      assetId: asset.id,
    });
    return { asset, item, releaseCleared, idempotent: false as const };
  } catch (error) {
    await db.delete(assets).where(eq(assets.id, asset.id)).catch(() => undefined);
    await deleteAssetBytes(input.blobUrl || input.pathname).catch(() => undefined);
    throw error;
  }
}

export async function deleteHandoffItem(scope: WorkspaceScope, projectId: string, itemId: string) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot change handoff.");
  }

  const wasReleased = Boolean(project.handoffReleasedAt);

  return db.transaction(async (tx) => {
    const item = (
      await tx
        .select()
        .from(handoffItems)
        .where(
          and(
            eq(handoffItems.id, itemId),
            eq(handoffItems.projectId, projectId),
            eq(handoffItems.workspaceId, scope.workspaceId),
          ),
        )
        .limit(1)
    )[0];
    if (!item) throw new Error("Handoff item not found.");

    const releaseCleared = await clearHandoffReleaseInTx(tx, projectId, wasReleased);
    await tx.delete(handoffItems).where(eq(handoffItems.id, itemId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId,
        actorType: "user",
        actorId: scope.userId,
        action: "handoff.item_deleted",
        targetType: "handoff_item",
        targetId: itemId,
        metadata: { releaseCleared },
      },
      tx as unknown as typeof db,
    );

    if (releaseCleared) {
      await writeAuditEvent(
        {
          workspaceId: scope.workspaceId,
          projectId,
          actorType: "user",
          actorId: scope.userId,
          action: "handoff.release_cleared",
          targetType: "project",
          targetId: projectId,
          metadata: { reason: "item_deleted", itemId },
        },
        tx as unknown as typeof db,
      );
    }

    return { ok: true as const, releaseCleared };
  });
}

export async function archiveRoom(scope: WorkspaceScope, projectId: string) {
  await getRoomOrThrow(scope.workspaceId, projectId);
  await db
    .update(projects)
    .set({ status: "ARCHIVED", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    projectId,
    actorType: "user",
    actorId: scope.userId,
    action: "project.archived",
    targetType: "project",
    targetId: projectId,
  });
}

/** Rename an approval room (project name and/or client name). Slug stays stable. */
export async function updateRoom(
  scope: WorkspaceScope,
  projectId: string,
  input: { name: string; clientName: string },
) {
  const name = input.name.trim().slice(0, 120);
  const clientName = input.clientName.trim().slice(0, 120);
  if (!name) throw new Error("A project name is required.");
  if (!clientName) throw new Error("A client name is required.");

  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot be edited.");
  }

  await assertCanMutate(scope.organizationId);

  const [updated] = await db
    .update(projects)
    .set({ name, clientName, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    projectId,
    actorType: "user",
    actorId: scope.userId,
    action: "project.renamed",
    targetType: "project",
    targetId: projectId,
    metadata: {
      name,
      clientName,
      previousName: project.name,
      previousClientName: project.clientName,
    },
  });

  return updated;
}

/**
 * Permanently delete a room. Clears RESTRICT FK rows (revision_assets → assets,
 * approvals → revisions/reviewers) before cascading the project delete.
 */
export async function deleteRoom(scope: WorkspaceScope, projectId: string) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);

  const assetRows = await db
    .select({
      id: assets.id,
      objectKey: assets.objectKey,
      blobUrl: assets.blobUrl,
    })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.workspaceId, scope.workspaceId)));

  const revisionRows = await db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.workspaceId, scope.workspaceId)));
  const revisionIds = revisionRows.map((row) => row.id);

  await db.transaction(async (tx) => {
    if (revisionIds.length > 0) {
      await tx.delete(revisionAssets).where(inArray(revisionAssets.revisionId, revisionIds));
    }
    await tx.delete(approvals).where(eq(approvals.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, project.id));
  });

  for (const asset of assetRows) {
    if (!asset.objectKey) continue;
    await db.insert(blobDeletionJobs).values({
      workspaceId: scope.workspaceId,
      objectKey: asset.objectKey,
      blobUrl: asset.blobUrl ?? null,
      reason: "room_deleted",
    });
  }

  try {
    await processBlobDeletionBatch(Math.max(25, assetRows.length));
  } catch (error) {
    logWarn("blob_deletion.flush_failed", {
      projectId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return { deleted: true as const, id: project.id };
}

export async function getAssetForAccess(assetId: string) {
  return (await db.select().from(assets).where(eq(assets.id, assetId)).limit(1))[0] || null;
}

export async function deleteRoomAssetFile(objectKey: string | null | undefined) {
  if (objectKey) await deleteAssetBytes(objectKey);
}

/** Remove an asset from the current draft only (not from published revisions). */
export async function removeDraftRevisionAsset(
  scope: WorkspaceScope,
  projectId: string,
  revisionAssetId: string,
) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot be edited.");
  }

  const row = (
    await db
      .select({
        revisionAssetId: revisionAssets.id,
        assetId: revisionAssets.assetId,
        revisionId: revisionAssets.revisionId,
        revisionStatus: revisions.status,
        objectKey: assets.objectKey,
        blobUrl: assets.blobUrl,
      })
      .from(revisionAssets)
      .innerJoin(revisions, eq(revisionAssets.revisionId, revisions.id))
      .innerJoin(assets, eq(revisionAssets.assetId, assets.id))
      .where(
        and(
          eq(revisionAssets.id, revisionAssetId),
          eq(revisions.projectId, projectId),
          eq(revisions.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1)
  )[0];

  if (!row) throw new Error("Asset not found in this room.");
  if (row.revisionStatus !== "DRAFT") {
    throw new Error("Only unpublished draft assets can be removed. Start a new revision to change published work.");
  }

  let objectKeyToDelete: string | null = null;
  let blobUrlToDelete: string | null = null;

  await db.transaction(async (tx) => {
    await tx.delete(revisionAssets).where(eq(revisionAssets.id, row.revisionAssetId));

    const stillLinked = (
      await tx
        .select({ id: revisionAssets.id })
        .from(revisionAssets)
        .where(eq(revisionAssets.assetId, row.assetId))
        .limit(1)
    )[0];

    if (!stillLinked) {
      await tx.delete(assets).where(eq(assets.id, row.assetId));
      objectKeyToDelete = row.objectKey;
      blobUrlToDelete = row.blobUrl;
    }

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId,
        actorType: "user",
        actorId: scope.userId,
        action: "asset.removed",
        targetType: "asset",
        targetId: row.assetId,
        metadata: { revisionAssetId: row.revisionAssetId, revisionId: row.revisionId },
      },
      tx as unknown as typeof db,
    );
  });

  if (objectKeyToDelete) {
    await queueBlobDeletion({
      workspaceId: scope.workspaceId,
      objectKey: objectKeyToDelete,
      blobUrl: blobUrlToDelete,
      reason: "draft_asset_removed",
    });
  }

  return { deleted: true as const };
}

/** Rename an asset that belongs to the current draft revision. */
export async function renameDraftRevisionAsset(
  scope: WorkspaceScope,
  projectId: string,
  revisionAssetId: string,
  label: string,
) {
  const trimmed = label.trim().slice(0, 200);
  if (!trimmed) throw new Error("Name is required.");

  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot be edited.");
  }

  const row = (
    await db
      .select({
        assetId: revisionAssets.assetId,
        revisionStatus: revisions.status,
      })
      .from(revisionAssets)
      .innerJoin(revisions, eq(revisionAssets.revisionId, revisions.id))
      .where(
        and(
          eq(revisionAssets.id, revisionAssetId),
          eq(revisions.projectId, projectId),
          eq(revisions.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1)
  )[0];

  if (!row) throw new Error("Asset not found in this room.");
  if (row.revisionStatus !== "DRAFT") {
    throw new Error("Only unpublished draft assets can be renamed. Start a new revision to change published work.");
  }

  await db
    .update(assets)
    .set({ label: trimmed, updatedAt: new Date() })
    .where(eq(assets.id, row.assetId));

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    projectId,
    actorType: "user",
    actorId: scope.userId,
    action: "asset.renamed",
    targetType: "asset",
    targetId: row.assetId,
    metadata: { label: trimmed, revisionAssetId },
  });

  return { label: trimmed };
}

/** Reorder assets on the current draft revision. `orderedIds` must be the full set of draft revisionAsset ids. */
export async function reorderDraftRevisionAssets(
  scope: WorkspaceScope,
  projectId: string,
  orderedIds: string[],
) {
  const project = await getRoomOrThrow(scope.workspaceId, projectId);
  if (project.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot be edited.");
  }

  const draft = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.projectId, projectId),
          eq(revisions.workspaceId, scope.workspaceId),
          eq(revisions.status, "DRAFT"),
        ),
      )
      .limit(1)
  )[0];
  if (!draft) throw new Error("No draft revision to reorder. Publish creates a fixed order.");

  const existing = await db
    .select({ id: revisionAssets.id })
    .from(revisionAssets)
    .where(eq(revisionAssets.revisionId, draft.id));

  const existingIds = new Set(existing.map((r) => r.id));
  if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
    throw new Error("Reorder list must include every draft asset exactly once.");
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(revisionAssets)
        .set({ sortOrder: i })
        .where(eq(revisionAssets.id, orderedIds[i]!));
    }
    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        projectId,
        actorType: "user",
        actorId: scope.userId,
        action: "assets.reordered",
        targetType: "revision",
        targetId: draft.id,
        metadata: { count: orderedIds.length },
      },
      tx as unknown as typeof db,
    );
  });

  return { ok: true as const };
}

export async function listPublishedComments(revisionId: string) {
  return db
    .select()
    .from(roomComments)
    .where(and(eq(roomComments.revisionId, revisionId), ne(roomComments.status, "WONT_FIX")))
    .orderBy(asc(roomComments.createdAt));
}

/** Safe handoff fields for the public client share page (only when released). */
export async function listReleasedHandoffItems(projectId: string) {
  const project = (
    await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  )[0];
  if (!project?.handoffReleasedAt) return [];

  return db
    .select({
      id: handoffItems.id,
      label: handoffItems.label,
      category: handoffItems.category,
      notes: handoffItems.notes,
      externalUrl: handoffItems.externalUrl,
      assetId: handoffItems.assetId,
    })
    .from(handoffItems)
    .where(eq(handoffItems.projectId, projectId))
    .orderBy(asc(handoffItems.sortOrder));
}

export async function revokeShareLink(scope: WorkspaceScope, projectId: string, shareLinkId?: string) {
  await getRoomOrThrow(scope.workspaceId, projectId);
  const where = shareLinkId
    ? and(
        eq(shareLinks.id, shareLinkId),
        eq(shareLinks.projectId, projectId),
        eq(shareLinks.workspaceId, scope.workspaceId),
      )
    : and(
        eq(shareLinks.projectId, projectId),
        eq(shareLinks.workspaceId, scope.workspaceId),
        eq(shareLinks.status, "ACTIVE"),
      );

  await db
    .update(shareLinks)
    .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
    .where(where);

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    projectId,
    actorType: "user",
    actorId: scope.userId,
    action: "share_link.revoked",
    targetType: "share_link",
    targetId: shareLinkId || "all-active",
  });

  return { revoked: true as const };
}

export async function queueBlobDeletion(input: {
  workspaceId: string;
  objectKey: string;
  blobUrl?: string | null;
  reason: string;
}) {
  await db.insert(blobDeletionJobs).values({
    workspaceId: input.workspaceId,
    objectKey: input.objectKey,
    blobUrl: input.blobUrl ?? null,
    reason: input.reason,
  });

  // Best-effort flush so Blob cleanup does not wait solely on the cron worker
  // (important on localhost where /api/internal/outbox never runs).
  try {
    await processBlobDeletionBatch(10);
  } catch (error) {
    logWarn("blob_deletion.flush_failed", {
      objectKey: input.objectKey,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Idempotent completion for direct client → Vercel Blob uploads.
 * Creates the asset + revision membership only after Blob confirms the object.
 */
export async function completeDirectUpload(input: {
  scope: WorkspaceScope;
  projectId: string;
  revisionId: string;
  uploadSessionId: string;
  pathname: string;
  blobUrl: string;
  contentType: string;
  size: number;
  label: string;
  width?: number | null;
  height?: number | null;
}) {
  await assertCanMutate(input.scope.organizationId);
  await getRoomOrThrow(input.scope.workspaceId, input.projectId);

  const existing = (
    await db
      .select()
      .from(assets)
      .where(eq(assets.uploadSessionId, input.uploadSessionId))
      .limit(1)
  )[0];
  if (existing && existing.uploadStatus === "ready") {
    const member = (
      await db
        .select()
        .from(revisionAssets)
        .where(eq(revisionAssets.assetId, existing.id))
        .limit(1)
    )[0];
    return { asset: existing, revisionAssetId: member?.id, revisionId: input.revisionId, idempotent: true as const };
  }

  const mime = input.contentType.toLowerCase();
  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error("Only images and PDFs are supported.");
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be 25 MB or smaller.");
  }

  await assertStorageAllowance(input.scope.organizationId, input.scope.workspaceId, input.size);

  const draft = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.id, input.revisionId),
          eq(revisions.projectId, input.projectId),
          eq(revisions.workspaceId, input.scope.workspaceId),
          eq(revisions.status, "DRAFT"),
        ),
      )
      .limit(1)
  )[0];
  if (!draft) throw new Error("Draft revision not found.");

  const kind = mime === "application/pdf" ? "pdf" : "image";
  const storage = getStorageAdapter();

  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        kind,
        label: input.label.slice(0, 200) || "Untitled",
        objectKey: input.pathname,
        blobUrl: input.blobUrl,
        storageProvider: storage.provider,
        uploadStatus: "ready",
        uploadSessionId: input.uploadSessionId,
        revisionId: draft.id,
        mime,
        bytes: input.size,
        width: input.width ?? null,
        height: input.height ?? null,
        uploadedByUserId: input.scope.userId,
      })
      .onConflictDoNothing()
      .returning();

    const resolved =
      asset ||
      (
        await tx
          .select()
          .from(assets)
          .where(eq(assets.uploadSessionId, input.uploadSessionId))
          .limit(1)
      )[0];

    if (!resolved) throw new Error("Unable to record uploaded asset.");

    const existingMember = (
      await tx
        .select()
        .from(revisionAssets)
        .where(and(eq(revisionAssets.revisionId, draft.id), eq(revisionAssets.assetId, resolved.id)))
        .limit(1)
    )[0];

    if (existingMember) {
      return {
        asset: resolved,
        revisionAssetId: existingMember.id,
        revisionId: draft.id,
        idempotent: true as const,
      };
    }

    const maxSort = (
      await tx
        .select({ value: sql<number>`coalesce(max(${revisionAssets.sortOrder}), -1)` })
        .from(revisionAssets)
        .where(eq(revisionAssets.revisionId, draft.id))
    )[0]?.value;

    const [member] = await tx
      .insert(revisionAssets)
      .values({
        revisionId: draft.id,
        assetId: resolved.id,
        sortOrder: (maxSort ?? -1) + 1,
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        actorType: "user",
        actorId: input.scope.userId,
        action: "asset.uploaded",
        targetType: "asset",
        targetId: resolved.id,
        metadata: { direct: true },
      },
      tx as unknown as typeof db,
    );

    return {
      asset: resolved,
      revisionAssetId: member.id,
      revisionId: draft.id,
      idempotent: false as const,
    };
  });
}

export async function processBlobDeletionBatch(limit = 25) {
  const now = new Date();
  const pending = await db
    .select()
    .from(blobDeletionJobs)
    .where(and(isNull(blobDeletionJobs.processedAt), lte(blobDeletionJobs.availableAt, now)))
    .orderBy(asc(blobDeletionJobs.availableAt))
    .limit(limit);

  let processed = 0;
  for (const job of pending) {
    try {
      // Never delete if any ready asset still references this key.
      const stillReferenced = (
        await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.objectKey, job.objectKey), eq(assets.uploadStatus, "ready")))
          .limit(1)
      )[0];
      if (stillReferenced) {
        await db
          .update(blobDeletionJobs)
          .set({
            processedAt: new Date(),
            lastError: "skipped:still_referenced",
          })
          .where(eq(blobDeletionJobs.id, job.id));
        continue;
      }

      await deleteAssetBytes(job.blobUrl || job.objectKey);
      await db
        .update(blobDeletionJobs)
        .set({ processedAt: new Date(), lastError: null, attempts: job.attempts + 1 })
        .where(eq(blobDeletionJobs.id, job.id));
      processed += 1;
    } catch (error) {
      await db
        .update(blobDeletionJobs)
        .set({
          attempts: job.attempts + 1,
          lastError: error instanceof Error ? error.message : "delete failed",
          availableAt: new Date(Date.now() + Math.min(60_000 * 2 ** job.attempts, 3_600_000)),
        })
        .where(eq(blobDeletionJobs.id, job.id));
    }
  }
  return { scanned: pending.length, processed };
}

/** Mark abandoned pending uploads older than threshold for cleanup. */
export async function markOrphanedUploads(olderThanMs = 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const orphans = await db
    .select()
    .from(assets)
    .where(and(eq(assets.uploadStatus, "pending"), lte(assets.createdAt, cutoff)));

  for (const orphan of orphans) {
    await db
      .update(assets)
      .set({ uploadStatus: "orphaned", updatedAt: new Date() })
      .where(eq(assets.id, orphan.id));
    if (orphan.objectKey) {
      await queueBlobDeletion({
        workspaceId: orphan.workspaceId,
        objectKey: orphan.objectKey,
        blobUrl: orphan.blobUrl,
        reason: "abandoned_upload",
      });
    }
  }
  return { orphaned: orphans.length };
}
