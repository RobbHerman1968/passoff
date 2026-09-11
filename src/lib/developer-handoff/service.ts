import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  approvals,
  developerHandoffLinks,
  developerHandoffSnapshotScreens,
  developerHandoffSnapshots,
  figmaExplanations,
  figmaImportBreakpointGroups,
  figmaImportInteractions,
  figmaImportScreens,
  figmaImports,
  projectDesigns,
  reviewers,
  revisions,
  rooms,
  users,
} from "@/db/schema";
import { readPreviewPng } from "@/lib/figma/preview-storage";
import { writeAuditEvent } from "@/lib/rooms/audit";
import { checksumSha256, getStorageAdapter } from "@/lib/rooms/storage";
import type { TenantContext } from "@/lib/tenant/context";
import type { WorkspaceScope } from "@/lib/tenant/scope";

import {
  canonicalSnapshotJson,
  DEVELOPER_HANDOFF_SNAPSHOT_SCHEMA_VERSION,
  parseDeveloperHandoffSnapshot,
  snapshotSha256,
  type DeveloperHandoffFileSnapshot,
  type DeveloperHandoffSnapshotDto,
} from "./snapshot";
import {
  generateDeveloperHandoffToken,
  hashDeveloperHandoffToken,
  isDeveloperHandoffToken,
} from "./token";

export class DeveloperHandoffError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "DeveloperHandoffError";
  }
}

type PrivateScreenCopy = typeof developerHandoffSnapshotScreens.$inferInsert;

function notFound(): never {
  throw new DeveloperHandoffError("Not found.", 404);
}

function tenantRoomWhere(scope: WorkspaceScope, roomId: string) {
  return and(
    eq(rooms.id, roomId),
    eq(rooms.organizationId, scope.organizationId),
    eq(rooms.workspaceId, scope.workspaceId),
  );
}

function requireRoomProjectId(room: typeof rooms.$inferSelect) {
  if (!room.clientProjectId) {
    throw new DeveloperHandoffError("Room is not attached to a project.", 409);
  }
  return room.clientProjectId;
}

async function loadRoomProjectId(scope: WorkspaceScope, roomId: string) {
  const room = (
    await db
      .select({ clientProjectId: rooms.clientProjectId })
      .from(rooms)
      .where(tenantRoomWhere(scope, roomId))
      .limit(1)
  )[0];
  if (!room) notFound();
  if (!room.clientProjectId) {
    throw new DeveloperHandoffError("Room is not attached to a project.", 409);
  }
  return room.clientProjectId;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeFileKey(fileKey: string) {
  const normalized = fileKey.trim();
  if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new DeveloperHandoffError("A valid fileKey is required.");
  }
  return normalized;
}

async function loadApprovedIdentity(scope: WorkspaceScope, roomId: string) {
  const room = (
    await db.select().from(rooms).where(tenantRoomWhere(scope, roomId)).limit(1)
  )[0];
  if (!room) notFound();
  if (!room.approvedRevisionId) {
    return { room, approvedRevision: null };
  }

  const row = (
    await db
      .select({
        revision: revisions,
        approval: approvals,
        reviewerName: reviewers.name,
        reviewerEmail: reviewers.email,
      })
      .from(revisions)
      .innerJoin(
        approvals,
        and(
          eq(approvals.revisionId, revisions.id),
          eq(approvals.roomId, room.id),
          eq(approvals.decision, "approved"),
          isNull(approvals.supersededAt),
        ),
      )
      .innerJoin(reviewers, eq(reviewers.id, approvals.reviewerId))
      .where(
        and(
          eq(revisions.id, room.approvedRevisionId),
          eq(revisions.roomId, room.id),
          eq(revisions.workspaceId, scope.workspaceId),
        ),
      )
      .orderBy(desc(approvals.approvedAt))
      .limit(1)
  )[0];
  if (!row) {
    throw new DeveloperHandoffError("The approved revision receipt is unavailable.", 409);
  }
  return {
    room,
    approvedRevision: {
      revision: row.revision,
      approval: row.approval,
      approverDisplayName: row.reviewerName || row.reviewerEmail || "Client reviewer",
    },
  };
}

