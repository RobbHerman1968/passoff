import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  figmaExplanations,
  figmaImports,
  figmaImportScreens,
  users,
} from "@/db/schema";
import type {
  CreateFigmaExplanationInput,
  UpdateFigmaExplanationInput,
} from "@/lib/figma/explanation-contract";
import { isFigmaExplanationCategory } from "@/lib/figma/explanation-contract";
import type { FigmaExplanationRecord } from "@/lib/figma/types";
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
    category: isFigmaExplanationCategory(row.category) ? row.category : "developer_note",
    title: row.title,
    body: row.body,
    status: row.status === "published" ? "published" : "draft",
    authorName,
    authorUserId: row.authorUserId,
    canEdit: row.authorUserId === currentUserId,
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
      fileName: figmaImports.figmaFileName,
      screenName: figmaImportScreens.name,
    })
    .from(figmaImports)
    .innerJoin(
      figmaImportScreens,
      eq(figmaImportScreens.figmaImportId, figmaImports.id),
    )
    .where(and(
      eq(figmaImports.organizationId, tenant.organizationId),
      eq(figmaImports.workspaceId, tenant.workspaceId),
      eq(figmaImports.projectId, tenant.projectId),
      eq(figmaImports.figmaFileKey, input.fileKey),
      eq(figmaImportScreens.figmaNodeId, input.screenId),
    ))
    .limit(1))[0];
  if (!target) throw new FigmaExplanationTargetNotFoundError();

  const now = new Date();
  const row: typeof figmaExplanations.$inferInsert = {
    id: randomUUID(),
    organizationId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    projectId: tenant.projectId,
    authorUserId: tenant.userId,
    figmaFileKey: input.fileKey,
    figmaFileName: target.fileName,
    screenId: input.screenId,
    screenName: target.screenName,
    figmaNodeId: input.figmaNodeId,
    figmaNodeName: input.figmaNodeName,
    xBasisPoints: Math.round(input.x * 100),
    yBasisPoints: Math.round(input.y * 100),
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

  const row = (await db
    .update(figmaExplanations)
    .set(values)
    .where(and(
      eq(figmaExplanations.id, input.id),
      tenantScope(tenant),
      eq(figmaExplanations.authorUserId, tenant.userId),
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
    ))
    .returning({ id: figmaExplanations.id }))[0];
  return Boolean(row);
}
