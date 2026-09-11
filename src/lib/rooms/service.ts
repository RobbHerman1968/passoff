import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  approvals,
  assets,
  blobDeletionJobs,
  clientProjects,
  designVersionExplanations,
  figmaExplanations,
  handoffItems,
  projectDesigns,
  projectDesignVersions,
  reviewers,
  revisionAssets,
  revisionDesignVersions,
  revisions,
  roomComments,
  rooms,
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
  verifyPrivateBlobObject,
  writeAssetBytes,
} from "@/lib/rooms/storage";
import {
  serializeApprovalReceipt,
  type ApprovalReceiptDesignVersion,
  type ApprovalReceiptSource,
  type ApprovalReceiptView,
} from "@/lib/rooms/approval-receipt";
import { DEFAULT_APPROVAL_STATEMENT } from "@/lib/rooms/types";
import { getSiteUrl } from "@/lib/site";
import { designVersionPreviewPublicUrl } from "@/lib/figma/preview-storage";
import {
  isVideoDesignVersionPayload,
  parseAnyProjectDesignVersion,
} from "@/lib/projects/design-version";
import {
  allocateUniqueRoomSlug,
  type WorkspaceScope,
} from "@/lib/tenant/scope";

const ACTIVE_ROOM_STATUSES = ["DRAFT", "SENT", "VIEWED", "CHANGES_REQUESTED", "APPROVED"] as const;

type DesignDisplayMeta = {
  designName?: string;
  selectedScreenIds?: string[];
};

function parseDesignDisplayMeta(value: string): DesignDisplayMeta {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    return {
      designName: typeof record.designName === "string" ? record.designName : undefined,
      selectedScreenIds: Array.isArray(record.selectedScreenIds)
        ? record.selectedScreenIds.filter((id): id is string => typeof id === "string")
        : undefined,
    };
  } catch {
    return {};
  }
}

export async function countActiveRooms(workspaceId: string) {
  const rows = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(
      and(
        eq(rooms.workspaceId, workspaceId),
        inArray(rooms.status, [...ACTIVE_ROOM_STATUSES]),
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
  if (!name) throw new Error("A room name is required.");
  if (!clientName) throw new Error("A client name is required.");

  await assertCanMutate(scope.organizationId);
  const activeCount = await countActiveRooms(scope.workspaceId);
  await assertCanCreateRoom(scope.organizationId, activeCount);

  const slug = await allocateUniqueRoomSlug(scope.workspaceId, name);

  return db.transaction(async (tx) => {
    const [clientProject] = await tx
      .insert(clientProjects)
      .values({
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        name,
        clientName,
        slug,
        status: "ACTIVE",
      })
      .returning();

    const [room] = await tx
      .insert(rooms)
      .values({
        id: clientProject.id,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        clientProjectId: clientProject.id,
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
        roomId: room.id,
        number: 1,
        status: "DRAFT",
      })
      .returning();

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId: room.id,
        actorType: "user",
        actorId: scope.userId,
        action: "project.created",
        targetType: "project",
        targetId: room.id,
        metadata: { revisionId: revision.id, clientProjectId: clientProject.id },
      },
      tx as unknown as typeof db,
    );

    return { project: room, revision };
  });
}

/** Create an additional approval room inside an existing durable client project. */
export async function createRoomInProject(
  scope: WorkspaceScope,
  clientProjectId: string,
  input: { name: string },
) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("A room name is required.");

  await assertCanMutate(scope.organizationId);
  const activeCount = await countActiveRooms(scope.workspaceId);
  await assertCanCreateRoom(scope.organizationId, activeCount);

  const clientProject = (
    await db
      .select()
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, clientProjectId),
          eq(clientProjects.organizationId, scope.organizationId),
          eq(clientProjects.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!clientProject) throw new Error("Project not found.");

  const slug = await allocateUniqueRoomSlug(scope.workspaceId, name);
  return db.transaction(async (tx) => {
    const [room] = await tx
      .insert(rooms)
      .values({
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        clientProjectId: clientProject.id,
        name,
        clientName: clientProject.clientName,
        slug,
        status: "DRAFT",
      })
      .returning();
    const [revision] = await tx
      .insert(revisions)
      .values({
        workspaceId: scope.workspaceId,
        roomId: room.id,
        number: 1,
        status: "DRAFT",
      })
      .returning();
    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId: room.id,
        actorType: "user",
        actorId: scope.userId,
        action: "room.created",
        targetType: "room",
        targetId: room.id,
        metadata: { revisionId: revision.id, clientProjectId: clientProject.id },
      },
      tx as unknown as typeof db,
    );
    return { project: room, revision };
  });
}

export async function listRooms(workspaceId: string) {
  return db
    .select({
      id: rooms.id,
      name: rooms.name,
      clientName: rooms.clientName,
      slug: rooms.slug,
      status: rooms.status,
      createdAt: rooms.createdAt,
      updatedAt: rooms.updatedAt,
      currentPublishedRevisionId: rooms.currentPublishedRevisionId,
      approvedRevisionId: rooms.approvedRevisionId,
      handoffReleasedAt: rooms.handoffReleasedAt,
    })
    .from(rooms)
    .where(eq(rooms.workspaceId, workspaceId))
    .orderBy(desc(rooms.updatedAt));
}

export async function getRoomOrThrow(workspaceId: string, roomId: string) {
  const room = (
    await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.workspaceId, workspaceId)))
      .limit(1)
  )[0];
  if (!room) throw new Error("Room not found.");
  return room;
}

export async function listRevisionDesignVersions(roomRevisionId: string) {
  const rows = await db
    .select({
      membership: revisionDesignVersions,
      version: projectDesignVersions,
      design: projectDesigns,
    })
    .from(revisionDesignVersions)
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
    .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
    .where(eq(revisionDesignVersions.roomRevisionId, roomRevisionId))
    .orderBy(asc(revisionDesignVersions.sortOrder));
  return rows.map(({ membership, version, design }) => {
    const payload = parseAnyProjectDesignVersion(version.payloadJson);
    const isVideo = isVideoDesignVersionPayload(payload);
    const displayMeta = parseDesignDisplayMeta(membership.displayMetaJson);
    const selectedScreenIds = new Set(displayMeta.selectedScreenIds ?? []);
    const screens = isVideo
      ? []
      : payload.screens
          .filter((screen) => selectedScreenIds.size === 0 || selectedScreenIds.has(screen.id))
          .map((screen) => ({
            id: screen.id,
            name: screen.name,
            width: screen.width,
            height: screen.height,
            imageUrl: screen.preview
              ? designVersionPreviewPublicUrl(version.id, screen.id, design.projectId)
              : null,
          }));
    return {
      id: membership.id,
      sortOrder: membership.sortOrder,
      displayMeta,
      designId: design.id,
      designName: design.name,
      designVersionId: version.id,
      versionNumber: version.versionNumber,
      contentSha256: version.contentSha256,
      sourceType: isVideo ? "video" as const : "figma" as const,
      newerVersionAvailable: design.currentVersionId !== version.id,
      video: isVideo ? payload.video : null,
      screens,
    };
  });
}

export type PublicDesignerNote = {
  id: string;
  revisionDesignVersionId: string;
  targetType: "design_screen" | "video";
  screenId: string | null;
  videoTimeMs: number | null;
  category: string;
  title: string;
  body: string;
  authorDisplayName: string;
  figmaNodeName: string | null;
  x: number | null;
  y: number | null;
  selectionWidth: number | null;
  selectionHeight: number | null;
};