function previewTenant(
  scope: WorkspaceScope,
  room: typeof rooms.$inferSelect,
  projectId: string,
): TenantContext {
  return {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId,
    roomId: room.id,
    projectSlug: room.slug,
    userId: scope.userId,
    organizationName: scope.organizationName,
    workspaceName: scope.workspaceName,
    projectName: room.name,
    userName: scope.userName,
    userEmail: scope.userEmail,
  };
}

async function loadSnapshotFiles(
  scope: WorkspaceScope,
  room: typeof rooms.$inferSelect,
  projectId: string,
  fileKey: string,
  snapshotId: string,
) {
  const imported = (
    await db
    .select()
    .from(figmaImports)
    .where(
      and(
        eq(figmaImports.organizationId, scope.organizationId),
        eq(figmaImports.workspaceId, scope.workspaceId),
        eq(figmaImports.projectId, projectId),
        eq(figmaImports.figmaFileKey, fileKey),
      ),
    )
    .limit(1)
  )[0];
  if (!imported) {
    throw new DeveloperHandoffError("Figma file not found.", 404);
  }
  const design = (await db
    .select({ currentVersionId: projectDesigns.currentVersionId })
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.projectId, projectId),
      eq(projectDesigns.sourceKey, imported.figmaFileKey),
    ))
    .limit(1))[0];

  const storage = getStorageAdapter();
  const privateCopies: PrivateScreenCopy[] = [];
  const writtenObjects: string[] = [];
  const tenant = previewTenant(scope, room, projectId);

  try {
      const [screens, interactions, breakpointGroupRows, explanations] = await Promise.all([
        db
          .select()
          .from(figmaImportScreens)
          .where(eq(figmaImportScreens.figmaImportId, imported.id))
          .orderBy(asc(figmaImportScreens.sortOrder), asc(figmaImportScreens.figmaNodeId)),
        db
          .select()
          .from(figmaImportInteractions)
          .where(eq(figmaImportInteractions.figmaImportId, imported.id))
          .orderBy(asc(figmaImportInteractions.sortOrder), asc(figmaImportInteractions.id)),
        db
          .select()
          .from(figmaImportBreakpointGroups)
          .where(eq(figmaImportBreakpointGroups.figmaImportId, imported.id)),
        db
          .select({
            explanation: figmaExplanations,
            authorName: users.name,
            authorEmail: users.email,
          })
          .from(figmaExplanations)
          .leftJoin(users, eq(users.id, figmaExplanations.authorUserId))
          .where(
            and(
              eq(figmaExplanations.organizationId, scope.organizationId),
              eq(figmaExplanations.workspaceId, scope.workspaceId),
              eq(figmaExplanations.projectId, projectId),
              eq(figmaExplanations.figmaFileKey, imported.figmaFileKey),
              design?.currentVersionId
                ? eq(figmaExplanations.designVersionId, design.currentVersionId)
                : sql`false`,
              eq(figmaExplanations.status, "published"),
            ),
          )
          .orderBy(asc(figmaExplanations.createdAt), asc(figmaExplanations.id)),
      ]);

      const explanationsByScreen = new Map<string, DeveloperHandoffFileSnapshot["screens"][number]["explanations"]>();
      for (const row of explanations) {
        const list = explanationsByScreen.get(row.explanation.screenId) ?? [];
        list.push({
          id: row.explanation.id,
          authorDisplayName: row.authorName || row.authorEmail || "Former member",
          figmaNodeId: row.explanation.figmaNodeId,
          figmaNodeName: row.explanation.figmaNodeName,
          xBasisPoints: row.explanation.xBasisPoints,
          yBasisPoints: row.explanation.yBasisPoints,
          selectionWidthBasisPoints: row.explanation.selectionWidthBasisPoints,
          selectionHeightBasisPoints: row.explanation.selectionHeightBasisPoints,
          category: row.explanation.category,
          title: row.explanation.title,
          body: row.explanation.body,
          publishedAt: row.explanation.updatedAt.toISOString(),
        });
        explanationsByScreen.set(row.explanation.screenId, list);
      }

      const frozenScreens: DeveloperHandoffFileSnapshot["screens"] = [];
      for (const screen of screens) {
        let preview: DeveloperHandoffFileSnapshot["screens"][number]["preview"] = null;
        if (screen.imageUrl) {
          const bytes = await readPreviewPng(tenant, imported.figmaFileKey, screen.figmaNodeId);
          if (!bytes) {
            throw new DeveloperHandoffError(
              `The private preview for “${screen.name}” is unavailable. Re-import the Figma file and try again.`,
              409,
            );
          }
          const mediaId = randomUUID();
          const objectKey = `workspaces/${scope.workspaceId}/developer-handoffs/${projectId}/${snapshotId}/${mediaId}.png`;
          const stored = await storage.put(objectKey, bytes, "image/png");
          writtenObjects.push(stored.pathname);
          const sha256 = checksumSha256(bytes);
          privateCopies.push({
            id: mediaId,
            snapshotId,
            figmaFileKey: imported.figmaFileKey,
            figmaNodeId: screen.figmaNodeId,
            storageProvider: storage.provider,
            objectKey: stored.pathname,
            blobUrl: stored.url ?? null,
            contentType: "image/png",
            bytes: bytes.byteLength,
            sha256,
          });
          preview = { mediaId, contentType: "image/png", bytes: bytes.byteLength, sha256 };
        }
        frozenScreens.push({
          id: screen.figmaNodeId,
          name: screen.name,
          type: screen.type,
          width: screen.width,
          height: screen.height,
          x: screen.x,
          y: screen.y,
          sortOrder: screen.sortOrder,
          breakpointGroupId: screen.breakpointGroupId,
          preview,
          explanations: explanationsByScreen.get(screen.figmaNodeId) ?? [],
        });
      }

      const screenOrder = new Map(
        frozenScreens.map((screen, index) => [screen.id, index]),
      );
      const breakpointGroups = breakpointGroupRows
        .map((group) => ({
          id: group.id,
          name: group.name,
          primaryScreenId: group.primaryScreenId,
          memberScreenIds: frozenScreens
            .filter((screen) => screen.breakpointGroupId === group.id)
            .map((screen) => screen.id),
        }))
        .sort((left, right) => {
          const leftOrder = Math.min(
            ...left.memberScreenIds.map((id) => screenOrder.get(id) ?? Number.MAX_SAFE_INTEGER),
            Number.MAX_SAFE_INTEGER,
          );
          const rightOrder = Math.min(
            ...right.memberScreenIds.map((id) => screenOrder.get(id) ?? Number.MAX_SAFE_INTEGER),
            Number.MAX_SAFE_INTEGER,
          );
          return leftOrder - rightOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
        });

      const file: DeveloperHandoffFileSnapshot = {
        key: imported.figmaFileKey,
        name: imported.figmaFileName,
        figmaVersion: imported.figmaVersion,
        figmaLastModified: imported.figmaLastModified.toISOString(),
        mainScreenId: imported.mainScreenId,
        breakpointGroups,
        screens: frozenScreens,
        interactions: interactions.map((interaction) => ({
          id: interaction.id,
          sourceNodeId: interaction.sourceNodeId,
          sourceNodeName: interaction.sourceNodeName,
          sourceScreenId: interaction.sourceScreenId,
          destinationNodeId: interaction.destinationNodeId,
          destinationScreenId: interaction.destinationScreenId,
          trigger: interaction.trigger,
          actions: parseJson(interaction.actionsJson),
          sourceBounds: {
            x: interaction.sourceX,
            y: interaction.sourceY,
            width: interaction.sourceWidth,
            height: interaction.sourceHeight,
          },
          sortOrder: interaction.sortOrder,
        })),
      };
    return { imported, file, privateCopies, writtenObjects };
  } catch (error) {
    await Promise.allSettled(writtenObjects.map((objectKey) => storage.delete(objectKey)));
    throw error;
  }
}

