import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  figmaExplanations,
  projectDesigns,
  projectDesignVersions,
  users,
} from "@/db/schema";
import type {
  CreateFigmaExplanationInput,
  UpdateFigmaExplanationInput,
} from "@/lib/figma/explanation-contract";
import { isFigmaExplanationCategory } from "@/lib/figma/explanation-contract";
import type { FigmaExplanationRecord } from "@/lib/figma/types";
import { parseProjectDesignVersion } from "@/lib/projects/design-version";
import type { TenantContext } from "@/lib/tenant/context";

type ExplanationRow = typeof figmaExplanations.$inferSelect;

export class FigmaExplanationTargetNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Figma screen not found.");
    this.name = "FigmaExplanationTargetNotFoundError";
  }
}

export function serializeFigmaExplanation(
  row: ExplanationRow,
  authorName: string,
  currentUserId: string,
): FigmaExplanationRecord {
  return {
    id: row.id,
    screenId: row.screenId,
    screenName: row.screenName,
    figmaNodeId: row.figmaNodeId,
    figmaNodeName: row.figmaNodeName,
    x: row.xBasisPoints / 100,
    y: row.yBasisPoints / 100,
    selectionWidth: row.selectionWidthBasisPoints === null ? null : row.selectionWidthBasisPoints / 100,
    selectionHeight: row.selectionHeightBasisPoints === null ? null : row.selectionHeightBasisPoints / 100,
    category: isFigmaExplanationCategory(row.category) ? row.category : "developer_note",
    title: row.title,
    body: row.body,
    status: row.status === "published" ? "published" : "draft",
    authorName: row.authorDisplayName || authorName,
    authorUserId: row.authorUserId,
    canEdit: row.status === "draft" && row.authorUserId === currentUserId,
    canMoveToDraft: row.status === "published" && row.authorUserId === currentUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function tenantScope(tenant: TenantContext) {
  return and(
    eq(figmaExplanations.organizationId, tenant.organizationId),
    eq(figmaExplanations.workspaceId, tenant.workspaceId),
    eq(figmaExplanations.projectId, tenant.projectId),
  );
}

export async function listFigmaExplanations(
  tenant: TenantContext,
  fileKey: string,
  screenId: string,
  designVersionId: string,
) {
  const rows = await db
    .select({
      explanation: figmaExplanations,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(figmaExplanations)
    .leftJoin(users, eq(figmaExplanations.authorUserId, users.id))
    .where(and(
      tenantScope(tenant),
      eq(figmaExplanations.figmaFileKey, fileKey),
      eq(figmaExplanations.screenId, screenId),
      eq(figmaExplanations.designVersionId, designVersionId),
      or(
        eq(figmaExplanations.status, "published"),
        eq(figmaExplanations.authorUserId, tenant.userId),
      ),
    ))
    .orderBy(asc(figmaExplanations.createdAt));

  return rows.map((row) => serializeFigmaExplanation(
    row.explanation,
    row.authorName || row.authorEmail || "Former member",
    tenant.userId,
  ));
}

export async function createFigmaExplanation(
  tenant: TenantContext,
  input: CreateFigmaExplanationInput,
) {
  const target = (await db
    .select({
      designId: projectDesigns.id,
      payloadJson: projectDesignVersions.payloadJson,
    })
    .from(projectDesignVersions)
    .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
    .where(and(
      eq(projectDesignVersions.id, input.designVersionId),
      eq(projectDesignVersions.designId, input.designId),
      eq(projectDesignVersions.organizationId, tenant.organizationId),
      eq(projectDesignVersions.workspaceId, tenant.workspaceId),
      eq(projectDesignVersions.projectId, tenant.projectId),
    ))
    .limit(1))[0];
  if (!target) throw new FigmaExplanationTargetNotFoundError();
  const payload = parseProjectDesignVersion(target.payloadJson);
  const screen = payload.screens.find((item) => item.id === input.screenId);
  if (payload.file.key !== input.fileKey || !screen) {
    throw new FigmaExplanationTargetNotFoundError();
  }

  const now = new Date();
  const row: typeof figmaExplanations.$inferInsert = {
    id: randomUUID(),
    organizationId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    projectId: tenant.projectId,
    designId: target.designId,
    designVersionId: input.designVersionId,
    authorUserId: tenant.userId,
    authorDisplayName: tenant.userName,
    figmaFileKey: input.fileKey,
    figmaFileName: payload.file.name,
    screenId: input.screenId,
    screenName: screen.name,
    figmaNodeId: input.figmaNodeId,
    figmaNodeName: input.figmaNodeName,
    xBasisPoints: Math.round(input.x * 100),
    yBasisPoints: Math.round(input.y * 100),
    selectionWidthBasisPoints: input.selectionWidth === null ? null : Math.round(input.selectionWidth * 100),
    selectionHeightBasisPoints: input.selectionHeight === null ? null : Math.round(input.selectionHeight * 100),
    category: input.category,
    title: input.title,
    body: input.body,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(figmaExplanations).values(row);
  return serializeFigmaExplanation(row as ExplanationRow, tenant.userName, tenant.userId);
}

export async function updateFigmaExplanation(
  tenant: TenantContext,
  input: UpdateFigmaExplanationInput,
) {
  const changesPublishedContent = input.status === "draft" && (
    input.title !== undefined
    || input.body !== undefined
    || input.category !== undefined
    || input.x !== undefined
    || input.y !== undefined
  );
  const values: Partial<typeof figmaExplanations.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) values.title = input.title;
  if (input.body !== undefined) values.body = input.body;
  if (input.category !== undefined) values.category = input.category;
  if (input.x !== undefined && input.y !== undefined) {
    values.xBasisPoints = Math.round(input.x * 100);
    values.yBasisPoints = Math.round(input.y * 100);
  }
  if (input.status !== undefined) values.status = input.status;

  const editableStatus = input.status === "draft" && !changesPublishedContent
    ? or(eq(figmaExplanations.status, "draft"), eq(figmaExplanations.status, "published"))
    : eq(figmaExplanations.status, "draft");
  const row = (await db
    .update(figmaExplanations)
    .set(values)
    .where(and(
      eq(figmaExplanations.id, input.id),
      tenantScope(tenant),
      eq(figmaExplanations.authorUserId, tenant.userId),
      editableStatus,
    ))
    .returning())[0];
  return row
    ? serializeFigmaExplanation(row, tenant.userName, tenant.userId)
    : null;
}

export async function deleteFigmaExplanation(
  tenant: TenantContext,
  id: string,
) {
  const row = (await db
    .delete(figmaExplanations)
    .where(and(
      eq(figmaExplanations.id, id),
      tenantScope(tenant),
      eq(figmaExplanations.authorUserId, tenant.userId),
      eq(figmaExplanations.status, "draft"),
    ))
    .returning({ id: figmaExplanations.id }))[0];
  return Boolean(row);
}

export async function copyFigmaExplanations(
  tenant: TenantContext,
  sourceDesignVersionId: string,
  targetDesignVersionId: string,
) {
  const designProjectId = tenant.projectId;
  const versions = await db
    .select({
      id: projectDesignVersions.id,
      designId: projectDesignVersions.designId,
      payloadJson: projectDesignVersions.payloadJson,
    })
    .from(projectDesignVersions)
    .where(and(
      eq(projectDesignVersions.organizationId, tenant.organizationId),
      eq(projectDesignVersions.workspaceId, tenant.workspaceId),
      eq(projectDesignVersions.projectId, designProjectId),
      or(
        eq(projectDesignVersions.id, sourceDesignVersionId),
        eq(projectDesignVersions.id, targetDesignVersionId),
      ),
    ));
  const sourceVersion = versions.find((version) => version.id === sourceDesignVersionId);
  const targetVersion = versions.find((version) => version.id === targetDesignVersionId);
  if (!sourceVersion || !targetVersion || sourceVersion.designId !== targetVersion.designId) {
    throw new FigmaExplanationTargetNotFoundError();
  }
  const targetPayload = parseProjectDesignVersion(targetVersion.payloadJson);
  const targetScreens = new Map(targetPayload.screens.map((screen) => [screen.id, screen.name]));
  const sourceRows = await db
    .select()
    .from(figmaExplanations)
    .where(and(
      tenantScope(tenant),
      eq(figmaExplanations.designVersionId, sourceDesignVersionId),
      eq(figmaExplanations.status, "published"),
    ))
    .orderBy(asc(figmaExplanations.createdAt));
  const now = new Date();
  const copies = sourceRows
    .filter((row) => targetScreens.has(row.screenId))
    .map((row) => ({
      ...row,
      id: randomUUID(),
      designVersionId: targetDesignVersionId,
      figmaFileName: targetPayload.file.name,
      screenName: targetScreens.get(row.screenId)!,
      authorUserId: tenant.userId,
      authorDisplayName: tenant.userName,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }));
  if (copies.length) await db.insert(figmaExplanations).values(copies);
  return copies.map((row) => serializeFigmaExplanation(row, tenant.userName, tenant.userId));
}