export async function listPublishedDesignerNotes(
  room: typeof rooms.$inferSelect,
  designMembership: Awaited<ReturnType<typeof listRevisionDesignVersions>>,
): Promise<PublicDesignerNote[]> {
  if (!room.clientProjectId || designMembership.length === 0) return [];
  const versionIds = designMembership.map((item) => item.designVersionId);
  const pinsByVersion = new Map(
    designMembership.map((item) => [item.designVersionId, item]),
  );
  const rows = await db
    .select()
    .from(figmaExplanations)
    .where(and(
      eq(figmaExplanations.organizationId, room.organizationId),
      eq(figmaExplanations.workspaceId, room.workspaceId),
      eq(figmaExplanations.projectId, room.clientProjectId),
      eq(figmaExplanations.status, "published"),
      inArray(figmaExplanations.designVersionId, versionIds),
    ))
    .orderBy(asc(figmaExplanations.createdAt));
  const videoRows = await db
    .select()
    .from(designVersionExplanations)
    .where(and(
      eq(designVersionExplanations.organizationId, room.organizationId),
      eq(designVersionExplanations.workspaceId, room.workspaceId),
      eq(designVersionExplanations.projectId, room.clientProjectId),
      eq(designVersionExplanations.status, "published"),
      inArray(designVersionExplanations.designVersionId, versionIds),
    ))
    .orderBy(asc(designVersionExplanations.videoTimeMs), asc(designVersionExplanations.createdAt));

  const screenNotes: PublicDesignerNote[] = rows.flatMap((note) => {
    const pin = pinsByVersion.get(note.designVersionId);
    if (
      !pin
      || pin.designId !== note.designId
      || !pin.screens.some((screen) => screen.id === note.screenId)
    ) {
      return [];
    }
    return [{
      id: note.id,
      revisionDesignVersionId: pin.id,
      targetType: "design_screen" as const,
      screenId: note.screenId,
      videoTimeMs: null,
      category: note.category,
      title: note.title,
      body: note.body,
      authorDisplayName: note.authorDisplayName,
      figmaNodeName: note.figmaNodeName,
      x: note.xBasisPoints === null ? null : note.xBasisPoints / 100,
      y: note.yBasisPoints === null ? null : note.yBasisPoints / 100,
      selectionWidth: note.selectionWidthBasisPoints === null
        ? null
        : note.selectionWidthBasisPoints / 100,
      selectionHeight: note.selectionHeightBasisPoints === null
        ? null
        : note.selectionHeightBasisPoints / 100,
    }];
  });
  const videoNotes: PublicDesignerNote[] = videoRows.flatMap((note) => {
    const pin = pinsByVersion.get(note.designVersionId);
    if (!pin || pin.designId !== note.designId || pin.sourceType !== "video") return [];
    return [{
      id: note.id,
      revisionDesignVersionId: pin.id,
      targetType: "video",
      screenId: null,
      videoTimeMs: note.videoTimeMs,
      category: note.category,
      title: note.title,
      body: note.body,
      authorDisplayName: note.authorDisplayName,
      figmaNodeName: null,
      x: null,
      y: null,
      selectionWidth: null,
      selectionHeight: null,
    }];
  });
  return [...screenNotes, ...videoNotes];
}

export async function getRoomBundle(workspaceId: string, roomId: string) {
  const room = await getRoomOrThrow(workspaceId, roomId);
  const clientProject = room.clientProjectId
    ? (
        await db
          .select({
            id: clientProjects.id,
            name: clientProjects.name,
          })
          .from(clientProjects)
          .where(
            and(
              eq(clientProjects.id, room.clientProjectId),
              eq(clientProjects.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      )[0] ?? null
    : null;
  const revisionRows = await db
    .select()
    .from(revisions)
    .where(eq(revisions.roomId, roomId))
    .orderBy(desc(revisions.number));

  const draft = revisionRows.find((r) => r.status === "DRAFT") || null;
  const published =
    revisionRows.find((r) => r.id === room.currentPublishedRevisionId) ||
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
  const designMembership = focusRevisionId
    ? await listRevisionDesignVersions(focusRevisionId)
    : [];

  const share = (
    await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.roomId, roomId), eq(shareLinks.status, "ACTIVE")))
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

  const approvalReceipts = await listApprovalReceiptsForRoom(roomId, {
    includeReviewerEmail: true,
  });

  const handoff = await db
    .select()
    .from(handoffItems)
    .where(eq(handoffItems.roomId, roomId))
    .orderBy(asc(handoffItems.sortOrder));

  return {
    project: room,
    clientProject,
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
    designMembership,
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

/** Build approval receipt views from immutable approval revision evidence. */
export async function listApprovalReceiptsForRoom(
  roomId: string,
  options?: { includeReviewerEmail?: boolean; decision?: "approved" | "changes_requested" },
): Promise<ApprovalReceiptView[]> {
  const room = (
    await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  )[0];
  if (!room?.clientProjectId) return [];
  const project = (
    await db
      .select()
      .from(clientProjects)
      .where(and(
        eq(clientProjects.id, room.clientProjectId),
        eq(clientProjects.organizationId, room.organizationId),
        eq(clientProjects.workspaceId, room.workspaceId),
      ))
      .limit(1)
  )[0];
  if (!project) return [];

  const approvalConditions = [eq(approvals.roomId, roomId)];
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
  const designsByRevision = new Map<string, ApprovalReceiptDesignVersion[]>();
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

    const designRows = await db
      .select({
        revisionId: revisionDesignVersions.roomRevisionId,
        sortOrder: revisionDesignVersions.sortOrder,
        designId: projectDesigns.id,
        designVersionId: projectDesignVersions.id,
        designName: projectDesigns.name,
        versionNumber: projectDesignVersions.versionNumber,
        contentSha256: projectDesignVersions.contentSha256,
        payloadJson: projectDesignVersions.payloadJson,
        displayMetaJson: revisionDesignVersions.displayMetaJson,
      })
      .from(revisionDesignVersions)
      .innerJoin(
        projectDesignVersions,
        eq(projectDesignVersions.id, revisionDesignVersions.designVersionId),
      )
      .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
      .where(inArray(revisionDesignVersions.roomRevisionId, revisionIds))
      .orderBy(asc(revisionDesignVersions.sortOrder));
    for (const design of designRows) {
      const list = designsByRevision.get(design.revisionId) ?? [];
      const payload = parseAnyProjectDesignVersion(design.payloadJson);
      const isVideo = isVideoDesignVersionPayload(payload);
      const displayMeta = parseDesignDisplayMeta(design.displayMetaJson);
      const selectedScreenIds = new Set(displayMeta.selectedScreenIds ?? []);
      list.push({
        designId: design.designId,
        designVersionId: design.designVersionId,
        designName: design.designName,
        versionNumber: design.versionNumber,
        contentSha256: design.contentSha256,
        sourceType: isVideo ? "video" : "figma",
        screenNames: isVideo
          ? []
          : payload.screens
              .filter((screen) => selectedScreenIds.size === 0 || selectedScreenIds.has(screen.id))
              .map((screen) => screen.name),
        video: isVideo ? {
          durationMs: payload.video.durationMs,
          mimeType: payload.video.mimeType,
          originalFilename: payload.video.originalFilename,
          byteSize: payload.video.byteSize,
        } : null,
      });
      designsByRevision.set(design.revisionId, list);
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
      designVersions: designsByRevision.get(row.revisionId) || [],
    };
    return serializeApprovalReceipt(source, {
      includeReviewerEmail: options?.includeReviewerEmail !== false,
    });
  });
}

export async function ensureDraftRevision(workspaceId: string, roomId: string) {
  const existing = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.roomId, roomId),
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
      .where(eq(revisions.roomId, roomId))
      .orderBy(desc(revisions.number))
      .limit(1)
  )[0];

  const [created] = await db
    .insert(revisions)
    .values({
      workspaceId,
      roomId,
      number: (latest?.number || 0) + 1,
      status: "DRAFT",
    })
    .returning();
  return created;
}