export async function publishDeveloperHandoffSnapshot(
  scope: WorkspaceScope,
  roomId: string,
  fileKey: string,
  options: { expiresInDays?: number | null } = {},
) {
  const normalizedFileKey = normalizeFileKey(fileKey);
  const days = options.expiresInDays;
  if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) {
    throw new DeveloperHandoffError("expiresInDays must be an integer from 1 to 365.");
  }
  const source = await loadApprovedIdentity(scope, roomId);
  const projectId = requireRoomProjectId(source.room);
  const snapshotId = randomUUID();
  const linkId = randomUUID();
  const token = generateDeveloperHandoffToken();
  const expiresAt = days == null ? null : new Date(Date.now() + days * 86_400_000);
  const publishedAt = new Date();
  const loaded = await loadSnapshotFiles(
    scope,
    source.room,
    projectId,
    normalizedFileKey,
    snapshotId,
  );
  const storage = getStorageAdapter();

  try {
    return await db.transaction(async (tx) => {
      const locked = (
        await tx
          .select()
          .from(rooms)
          .where(tenantRoomWhere(scope, roomId))
          .for("update")
          .limit(1)
      )[0];
      if (!locked) notFound();
      if (locked.approvedRevisionId !== source.room.approvedRevisionId) {
        throw new DeveloperHandoffError("The approved revision changed while publishing. Try again.", 409);
      }

      const latest = (
        await tx
          .select({ version: developerHandoffSnapshots.version })
          .from(developerHandoffSnapshots)
          .where(
            and(
              eq(developerHandoffSnapshots.projectId, projectId),
              eq(developerHandoffSnapshots.figmaFileKey, normalizedFileKey),
            ),
          )
          .orderBy(desc(developerHandoffSnapshots.version))
          .limit(1)
      )[0];
      const version = (latest?.version ?? 0) + 1;
      const dto: DeveloperHandoffSnapshotDto = {
        schemaVersion: DEVELOPER_HANDOFF_SNAPSHOT_SCHEMA_VERSION,
        snapshotId,
        version,
        project: {
          id: source.room.id,
          name: source.room.name,
          clientName: source.room.clientName,
        },
        approvedRevision: source.approvedRevision
          ? {
              id: source.approvedRevision.revision.id,
              number: source.approvedRevision.revision.number,
              contentDigest: source.approvedRevision.approval.contentDigest,
              approvalId: source.approvedRevision.approval.id,
              approvedAt: source.approvedRevision.approval.approvedAt.toISOString(),
              approverDisplayName: source.approvedRevision.approverDisplayName,
            }
          : null,
        publishedByDisplayName: scope.userName || scope.userEmail,
        publishedAt: publishedAt.toISOString(),
        file: loaded.file,
      };
      const payloadJson = canonicalSnapshotJson(dto);
      const contentSha256 = snapshotSha256(dto);

      const [snapshot] = await tx
        .insert(developerHandoffSnapshots)
        .values({
          id: snapshotId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId,
          sourceRoomId: source.room.id,
          figmaFileKey: normalizedFileKey,
          sourceImportId: loaded.imported.id,
          version,
          sourceApprovedRevisionId: source.approvedRevision?.revision.id ?? null,
          sourceApprovedRevisionNumber: source.approvedRevision?.revision.number ?? null,
          sourceApprovedRevisionDigest: source.approvedRevision?.approval.contentDigest ?? null,
          sourceApprovalId: source.approvedRevision?.approval.id ?? null,
          sourceApprovedAt: source.approvedRevision?.approval.approvedAt ?? null,
          sourceApproverDisplayName: source.approvedRevision?.approverDisplayName ?? null,
          payloadJson,
          contentSha256,
          publishedByUserId: scope.userId,
          publishedByDisplayName: scope.userName || scope.userEmail,
          publishedAt,
        })
        .returning();
      if (loaded.privateCopies.length) {
        await tx.insert(developerHandoffSnapshotScreens).values(loaded.privateCopies);
      }
      await tx.insert(developerHandoffLinks).values({
        id: linkId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId,
        snapshotId,
        tokenHash: hashDeveloperHandoffToken(token),
        expiresAt,
        createdByUserId: scope.userId,
      });
      await writeAuditEvent(
        {
          workspaceId: scope.workspaceId,
          roomId,
          actorType: "user",
          actorId: scope.userId,
          action: "developer_handoff.published",
          targetType: "developer_handoff_snapshot",
          targetId: snapshotId,
          metadata: {
            version,
            figmaFileKey: normalizedFileKey,
            contentSha256,
            approvedRevisionId: source.approvedRevision?.revision.id ?? null,
          },
        },
        tx as unknown as typeof db,
      );
      await writeAuditEvent(
        {
          workspaceId: scope.workspaceId,
          roomId,
          actorType: "user",
          actorId: scope.userId,
          action: "developer_handoff.link_created",
          targetType: "developer_handoff_link",
          targetId: linkId,
          metadata: { snapshotId, expiresAt: expiresAt?.toISOString() ?? null },
        },
        tx as unknown as typeof db,
      );
      return {
        snapshot,
        dto,
        link: { id: linkId, snapshotId, token, expiresAt },
      };
    });
  } catch (error) {
    await Promise.allSettled(loaded.writtenObjects.map((objectKey) => storage.delete(objectKey)));
    throw error;
  }
}

