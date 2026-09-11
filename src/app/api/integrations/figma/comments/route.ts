import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { figmaComments, users } from "@/db/schema";
import type { FigmaCommentRecord } from "@/lib/figma/types";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

type CommentBody = {
  projectKey?: unknown;
  designVersionId?: unknown;
  id?: unknown;
  fileKey?: unknown;
  fileName?: unknown;
  screenId?: unknown;
  screenName?: unknown;
  x?: unknown;
  y?: unknown;
  body?: unknown;
  status?: unknown;
};

function validFileKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

function serialize(row: typeof figmaComments.$inferSelect, authorName: string): FigmaCommentRecord {
  return {
    id: row.id,
    screenId: row.screenId,
    screenName: row.screenName,
    x: row.xBasisPoints / 100,
    y: row.yBasisPoints / 100,
    body: row.body,
    status: row.status === "resolved" ? "resolved" : "open",
    authorName,
    authorUserId: row.authorUserId,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");
    const screenId = url.searchParams.get("screenId");
    const designVersionId = url.searchParams.get("designVersionId");
    if (!validFileKey(fileKey) || !screenId || screenId.length > 200 || !designVersionId) {
      return NextResponse.json({ error: "A valid Figma file and screen are required." }, { status: 400 });
    }
    const rows = await db.select({ comment: figmaComments, authorName: users.name, authorEmail: users.email }).from(figmaComments).leftJoin(users, eq(figmaComments.authorUserId, users.id)).where(and(eq(figmaComments.organizationId, tenant.organizationId), eq(figmaComments.projectId, tenant.projectId), eq(figmaComments.designVersionId, designVersionId), eq(figmaComments.figmaFileKey, fileKey), eq(figmaComments.screenId, screenId))).orderBy(asc(figmaComments.createdAt));
    return NextResponse.json({ comments: rows.map((row) => serialize(row.comment, row.authorName || row.authorEmail || "Former member")) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load screen comments." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CommentBody;
    const tenant = await resolveTenantFromRequest(request, body.projectKey);
    if (typeof body.designVersionId !== "string" || !validFileKey(body.fileKey) || typeof body.fileName !== "string" || typeof body.screenId !== "string" || typeof body.screenName !== "string" || typeof body.body !== "string" || !body.body.trim() || body.body.length > 2_000 || typeof body.x !== "number" || typeof body.y !== "number" || body.x < 0 || body.x > 100 || body.y < 0 || body.y > 100) {
      return NextResponse.json({ error: "The comment or its screen position is invalid." }, { status: 400 });
    }
    const now = new Date();
    const row: typeof figmaComments.$inferInsert = {
      id: randomUUID(),
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      designVersionId: body.designVersionId,
      authorUserId: tenant.userId,
      figmaFileKey: body.fileKey,
      figmaFileName: body.fileName.slice(0, 200),
      screenId: body.screenId.slice(0, 200),
      screenName: body.screenName.slice(0, 200),
      xBasisPoints: Math.round(body.x * 100),
      yBasisPoints: Math.round(body.y * 100),
      body: body.body.trim(),
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(figmaComments).values(row);
    return NextResponse.json(serialize({ ...row, resolvedAt: null } as typeof figmaComments.$inferSelect, tenant.userName), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to save this screen comment." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as CommentBody;
    const tenant = await resolveTenantFromRequest(request, body.projectKey);
    if (typeof body.id !== "string" || (body.status !== "open" && body.status !== "resolved")) {
      return NextResponse.json({ error: "A comment and valid status are required." }, { status: 400 });
    }
    const now = new Date();
    const rows = await db.update(figmaComments).set({ status: body.status, resolvedAt: body.status === "resolved" ? now : null, updatedAt: now }).where(and(eq(figmaComments.id, body.id), eq(figmaComments.organizationId, tenant.organizationId), eq(figmaComments.projectId, tenant.projectId))).returning();
    if (!rows[0]) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    return NextResponse.json(serialize(rows[0], tenant.userName), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to update this comment." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as CommentBody;
    const tenant = await resolveTenantFromRequest(request, body.projectKey);
    if (typeof body.id !== "string") return NextResponse.json({ error: "A comment is required." }, { status: 400 });
    const rows = await db.delete(figmaComments).where(and(eq(figmaComments.id, body.id), eq(figmaComments.organizationId, tenant.organizationId), eq(figmaComments.projectId, tenant.projectId), eq(figmaComments.authorUserId, tenant.userId))).returning({ id: figmaComments.id });
    if (!rows[0]) return NextResponse.json({ error: "Comment not found or cannot be deleted." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete this comment." }, { status: 400 });
  }
}