export async function pinDesignVersionToDraft(input: {
  scope: WorkspaceScope;
  roomId: string;
  designId: string;
  designVersionId?: string | null;
  selectedScreenIds?: string[] | null;
}) {
  const room = await getRoomOrThrow(input.scope.workspaceId, input.roomId);
  if (!room.clientProjectId) throw new Error("Room is not attached to a project.");
  const design = (await db
    .select()
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.id, input.designId),
      eq(projectDesigns.organizationId, input.scope.organizationId),
      eq(projectDesigns.workspaceId, input.scope.workspaceId),
      eq(projectDesigns.projectId, room.clientProjectId),
    ))
    .limit(1))[0];
  if (!design || design.archivedAt) throw new Error("Design not found in this room's project.");
  const designVersionId = input.designVersionId ?? design.currentVersionId;
  if (!designVersionId) throw new Error("This design has no version to review.");
  const version = (await db
    .select()
    .from(projectDesignVersions)
    .where(and(
      eq(projectDesignVersions.id, designVersionId),
      eq(projectDesignVersions.designId, design.id),
      eq(projectDesignVersions.projectId, room.clientProjectId),
      eq(projectDesignVersions.workspaceId, input.scope.workspaceId),
    ))
    .limit(1))[0];
  if (!version) throw new Error("Design version not found in this room's project.");
  const payload = parseAnyProjectDesignVersion(version.payloadJson);
  const isVideo = isVideoDesignVersionPayload(payload);
  const requestedScreenIds = [...new Set(input.selectedScreenIds ?? [])];
  if (isVideo && requestedScreenIds.length > 0) {
    throw new Error("Videos cannot be limited to individual screens.");
  }
  if (!isVideo && input.selectedScreenIds && requestedScreenIds.length === 0) {
    throw new Error("Select at least one screen.");
  }
  if (!isVideo && requestedScreenIds.length > 0) {
    const validScreenIds = new Set(payload.screens.map((screen) => screen.id));
    if (requestedScreenIds.some((screenId) => !validScreenIds.has(screenId))) {
      throw new Error("One or more selected screens do not belong to this design version.");
    }
  }
  const displayMetaJson = JSON.stringify({
    designName: design.name,
    ...(requestedScreenIds.length > 0 ? { selectedScreenIds: requestedScreenIds } : {}),
  });
  const draft = await ensureDraftRevision(input.scope.workspaceId, input.roomId);

  return db.transaction(async (tx) => {
    const locked = (await tx
      .select()
      .from(revisions)
      .where(and(eq(revisions.id, draft.id), eq(revisions.status, "DRAFT")))
      .for("update")
      .limit(1))[0];
    if (!locked) throw new Error("Only a draft room revision can select designs.");
    const existingForDesign = await tx
      .select({ id: revisionDesignVersions.id })
      .from(revisionDesignVersions)
      .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
      .where(and(
        eq(revisionDesignVersions.roomRevisionId, draft.id),
        eq(projectDesignVersions.designId, design.id),
      ));
    const existing = (await tx
      .select()
      .from(revisionDesignVersions)
      .where(and(
        eq(revisionDesignVersions.roomRevisionId, draft.id),
        eq(revisionDesignVersions.designVersionId, designVersionId),
      ))
      .limit(1))[0];
    if (existing) {
      const [updated] = await tx
        .update(revisionDesignVersions)
        .set({ displayMetaJson })
        .where(eq(revisionDesignVersions.id, existing.id))
        .returning();
      return updated;
    }
    if (existingForDesign.length) {
      await tx.delete(revisionDesignVersions).where(inArray(
        revisionDesignVersions.id,
        existingForDesign.map((row) => row.id),
      ));
    }
    const maxSort = (await tx
      .select({ value: sql<number>`coalesce(max(${revisionDesignVersions.sortOrder}), -1)` })
      .from(revisionDesignVersions)
      .where(eq(revisionDesignVersions.roomRevisionId, draft.id)))[0]?.value;
    const [created] = await tx.insert(revisionDesignVersions).values({
      roomRevisionId: draft.id,
      designVersionId,
      sortOrder: (maxSort ?? -1) + 1,
      displayMetaJson,
    }).returning();
    return created;
  });
}

export async function removeDesignVersionFromDraft(
  scope: WorkspaceScope,
  roomId: string,
  revisionDesignVersionId: string,
) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  const draft = (await db
    .select()
    .from(revisions)
    .where(and(
      eq(revisions.roomId, room.id),
      eq(revisions.workspaceId, scope.workspaceId),
      eq(revisions.status, "DRAFT"),
    ))
    .limit(1))[0];
  if (!draft) throw new Error("Only a draft room revision can remove designs.");
  const removed = await db
    .delete(revisionDesignVersions)
    .where(and(
      eq(revisionDesignVersions.id, revisionDesignVersionId),
      eq(revisionDesignVersions.roomRevisionId, draft.id),
    ))
    .returning({ id: revisionDesignVersions.id });
  if (!removed[0]) throw new Error("Pinned design not found.");
  return removed[0];
}