export async function getDeveloperHandoffSummary(
  scope: WorkspaceScope,
  roomId: string,
  fileKey: string,
) {
  const normalizedFileKey = normalizeFileKey(fileKey);
  const source = await loadApprovedIdentity(scope, roomId);
  const projectId = requireRoomProjectId(source.room);
  const imported = (
    await db
      .select()
      .from(figmaImports)
      .where(
        and(
          eq(figmaImports.organizationId, scope.organizationId),
          eq(figmaImports.workspaceId, scope.workspaceId),
          eq(figmaImports.projectId, projectId),
          eq(figmaImports.figmaFileKey, normalizedFileKey),
        ),
      )
      .limit(1)
  )[0];
  if (!imported) notFound();

  const design = (await db
    .select({ currentVersionId: projectDesigns.currentVersionId })
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.projectId, projectId),
      eq(projectDesigns.sourceKey, normalizedFileKey),
    ))
    .limit(1))[0];
  const [snapshots, links, explanationRows] = await Promise.all([
    db
      .select({
        id: developerHandoffSnapshots.id,
        figmaFileKey: developerHandoffSnapshots.figmaFileKey,
        version: developerHandoffSnapshots.version,
        approvedRevisionId: developerHandoffSnapshots.sourceApprovedRevisionId,
        approvedRevisionNumber: developerHandoffSnapshots.sourceApprovedRevisionNumber,
        contentSha256: developerHandoffSnapshots.contentSha256,
        publishedByDisplayName: developerHandoffSnapshots.publishedByDisplayName,
        publishedAt: developerHandoffSnapshots.publishedAt,
      })
      .from(developerHandoffSnapshots)
      .where(
        and(
          eq(developerHandoffSnapshots.organizationId, scope.organizationId),
          eq(developerHandoffSnapshots.workspaceId, scope.workspaceId),
          eq(developerHandoffSnapshots.projectId, projectId),
          eq(developerHandoffSnapshots.figmaFileKey, normalizedFileKey),
        ),
      )
      .orderBy(desc(developerHandoffSnapshots.version)),
    db
      .select({
        id: developerHandoffLinks.id,
        snapshotId: developerHandoffLinks.snapshotId,
        status: developerHandoffLinks.status,
        expiresAt: developerHandoffLinks.expiresAt,
        revokedAt: developerHandoffLinks.revokedAt,
        lastViewedAt: developerHandoffLinks.lastViewedAt,
        viewCount: developerHandoffLinks.viewCount,
        createdAt: developerHandoffLinks.createdAt,
      })
      .from(developerHandoffLinks)
      .innerJoin(
        developerHandoffSnapshots,
        eq(developerHandoffSnapshots.id, developerHandoffLinks.snapshotId),
      )
      .where(
        and(
          eq(developerHandoffLinks.organizationId, scope.organizationId),
          eq(developerHandoffLinks.workspaceId, scope.workspaceId),
          eq(developerHandoffLinks.projectId, projectId),
          eq(developerHandoffSnapshots.figmaFileKey, normalizedFileKey),
        ),
      )
      .orderBy(desc(developerHandoffLinks.createdAt)),
    db
      .select({ status: figmaExplanations.status })
      .from(figmaExplanations)
      .where(
        and(
          eq(figmaExplanations.organizationId, scope.organizationId),
          eq(figmaExplanations.workspaceId, scope.workspaceId),
          eq(figmaExplanations.projectId, projectId),
          eq(figmaExplanations.figmaFileKey, normalizedFileKey),
          design?.currentVersionId
            ? eq(figmaExplanations.designVersionId, design.currentVersionId)
            : sql`false`,
        ),
      ),
  ]);
  const currentApprovedRevision = source.approvedRevision
    ? {
        id: source.approvedRevision.revision.id,
        number: source.approvedRevision.revision.number,
        contentDigest: source.approvedRevision.approval.contentDigest,
        approvalId: source.approvedRevision.approval.id,
        approvedAt: source.approvedRevision.approval.approvedAt,
        approverDisplayName: source.approvedRevision.approverDisplayName,
      }
    : null;
  return {
    project: { id: source.room.id, name: source.room.name },
    file: {
      key: imported.figmaFileKey,
      name: imported.figmaFileName,
      screenCount: imported.screenCount,
      interactionCount: imported.interactionCount,
      publishedExplanationCount: explanationRows.filter((row) => row.status === "published").length,
      draftExplanationCount: explanationRows.filter((row) => row.status === "draft").length,
    },
    currentApprovedRevision,
    snapshots,
    links,
  };
}

export async function createDeveloperHandoffLink(
  scope: WorkspaceScope,
  roomId: string,
  snapshotId: string,
  options: { expiresInDays?: number | null } = {},
) {
  const projectId = await loadRoomProjectId(scope, roomId);
  const snapshot = (
    await db
      .select({ id: developerHandoffSnapshots.id })
      .from(developerHandoffSnapshots)
      .where(
        and(
          eq(developerHandoffSnapshots.id, snapshotId),
          eq(developerHandoffSnapshots.organizationId, scope.organizationId),
          eq(developerHandoffSnapshots.workspaceId, scope.workspaceId),
          eq(developerHandoffSnapshots.projectId, projectId),
        ),
      )
      .limit(1)
  )[0];
  if (!snapshot) notFound();
  const days = options.expiresInDays;
  if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) {
    throw new DeveloperHandoffError("expiresInDays must be an integer from 1 to 365.");
  }
  const token = generateDeveloperHandoffToken();
  const expiresAt = days == null ? null : new Date(Date.now() + days * 86_400_000);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(developerHandoffLinks).values({
      id,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId,
      snapshotId,
      tokenHash: hashDeveloperHandoffToken(token),
      expiresAt,
      createdByUserId: scope.userId,
    });
    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId,
        actorType: "user",
        actorId: scope.userId,
        action: "developer_handoff.link_created",
        targetType: "developer_handoff_link",
        targetId: id,
        metadata: { snapshotId, expiresAt: expiresAt?.toISOString() ?? null },
      },
      tx as unknown as typeof db,
    );
  });
  return { id, token, snapshotId, expiresAt };
}