export async function uploadRoomAsset(input: {
  scope: WorkspaceScope;
  roomId: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
  kind?: "image" | "pdf" | "screenshot";
  width?: number | null;
  height?: number | null;
}) {
  const room = await getRoomOrThrow(input.scope.workspaceId, input.roomId);
  if (room.status === "ARCHIVED") throw new Error("Archived rooms cannot accept new assets.");

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

  const draft = await ensureDraftRevision(input.scope.workspaceId, input.roomId);
  const objectKey = buildTenantObjectPath({
    workspaceId: input.scope.workspaceId,
    roomId: input.roomId,
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
        roomId: input.roomId,
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
        roomId: input.roomId,
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
  roomId: string;
  url: string;
  label?: string;
}) {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");
  await getRoomOrThrow(input.scope.workspaceId, input.roomId);
  const draft = await ensureDraftRevision(input.scope.workspaceId, input.roomId);

  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        workspaceId: input.scope.workspaceId,
        roomId: input.roomId,
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

export async function publishRevision(scope: WorkspaceScope, roomId: string) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  const draft = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.roomId, roomId),
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

  const designMembers = await db
    .select({
      designVersionId: revisionDesignVersions.designVersionId,
      contentSha256: projectDesignVersions.contentSha256,
      sortOrder: revisionDesignVersions.sortOrder,
      displayMetaJson: revisionDesignVersions.displayMetaJson,
    })
    .from(revisionDesignVersions)
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
    .where(eq(revisionDesignVersions.roomRevisionId, draft.id))
    .orderBy(asc(revisionDesignVersions.sortOrder));

  if (members.length === 0 && designMembers.length === 0) {
    throw new Error("Add at least one asset or project design before publishing.");
  }

  const digest = computeRevisionDigest(members, designMembers);

  return db.transaction(async (tx) => {
    if (room.currentPublishedRevisionId) {
      await tx
        .update(revisions)
        .set({ status: "SUPERSEDED", supersededAt: new Date(), updatedAt: new Date() })
        .where(eq(revisions.id, room.currentPublishedRevisionId));
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
      room.status === "APPROVED" || room.status === "CHANGES_REQUESTED"
        ? "SENT"
        : room.status === "DRAFT"
          ? "SENT"
          : room.status === "ARCHIVED"
            ? "SENT"
            : "SENT";

    await tx
      .update(rooms)
      .set({
        currentPublishedRevisionId: draft.id,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, roomId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId: roomId,
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
  roomId: string,
  options?: { expiresInDays?: number; notifyEmail?: string },
) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  if (!room.currentPublishedRevisionId) {
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
      .where(and(eq(shareLinks.roomId, roomId), eq(shareLinks.status, "ACTIVE")));

    const [created] = await tx
      .insert(shareLinks)
      .values({
        workspaceId: scope.workspaceId,
        roomId,
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
        roomId: roomId,
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
        projectName: room.name,
        clientName: room.clientName,
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

  const room = (
    await db.select().from(rooms).where(eq(rooms.id, link.roomId)).limit(1)
  )[0];
  if (!room) throw new Error("This share link is invalid or revoked.");
  if (!room.clientProjectId) throw new Error("This share link is invalid or revoked.");
  const project = (
    await db
      .select()
      .from(clientProjects)
      .where(and(
        eq(clientProjects.id, room.clientProjectId),
        eq(clientProjects.organizationId, room.organizationId),
        eq(clientProjects.workspaceId, room.workspaceId),
      ))
      .limit(1)
  )[0];
  if (!project) throw new Error("This share link is invalid or revoked.");
  if (!room.currentPublishedRevisionId) throw new Error("Nothing has been published for review yet.");

  const revision = (
    await db
      .select()
      .from(revisions)
      .where(eq(revisions.id, room.currentPublishedRevisionId))
      .limit(1)
  )[0];
  if (
    !revision
    || revision.roomId !== room.id
    || revision.workspaceId !== room.workspaceId
    || revision.status === "DRAFT"
  ) {
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

  const designMembership = await listRevisionDesignVersions(revision.id);
  return { link, room, project, revision, membership, designMembership };
}

export async function recordShareView(linkId: string, roomId: string, workspaceId: string) {
  const room = (
    await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  )[0];
  if (!room) return;

  await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      lastViewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shareLinks.id, linkId));

  if (room.status === "SENT") {
    await db
      .update(rooms)
      .set({ status: "VIEWED", updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
  }

  await writeAuditEvent({
    workspaceId,
    roomId: roomId,
    actorType: "system",
    action: "share.viewed",
    targetType: "share_link",
    targetId: linkId,
  });
}

export async function createReviewer(input: {
  workspaceId: string;
  roomId: string;
  name: string;
  email: string;
}) {
  const email = input.email.trim().toLowerCase().slice(0, 320);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Your name is required.");
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");

  // Always insert a new reviewer row. Do not merge by email — that would allow
  // impersonation. Browser session cookies are the only existing-reviewer identity.
  // Future: OTP/magic-link verification can set verifiedAt for stronger attribution.
  const [created] = await db
    .insert(reviewers)
    .values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      email,
      name,
    })
    .returning();
  return created;
}

/** @deprecated Prefer createReviewer / getReviewerById — email is not an auth key. */
export async function upsertReviewer(input: {
  workspaceId: string;
  roomId: string;
  name: string;
  email: string;
}) {
  return createReviewer(input);
}

export async function getReviewerById(input: {
  workspaceId: string;
  roomId: string;
  reviewerId: string;
}) {
  const reviewer = (
    await db
      .select()
      .from(reviewers)
      .where(
        and(
          eq(reviewers.id, input.reviewerId),
          eq(reviewers.roomId, input.roomId),
          eq(reviewers.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!reviewer) {
    const err = new Error("Reviewer session is no longer valid.");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return reviewer;
}

/**
 * Update display name/email for the reviewer already owned by a validated session.
 * Does not look up or merge other reviewers by email.
 */
export async function updateSessionReviewerProfile(input: {
  workspaceId: string;
  roomId: string;
  reviewerId: string;
  name: string;
  email: string;
}) {
  const email = input.email.trim().toLowerCase().slice(0, 320);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Your name is required.");
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");

  const existing = await getReviewerById({
    workspaceId: input.workspaceId,
    roomId: input.roomId,
    reviewerId: input.reviewerId,
  });

  if (existing.name === name && existing.email === email) return existing;

  const [updated] = await db
    .update(reviewers)
    .set({ name, email, updatedAt: new Date() })
    .where(eq(reviewers.id, existing.id))
    .returning();
  return updated;
}

export type PublicCommentTarget =
  | { type: "asset"; revisionAssetId: string }
  | { type: "design_screen"; revisionDesignVersionId: string; screenId: string }
  | { type: "video"; revisionDesignVersionId: string; videoTimeMs: number };

export async function createPublicComment(input: {
  workspaceId: string;
  roomId: string;
  revisionId: string;
  target: PublicCommentTarget;
  reviewerId: string;
  xPercent?: number;
  yPercent?: number;
  body: string;
  notifyTo?: string | null;
  projectName?: string;
  clientName?: string;
  reviewerName?: string;
}) {
  const room = (
    await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, input.roomId), eq(rooms.workspaceId, input.workspaceId)))
      .limit(1)
  )[0];
  if (!room || room.currentPublishedRevisionId !== input.revisionId) {
    throw new Error("Comments are only accepted on the current published revision.");
  }
  if (room.status === "APPROVED" || room.status === "ARCHIVED") {
    throw new Error("Comments are locked after approval.");
  }

  const body = sanitizeCommentBody(input.body);
  if (!body) throw new Error("Comment text is required.");

  let revisionAssetId: string | null = null;
  let revisionDesignVersionId: string | null = null;
  let designScreenId: string | null = null;
  let videoTimeMs: number | null = null;

  if (input.target.type === "asset") {
    const member = (
      await db
        .select({ id: revisionAssets.id })
        .from(revisionAssets)
        .innerJoin(assets, eq(assets.id, revisionAssets.assetId))
        .where(and(
          eq(revisionAssets.id, input.target.revisionAssetId),
          eq(revisionAssets.revisionId, input.revisionId),
          eq(assets.roomId, input.roomId),
          eq(assets.workspaceId, input.workspaceId),
        ))
        .limit(1)
    )[0];
    if (!member) throw new Error("That review asset was not found on this revision.");
    revisionAssetId = member.id;
  } else {
    const member = (
      await db
        .select({
          id: revisionDesignVersions.id,
          projectId: projectDesignVersions.projectId,
          workspaceId: projectDesignVersions.workspaceId,
          payloadJson: projectDesignVersions.payloadJson,
        })
        .from(revisionDesignVersions)
        .innerJoin(
          projectDesignVersions,
          eq(projectDesignVersions.id, revisionDesignVersions.designVersionId),
        )
        .where(and(
          eq(revisionDesignVersions.id, input.target.revisionDesignVersionId),
          eq(revisionDesignVersions.roomRevisionId, input.revisionId),
        ))
        .limit(1)
    )[0];
    if (!member) throw new Error("That design version is not pinned to this room revision.");
    if (
      !room.clientProjectId
      || member.projectId !== room.clientProjectId
      || member.workspaceId !== input.workspaceId
    ) {
      throw new Error("That design version does not belong to this room's project.");
    }
    const payload = parseAnyProjectDesignVersion(member.payloadJson);
    if (input.target.type === "video") {
      if (!isVideoDesignVersionPayload(payload)) {
        throw new Error("That pinned design version is not a video.");
      }
      if (
        !Number.isSafeInteger(input.target.videoTimeMs)
        || input.target.videoTimeMs < 0
        || input.target.videoTimeMs > payload.video.durationMs
      ) {
        throw new Error("Video feedback timestamp is outside the video duration.");
      }
      videoTimeMs = input.target.videoTimeMs;
    } else {
      if (isVideoDesignVersionPayload(payload)) {
        throw new Error("A video version cannot be used as a design-screen target.");
      }
      const screenId = input.target.screenId;
      if (!payload.screens.some((screen) => screen.id === screenId)) {
        throw new Error("That screen does not exist in the pinned design version.");
      }
      designScreenId = screenId;
    }
    revisionDesignVersionId = member.id;
  }

  const [comment] = await db
    .insert(roomComments)
    .values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      revisionId: input.revisionId,
      revisionAssetId,
      revisionDesignVersionId,
      designScreenId,
      videoTimeMs,
      reviewerId: input.reviewerId,
      xPercent: videoTimeMs === null ? String(clampPercent(input.xPercent ?? 0.5)) : null,
      yPercent: videoTimeMs === null ? String(clampPercent(input.yPercent ?? 0.5)) : null,
      body,
      status: "OPEN",
    })
    .returning();

  await writeAuditEvent({
    workspaceId: input.workspaceId,
    roomId: input.roomId,
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
        ownerUrl: `${getSiteUrl()}/rooms/${input.roomId}`,
        roomUrl: `${getSiteUrl()}/rooms/${input.roomId}`,
      },
      idempotencyKey: `email.comment:${comment.id}`,
    });
  }

  return comment;
}

export async function updatePublicComment(input: {
  workspaceId: string;
  roomId: string;
  revisionId: string;
  commentId: string;
  reviewerId: string;
  body: string;
}) {
  const room = (
    await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
  )[0];
  if (!room || room.currentPublishedRevisionId !== input.revisionId) {
    throw new Error("Comments can only be edited on the current published revision.");
  }
  if (room.status === "APPROVED" || room.status === "ARCHIVED") {
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
          eq(roomComments.roomId, input.roomId),
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
    roomId: input.roomId,
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
    roomId: comment.roomId,
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
  roomId: string;
  revisionId: string;
  reviewerId: string;
  decision: "approve" | "request_changes";
  acceptanceStatement?: string;
  notifyTo?: string | null;
  reviewerEmail?: string | null;
  reviewerName?: string | null;
}) {
  const room = await getRoomOrThrow(input.workspaceId, input.roomId);
  if (room.currentPublishedRevisionId !== input.revisionId) {
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
  const ownerUrl = `${getSiteUrl()}/rooms/${input.roomId}`;
  const clientName = input.reviewerName || room.clientName || "A client";

  if (input.decision === "request_changes") {
    return db.transaction(async (tx) => {
      await tx
        .update(rooms)
        .set({ status: "CHANGES_REQUESTED", updatedAt: new Date() })
        .where(eq(rooms.id, input.roomId));

      const [approval] = await tx
        .insert(approvals)
        .values({
          workspaceId: input.workspaceId,
          roomId: input.roomId,
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
          roomId: input.roomId,
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
              projectName: room.name,
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

  const designMembers = await db
    .select({
      designVersionId: revisionDesignVersions.designVersionId,
      contentSha256: projectDesignVersions.contentSha256,
      sortOrder: revisionDesignVersions.sortOrder,
      displayMetaJson: revisionDesignVersions.displayMetaJson,
    })
    .from(revisionDesignVersions)
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
    .where(eq(revisionDesignVersions.roomRevisionId, input.revisionId));

  const digest = computeRevisionDigest(members, designMembers);
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
      .update(rooms)
      .set({
        status: "APPROVED",
        approvedRevisionId: input.revisionId,
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, input.roomId));

    const [approval] = await tx
      .insert(approvals)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
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
        roomId: input.roomId,
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
            projectName: room.name,
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
            projectName: room.name,
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

export async function reopenRoom(scope: WorkspaceScope, roomId: string) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  if (room.status !== "APPROVED" && room.status !== "CHANGES_REQUESTED") {
    throw new Error("Only approved or changes-requested rooms can be reopened into a new draft.");
  }

  return db.transaction(async (tx) => {
    if (room.approvedRevisionId) {
      await tx
        .update(approvals)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(approvals.revisionId, room.approvedRevisionId),
            eq(approvals.decision, "approved"),
          ),
        );
    }

    const latest = (
      await tx
        .select()
        .from(revisions)
        .where(eq(revisions.roomId, roomId))
        .orderBy(desc(revisions.number))
        .limit(1)
    )[0];

    const [draft] = await tx
      .insert(revisions)
      .values({
        workspaceId: scope.workspaceId,
        roomId,
        number: (latest?.number || 0) + 1,
        status: "DRAFT",
      })
      .returning();

    const sourceRevisionId = room.approvedRevisionId ?? room.currentPublishedRevisionId;
    if (sourceRevisionId) {
      const pins = await tx
        .select()
        .from(revisionDesignVersions)
        .where(eq(revisionDesignVersions.roomRevisionId, sourceRevisionId))
        .orderBy(asc(revisionDesignVersions.sortOrder));
      if (pins.length) {
        await tx.insert(revisionDesignVersions).values(pins.map((pin) => ({
          roomRevisionId: draft.id,
          designVersionId: pin.designVersionId,
          sortOrder: pin.sortOrder,
          displayMetaJson: pin.displayMetaJson,
        })));
      }
    }

    await tx
      .update(rooms)
      .set({ status: "DRAFT", updatedAt: new Date() })
      .where(eq(rooms.id, roomId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId: roomId,
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
 * Caller must already hold a row lock on the room.
 */
async function clearHandoffReleaseInTx(
  tx: { update: typeof db.update },
  roomId: string,
  currentlyReleased: boolean,
) {
  if (!currentlyReleased) return false;
  await tx
    .update(rooms)
    .set({ handoffReleasedAt: null, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
  return true;
}

/** Lock the room row for handoff mutations (tenant-scoped). */
async function lockRoomForHandoffTx(
  tx: typeof db,
  workspaceId: string,
  roomId: string,
) {
  const room = (
    await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.workspaceId, workspaceId)))
      .for("update")
      .limit(1)
  )[0];
  if (!room) throw new Error("Room not found.");
  return room;
}

export async function addHandoffItem(input: {
  scope: WorkspaceScope;
  roomId: string;
  label: string;
  category?: string;
  notes?: string;
  externalUrl?: string;
  assetId?: string;
}) {
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
            eq(assets.roomId, input.roomId),
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

  return db.transaction(async (tx) => {
    const room = await lockRoomForHandoffTx(
      tx as unknown as typeof db,
      input.scope.workspaceId,
      input.roomId,
    );
    if (room.status !== "APPROVED" && room.status !== "ARCHIVED") {
      throw new Error("Release handoff after the client approves a revision.");
    }

    return addHandoffItemInTx(tx as unknown as typeof db, {
      scope: input.scope,
      roomId: input.roomId,
      label: input.label.trim().slice(0, 200),
      category: category.slice(0, 40),
      notes: input.notes?.trim().slice(0, 4000) || null,
      externalUrl,
      assetId: input.assetId || null,
      currentlyReleased: Boolean(room.handoffReleasedAt),
    });
  });
}

/**
 * Insert a handoff item inside an existing transaction (caller holds the room lock).
 * When assetId is set, concurrent inserts collapse via the unique asset_id index.
 */
async function addHandoffItemInTx(
  tx: typeof db,
  input: {
    scope: WorkspaceScope;
    roomId: string;
    label: string;
    category: string;
    notes?: string | null;
    externalUrl?: string | null;
    assetId?: string | null;
    currentlyReleased: boolean;
  },
) {
  const maxSort = (
    await tx
      .select({ value: sql<number>`coalesce(max(${handoffItems.sortOrder}), -1)` })
      .from(handoffItems)
      .where(eq(handoffItems.roomId, input.roomId))
  )[0]?.value;

  const values = {
    workspaceId: input.scope.workspaceId,
    roomId: input.roomId,
    label: input.label.trim().slice(0, 200),
    category: input.category.slice(0, 40),
    notes: input.notes?.trim().slice(0, 4000) || null,
    externalUrl: input.externalUrl || null,
    assetId: input.assetId || null,
    sortOrder: (maxSort ?? -1) + 1,
    createdByUserId: input.scope.userId,
  };

  let item: typeof handoffItems.$inferSelect;

  if (input.assetId) {
    const [inserted] = await tx
      .insert(handoffItems)
      .values(values)
      .onConflictDoNothing({ target: handoffItems.assetId })
      .returning();
    if (!inserted) {
      const existing = (
        await tx
          .select()
          .from(handoffItems)
          .where(
            and(
              eq(handoffItems.assetId, input.assetId),
              eq(handoffItems.roomId, input.roomId),
              eq(handoffItems.workspaceId, input.scope.workspaceId),
            ),
          )
          .limit(1)
      )[0];
      if (!existing) throw new Error("Unable to record handoff item.");
      return { item: existing, releaseCleared: false, created: false as const };
    }
    item = inserted;
  } else {
    const [createdItem] = await tx.insert(handoffItems).values(values).returning();
    item = createdItem;
  }

  // Clear release only when a new item was actually added.
  const releaseCleared = await clearHandoffReleaseInTx(
    tx,
    input.roomId,
    input.currentlyReleased,
  );

  await writeAuditEvent(
    {
      workspaceId: input.scope.workspaceId,
      roomId: input.roomId,
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
    tx,
  );

  if (releaseCleared) {
    await writeAuditEvent(
      {
        workspaceId: input.scope.workspaceId,
        roomId: input.roomId,
        actorType: "user",
        actorId: input.scope.userId,
        action: "handoff.release_cleared",
        targetType: "project",
        targetId: input.roomId,
        metadata: { reason: "item_added", itemId: item.id },
      },
      tx,
    );
  }

  return { item, releaseCleared, created: true as const };
}

/**
 * Explicitly release prepared handoff items to the client share link.
 * Idempotent when already released.
 */
export async function releaseHandoff(scope: WorkspaceScope, roomId: string) {
  return db.transaction(async (tx) => {
    const room = await lockRoomForHandoffTx(
      tx as unknown as typeof db,
      scope.workspaceId,
      roomId,
    );
    if (room.status !== "APPROVED" && room.status !== "ARCHIVED") {
      throw new Error("Release handoff after the client approves a revision.");
    }

    if (room.handoffReleasedAt) {
      return {
        released: true as const,
        alreadyReleased: true as const,
        releasedAt: room.handoffReleasedAt,
      };
    }

    const itemCount = (
      await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(handoffItems)
        .where(eq(handoffItems.roomId, roomId))
    )[0]?.value;

    if (!itemCount) {
      throw new Error("Add at least one handoff item before releasing to the client.");
    }

    const releasedAt = new Date();
    await tx
      .update(rooms)
      .set({ handoffReleasedAt: releasedAt, updatedAt: new Date() })
      .where(eq(rooms.id, roomId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId: roomId,
        actorType: "user",
        actorId: scope.userId,
        action: "handoff.released",
        targetType: "project",
        targetId: roomId,
        metadata: { itemCount },
      },
      tx as unknown as typeof db,
    );

    return {
      released: true as const,
      alreadyReleased: false as const,
      releasedAt,
    };
  });
}

export async function uploadHandoffFile(input: {
  scope: WorkspaceScope;
  roomId: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
  label?: string;
  notes?: string;
  externalUrl?: string;
}) {
  const room = await getRoomOrThrow(input.scope.workspaceId, input.roomId);
  if (room.status !== "APPROVED") {
    throw new Error(
      room.status === "ARCHIVED"
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
    roomId: input.roomId,
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
      roomId: input.roomId,
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
      roomId: input.roomId,
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

export type HandoffUploadTokenMeta = {
  workspaceId: string;
  organizationId: string;
  userId: string;
  roomId: string;
  pathname: string;
  contentType: string;
  size: number;
  fileName: string;
  uploadSessionId: string;
};

/**
 * Authorize a handoff direct upload and return bound token metadata.
 * Must run before any Blob client token is issued.
 */
export async function prepareHandoffDirectUpload(input: {
  scope: WorkspaceScope;
  roomId: string;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<HandoffUploadTokenMeta> {
  const room = await getRoomOrThrow(input.scope.workspaceId, input.roomId);
  if (room.status !== "APPROVED") {
    throw new Error(
      room.status === "ARCHIVED"
        ? "Archived rooms cannot accept new handoff files."
        : "Release handoff after the client approves a revision.",
    );
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

  const fileName = input.fileName.trim().slice(0, 200) || "handoff.bin";
  const pathname = buildHandoffObjectPath({
    workspaceId: input.scope.workspaceId,
    roomId: input.roomId,
    filename: fileName,
  });

  return {
    workspaceId: input.scope.workspaceId,
    organizationId: input.scope.organizationId,
    userId: input.scope.userId,
    roomId: input.roomId,
    pathname,
    contentType: mime,
    size: input.size,
    fileName,
    uploadSessionId: pathname,
  };
}

/**
 * Client-token constraints bound to a prepared handoff upload.
 * maximumSizeInBytes is the authorized declaration — never the global ceiling alone.
 */
export function buildHandoffBlobClientTokenConstraints(meta: Pick<
  HandoffUploadTokenMeta,
  "pathname" | "contentType" | "size"
>) {
  return {
    pathname: meta.pathname,
    allowedContentTypes: [meta.contentType],
    maximumSizeInBytes: meta.size,
    addRandomSuffix: false as const,
    allowOverwrite: false as const,
    validUntil: Date.now() + 60 * 60 * 1000,
  };
}

/**
 * Finalize a direct-to-Blob handoff upload after the client PUT succeeds.
 * Creates the asset + handoff item from verified token metadata + confirmed Blob data.
 * Upload-completed webhooks prove an event occurred but not object size (PutBlobResult
 * lacks size) — always re-check authoritative Blob/local metadata before finalizing.
 *
 * Concurrent browser + webhook completions serialize on the room row lock and share
 * one asset + one handoff item for the uploadSessionId.
 */
export async function completeHandoffDirectUpload(input: {
  scope: WorkspaceScope;
  roomId: string;
  /** Bound authorization metadata — never trust raw client fields alone. */
  meta: HandoffUploadTokenMeta;
  pathname?: string;
  blobUrl?: string;
  contentType?: string;
  size?: number;
  fileName?: string;
  uploadSessionId?: string;
  label?: string;
  notes?: string;
  externalUrl?: string;
}) {
  const meta = input.meta;
  if (
    meta.roomId !== input.roomId ||
    meta.workspaceId !== input.scope.workspaceId ||
    meta.organizationId !== input.scope.organizationId ||
    meta.userId !== input.scope.userId
  ) {
    throw new Error("Upload authorization does not match this room.");
  }

  const pathname = meta.pathname;
  const uploadSessionId = meta.uploadSessionId;
  const expectedPrefix = `workspaces/${input.scope.workspaceId}/rooms/${input.roomId}/handoff/`;
  if (!pathname.startsWith(expectedPrefix) || pathname.includes("..")) {
    throw new Error("Upload path is not owned by this room.");
  }
  if (uploadSessionId !== pathname) {
    throw new Error("Upload session mismatch.");
  }

  // Reject client attempts to override bound authorization fields.
  if (input.pathname && input.pathname !== pathname) {
    throw new Error("Upload path is not owned by this room.");
  }
  if (input.uploadSessionId && input.uploadSessionId !== uploadSessionId) {
    throw new Error("Upload session mismatch.");
  }
  if (input.size && input.size !== meta.size) {
    throw new Error("Upload size mismatch.");
  }
  if (input.contentType && input.contentType.toLowerCase() !== meta.contentType.toLowerCase()) {
    const left = input.contentType.toLowerCase().replace("image/jpg", "image/jpeg");
    const right = meta.contentType.toLowerCase().replace("image/jpg", "image/jpeg");
    if (left !== right) throw new Error("Upload content type mismatch.");
  }

  if (!(ALLOWED_HANDOFF_MIME_TYPES as readonly string[]).includes(meta.contentType)) {
    throw new Error("Handoff uploads support images, PDFs, and ZIP files.");
  }
  if (meta.size <= 0 || meta.size > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be between 1 byte and 25 MB.");
  }

  await assertCanMutate(input.scope.organizationId);

  const fileName = meta.fileName.trim().slice(0, 200) || "handoff.bin";
  const label =
    (input.label?.trim() || fileName.replace(/\.[^.]+$/, "") || "Delivery file").slice(0, 200);
  const notes = input.notes;
  const externalUrl = input.externalUrl?.trim() || null;
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
    throw new Error("Link must start with http:// or https://");
  }

  // Phase 1: serialize on the room row — return or repair without holding a lock across Blob I/O.
  const early = await db.transaction(async (tx) => {
    return finalizeHandoffUploadInTx(tx as unknown as typeof db, {
      scope: input.scope,
      roomId: input.roomId,
      pathname,
      uploadSessionId,
      label,
      notes,
      externalUrl,
      verified: null,
    });
  });
  if (early) return early;

  // Phase 2: authoritative storage check (untrusted input.blobUrl is only a lookup hint).
  let verified: Awaited<ReturnType<typeof verifyPrivateBlobObject>>;
  try {
    verified = await verifyPrivateBlobObject({
      pathname,
      blobUrl: input.blobUrl,
      expectedContentType: meta.contentType,
      expectedSize: meta.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // URL mismatch means the authorized pathname object may still be valid — do not delete it.
    // Size/MIME/pathname mismatches may clean up only the server-authorized pathname.
    if (/size mismatch|content type mismatch|pathname mismatch/i.test(message)) {
      await queueAuthorizedPathnameCleanup({
        workspaceId: input.scope.workspaceId,
        pathname,
        reason: "handoff_upload_verification_failed",
      }).catch(() => undefined);
    }
    throw error;
  }

  if (verified.pathname !== pathname) {
    throw new Error("Uploaded object pathname mismatch.");
  }
  if (verified.size !== meta.size || verified.size <= 0 || verified.size > MAX_UPLOAD_BYTES) {
    await queueAuthorizedPathnameCleanup({
      workspaceId: input.scope.workspaceId,
      pathname,
      reason: "handoff_upload_verification_failed",
    }).catch(() => undefined);
    throw new Error("Uploaded object size mismatch.");
  }

  await assertStorageAllowance(
    input.scope.organizationId,
    input.scope.workspaceId,
    verified.size,
  );

  // Phase 3: atomic asset + item + release/audit under the room lock.
  try {
    const finalized = await db.transaction(async (tx) => {
      return finalizeHandoffUploadInTx(tx as unknown as typeof db, {
        scope: input.scope,
        roomId: input.roomId,
        pathname,
        uploadSessionId,
        label,
        notes,
        externalUrl,
        verified,
      });
    });
    if (!finalized) {
      throw new Error("Unable to record uploaded handoff file.");
    }
    return finalized;
  } catch (error) {
    // Never delete on uniqueness races or transient DB failures — leave Blob for retry.
    // Delayed orphan worker rechecks ready-asset references before deleting.
    const message = error instanceof Error ? error.message : "";
    if (!/duplicate|unique|conflict/i.test(message)) {
      await queueBlobDeletion({
        workspaceId: input.scope.workspaceId,
        objectKey: pathname,
        blobUrl: null,
        reason: "handoff_upload_finalize_orphan_candidate",
        availableAt: new Date(Date.now() + 15 * 60 * 1000),
        flush: false,
      }).catch(() => undefined);
    }
    throw error;
  }
}

function assertHandoffAssetMatchesAuthorization(
  asset: typeof assets.$inferSelect,
  input: { workspaceId: string; roomId: string; pathname: string },
) {
  if (
    asset.workspaceId !== input.workspaceId ||
    asset.roomId !== input.roomId ||
    asset.objectKey !== input.pathname
  ) {
    throw new Error("Upload authorization does not match this room.");
  }
}

/**
 * Under an existing room row lock: resolve complete / repair / insert for one upload session.
 * When verified is null, only complete or repair paths run (no new asset insert).
 */
async function finalizeHandoffUploadInTx(
  tx: typeof db,
  input: {
    scope: WorkspaceScope;
    roomId: string;
    pathname: string;
    uploadSessionId: string;
    label: string;
    notes?: string;
    externalUrl?: string | null;
    verified: Awaited<ReturnType<typeof verifyPrivateBlobObject>> | null;
  },
) {
  const room = await lockRoomForHandoffTx(tx, input.scope.workspaceId, input.roomId);
  if (room.status !== "APPROVED") {
    throw new Error(
      room.status === "ARCHIVED"
        ? "Archived rooms cannot accept new handoff files."
        : "Release handoff after the client approves a revision.",
    );
  }

  const ownership = {
    workspaceId: input.scope.workspaceId,
    roomId: input.roomId,
    pathname: input.pathname,
  };

  let asset =
    (
      await tx
        .select()
        .from(assets)
        .where(eq(assets.uploadSessionId, input.uploadSessionId))
        .limit(1)
    )[0] ?? null;

  if (asset) {
    assertHandoffAssetMatchesAuthorization(asset, ownership);
  } else if (input.verified) {
    const storage = getStorageAdapter();
    const mime = input.verified.contentType || "application/octet-stream";
    const [inserted] = await tx
      .insert(assets)
      .values({
        workspaceId: input.scope.workspaceId,
        roomId: input.roomId,
        kind: mime === "application/pdf" ? "pdf" : mime.includes("zip") ? "file" : "image",
        label: input.label,
        objectKey: input.verified.pathname,
        blobUrl: input.verified.url || null,
        storageProvider: storage.provider,
        uploadStatus: "ready",
        uploadSessionId: input.uploadSessionId,
        mime,
        bytes: input.verified.size,
        uploadedByUserId: input.scope.userId,
      })
      .onConflictDoNothing({ target: assets.uploadSessionId })
      .returning();

    asset =
      inserted ??
      (
        await tx
          .select()
          .from(assets)
          .where(eq(assets.uploadSessionId, input.uploadSessionId))
          .limit(1)
      )[0] ??
      null;

    if (!asset) throw new Error("Unable to record uploaded asset.");
    assertHandoffAssetMatchesAuthorization(asset, ownership);
  } else {
    return null;
  }

  const existingItem = (
    await tx
      .select()
      .from(handoffItems)
      .where(
        and(
          eq(handoffItems.assetId, asset.id),
          eq(handoffItems.roomId, input.roomId),
          eq(handoffItems.workspaceId, input.scope.workspaceId),
        ),
      )
      .limit(1)
  )[0];

  if (existingItem) {
    return {
      asset,
      item: existingItem,
      releaseCleared: false,
      idempotent: true as const,
    };
  }

  // Partial state: asset exists without item — repair inside this transaction.
  const { item, releaseCleared } = await addHandoffItemInTx(tx, {
    scope: input.scope,
    roomId: input.roomId,
    label: input.label,
    category: "file",
    notes: input.notes,
    externalUrl: input.externalUrl,
    assetId: asset.id,
    currentlyReleased: Boolean(room.handoffReleasedAt),
  });

  return {
    asset,
    item,
    releaseCleared,
    idempotent: false as const,
  };
}

/** Cleanup may target only the server-authorized pathname — never an untrusted caller URL. */
async function queueAuthorizedPathnameCleanup(input: {
  workspaceId: string;
  pathname: string;
  reason: string;
}) {
  const stillReferenced = (
    await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.objectKey, input.pathname), eq(assets.uploadStatus, "ready")))
      .limit(1)
  )[0];
  if (stillReferenced) return;

  await queueBlobDeletion({
    workspaceId: input.workspaceId,
    objectKey: input.pathname,
    blobUrl: null,
    reason: input.reason,
  });
}

export async function deleteHandoffItem(scope: WorkspaceScope, roomId: string, itemId: string) {
  return db.transaction(async (tx) => {
    const room = await lockRoomForHandoffTx(
      tx as unknown as typeof db,
      scope.workspaceId,
      roomId,
    );
    if (room.status === "ARCHIVED") {
      throw new Error("Archived rooms cannot change handoff.");
    }

    const item = (
      await tx
        .select()
        .from(handoffItems)
        .where(
          and(
            eq(handoffItems.id, itemId),
            eq(handoffItems.roomId, roomId),
            eq(handoffItems.workspaceId, scope.workspaceId),
          ),
        )
        .limit(1)
    )[0];
    if (!item) throw new Error("Handoff item not found.");

    const releaseCleared = await clearHandoffReleaseInTx(
      tx,
      roomId,
      Boolean(room.handoffReleasedAt),
    );
    await tx.delete(handoffItems).where(eq(handoffItems.id, itemId));

    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId: roomId,
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
          roomId: roomId,
          actorType: "user",
          actorId: scope.userId,
          action: "handoff.release_cleared",
          targetType: "project",
          targetId: roomId,
          metadata: { reason: "item_deleted", itemId },
        },
        tx as unknown as typeof db,
      );
    }

    return { ok: true as const, releaseCleared };
  });
}

export async function archiveRoom(scope: WorkspaceScope, roomId: string) {
  await getRoomOrThrow(scope.workspaceId, roomId);
  await db
    .update(rooms)
    .set({ status: "ARCHIVED", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    roomId: roomId,
    actorType: "user",
    actorId: scope.userId,
    action: "project.archived",
    targetType: "project",
    targetId: roomId,
  });
}

/** Rename an approval room (room name and/or client name). Slug stays stable. */
export async function updateRoom(
  scope: WorkspaceScope,
  roomId: string,
  input: { name: string; clientName: string },
) {
  const name = input.name.trim().slice(0, 120);
  const clientName = input.clientName.trim().slice(0, 120);
  if (!name) throw new Error("A room name is required.");
  if (!clientName) throw new Error("A client name is required.");

  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  if (room.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot be edited.");
  }

  await assertCanMutate(scope.organizationId);

  const [updated] = await db
    .update(rooms)
    .set({ name, clientName, updatedAt: new Date() })
    .where(eq(rooms.id, roomId))
    .returning();

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    roomId: roomId,
    actorType: "user",
    actorId: scope.userId,
    action: "project.renamed",
    targetType: "project",
    targetId: roomId,
    metadata: {
      name,
      clientName,
      previousName: room.name,
      previousClientName: room.clientName,
    },
  });

  return updated;
}

/**
 * Permanently delete a room. Clears RESTRICT FK rows (revision_assets → assets,
 * approvals → revisions/reviewers) before cascading the project delete.
 */
export async function deleteRoom(scope: WorkspaceScope, roomId: string) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);

  const assetRows = await db
    .select({
      id: assets.id,
      objectKey: assets.objectKey,
      blobUrl: assets.blobUrl,
    })
    .from(assets)
    .where(and(eq(assets.roomId, roomId), eq(assets.workspaceId, scope.workspaceId)));

  const revisionRows = await db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(eq(revisions.roomId, roomId), eq(revisions.workspaceId, scope.workspaceId)));
  const revisionIds = revisionRows.map((row) => row.id);

  await db.transaction(async (tx) => {
    if (revisionIds.length > 0) {
      await tx.delete(revisionAssets).where(inArray(revisionAssets.revisionId, revisionIds));
    }
    await tx.delete(approvals).where(eq(approvals.roomId, roomId));
    await tx.delete(rooms).where(eq(rooms.id, room.id));
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
      roomId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return { deleted: true as const, id: room.id };
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
  roomId: string,
  revisionAssetId: string,
) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  if (room.status === "ARCHIVED") {
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
          eq(revisions.roomId, roomId),
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
        roomId: roomId,
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
  roomId: string,
  revisionAssetId: string,
  label: string,
) {
  const trimmed = label.trim().slice(0, 200);
  if (!trimmed) throw new Error("Name is required.");

  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  if (room.status === "ARCHIVED") {
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
          eq(revisions.roomId, roomId),
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
    roomId: roomId,
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
  roomId: string,
  orderedIds: string[],
) {
  const room = await getRoomOrThrow(scope.workspaceId, roomId);
  if (room.status === "ARCHIVED") {
    throw new Error("Archived rooms cannot be edited.");
  }

  const draft = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.roomId, roomId),
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
        roomId: roomId,
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
export async function listReleasedHandoffItems(roomId: string) {
  const room = (
    await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  )[0];
  if (!room?.handoffReleasedAt) return [];

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
    .where(eq(handoffItems.roomId, roomId))
    .orderBy(asc(handoffItems.sortOrder));
}

export async function revokeShareLink(scope: WorkspaceScope, roomId: string, shareLinkId?: string) {
  await getRoomOrThrow(scope.workspaceId, roomId);
  const where = shareLinkId
    ? and(
        eq(shareLinks.id, shareLinkId),
        eq(shareLinks.roomId, roomId),
        eq(shareLinks.workspaceId, scope.workspaceId),
      )
    : and(
        eq(shareLinks.roomId, roomId),
        eq(shareLinks.workspaceId, scope.workspaceId),
        eq(shareLinks.status, "ACTIVE"),
      );

  await db
    .update(shareLinks)
    .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
    .where(where);

  await writeAuditEvent({
    workspaceId: scope.workspaceId,
    roomId: roomId,
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
  /** Delay processing so transient finalize failures can retry before orphan cleanup. */
  availableAt?: Date;
  /** When false, enqueue only — do not flush immediately. */
  flush?: boolean;
}) {
  await db.insert(blobDeletionJobs).values({
    workspaceId: input.workspaceId,
    objectKey: input.objectKey,
    blobUrl: input.blobUrl ?? null,
    reason: input.reason,
    availableAt: input.availableAt ?? new Date(),
  });

  if (input.flush === false) return;

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
  roomId: string;
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
  await getRoomOrThrow(input.scope.workspaceId, input.roomId);

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
          eq(revisions.roomId, input.roomId),
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
        roomId: input.roomId,
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
        roomId: input.roomId,
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
      const videoReferenceResult = await db.execute(sql`
        SELECT id
        FROM project_design_versions
        WHERE payload_json::jsonb->>'sourceType' = 'video'
          AND (
            payload_json::jsonb->'video'->>'objectKey' = ${job.objectKey}
            OR payload_json::jsonb->'video'->'poster'->>'objectKey' = ${job.objectKey}
          )
        LIMIT 1
      `);
      const videoStillReferenced =
        (((videoReferenceResult as unknown as { rows?: unknown[] }).rows ?? []).length > 0);
      if (stillReferenced || videoStillReferenced) {
        await db
          .update(blobDeletionJobs)
          .set({
            processedAt: new Date(),
            lastError: "skipped:still_referenced",
          })
          .where(eq(blobDeletionJobs.id, job.id));
        continue;
      }

      await deleteAssetBytes(job.objectKey);
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