export async function revokeDeveloperHandoffLink(
  scope: WorkspaceScope,
  roomId: string,
  linkId: string,
) {
  const projectId = await loadRoomProjectId(scope, roomId);
  return db.transaction(async (tx) => {
    const [link] = await tx
      .update(developerHandoffLinks)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(
        and(
          eq(developerHandoffLinks.id, linkId),
          eq(developerHandoffLinks.organizationId, scope.organizationId),
          eq(developerHandoffLinks.workspaceId, scope.workspaceId),
          eq(developerHandoffLinks.projectId, projectId),
          eq(developerHandoffLinks.status, "ACTIVE"),
        ),
      )
      .returning();
    if (!link) {
      const existing = (
        await tx
          .select({ id: developerHandoffLinks.id, status: developerHandoffLinks.status })
          .from(developerHandoffLinks)
          .where(
            and(
              eq(developerHandoffLinks.id, linkId),
              eq(developerHandoffLinks.organizationId, scope.organizationId),
              eq(developerHandoffLinks.workspaceId, scope.workspaceId),
              eq(developerHandoffLinks.projectId, projectId),
            ),
          )
          .limit(1)
      )[0];
      if (!existing) notFound();
      return { id: existing.id, revoked: true };
    }
    await writeAuditEvent(
      {
        workspaceId: scope.workspaceId,
        roomId,
        actorType: "user",
        actorId: scope.userId,
        action: "developer_handoff.link_revoked",
        targetType: "developer_handoff_link",
        targetId: link.id,
        metadata: { snapshotId: link.snapshotId },
      },
      tx as unknown as typeof db,
    );
    return { id: link.id, revoked: true };
  });
}

export async function resolveDeveloperHandoffToken(token: string, recordView = false) {
  if (!isDeveloperHandoffToken(token)) notFound();
  const tokenHash = hashDeveloperHandoffToken(token);
  const resolvedAt = new Date();
  const row = (
    await db
      .select({
        link: developerHandoffLinks,
        snapshot: developerHandoffSnapshots,
      })
      .from(developerHandoffLinks)
      .innerJoin(
        developerHandoffSnapshots,
        eq(developerHandoffSnapshots.id, developerHandoffLinks.snapshotId),
      )
      .where(eq(developerHandoffLinks.tokenHash, tokenHash))
      .limit(1)
  )[0];
  if (
    !row ||
    row.link.status !== "ACTIVE" ||
    row.link.revokedAt ||
    (row.link.expiresAt && row.link.expiresAt <= resolvedAt)
  ) {
    notFound();
  }

  if (recordView) {
    await db.transaction(async (tx) => {
      const [viewed] = await tx
        .update(developerHandoffLinks)
        .set({
          viewCount: sql`${developerHandoffLinks.viewCount} + 1`,
          lastViewedAt: new Date(),
        })
        .where(
          and(
            eq(developerHandoffLinks.id, row.link.id),
            eq(developerHandoffLinks.status, "ACTIVE"),
            isNull(developerHandoffLinks.revokedAt),
            or(
              isNull(developerHandoffLinks.expiresAt),
              gt(developerHandoffLinks.expiresAt, sql`now()`),
            ),
          ),
        )
        .returning({ viewCount: developerHandoffLinks.viewCount });
      if (!viewed) notFound();
      await writeAuditEvent(
        {
          workspaceId: row.link.workspaceId,
          roomId: row.snapshot.sourceRoomId,
          actorType: "system",
          action: "developer_handoff.link_viewed",
          targetType: "developer_handoff_link",
          targetId: row.link.id,
          metadata: { snapshotId: row.snapshot.id, viewCount: viewed.viewCount },
        },
        tx as unknown as typeof db,
      );
    });
  }
  return {
    link: {
      id: row.link.id,
      snapshotId: row.link.snapshotId,
      expiresAt: row.link.expiresAt,
    },
    snapshot: {
      id: row.snapshot.id,
      version: row.snapshot.version,
      contentSha256: row.snapshot.contentSha256,
      publishedAt: row.snapshot.publishedAt,
      payload: parseDeveloperHandoffSnapshot(row.snapshot.payloadJson),
    },
  };
}

export async function resolveDeveloperHandoffScreen(token: string, mediaId: string) {
  const resolved = await resolveDeveloperHandoffToken(token, false);
  const screen = (
    await db
      .select()
      .from(developerHandoffSnapshotScreens)
      .where(
        and(
          eq(developerHandoffSnapshotScreens.id, mediaId),
          eq(developerHandoffSnapshotScreens.snapshotId, resolved.snapshot.id),
        ),
      )
      .limit(1)
  )[0];
  if (!screen) notFound();
  const object = await getStorageAdapter().getStream(screen.objectKey);
  if (!object) notFound();
  return { screen, object };
}
