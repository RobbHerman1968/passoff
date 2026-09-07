import { NextResponse } from "next/server";

import { getWorkspaceNotificationEmail } from "@/lib/auth/tenant-membership";
import { clientIp, rateLimit } from "@/lib/rooms/rate-limit";
import {
  createPublicComment,
  listPublishedComments,
  listReleasedHandoffItems,
  recordShareView,
  resolveShareToken,
  submitPublicDecision,
  upsertReviewer,
} from "@/lib/rooms/service";
import { assetPublicUrl } from "@/lib/rooms/storage";
import { DEFAULT_APPROVAL_STATEMENT } from "@/lib/rooms/types";

export const runtime = "nodejs";

function sharePayload(token: string, resolved: Awaited<ReturnType<typeof resolveShareToken>>) {
  return {
    project: {
      id: resolved.project.id,
      name: resolved.project.name,
      clientName: resolved.project.clientName,
      status: resolved.project.status,
      handoffReleasedAt: resolved.project.handoffReleasedAt,
    },
    revision: {
      id: resolved.revision.id,
      number: resolved.revision.number,
      status: resolved.revision.status,
      contentDigest: resolved.revision.contentDigest,
      publishedAt: resolved.revision.publishedAt,
    },
    assets: resolved.membership.map((row) => ({
      revisionAssetId: row.revisionAssetId,
      sortOrder: row.sortOrder,
      id: row.asset.id,
      label: row.asset.label,
      kind: row.asset.kind,
      mime: row.asset.mime,
      width: row.asset.width,
      height: row.asset.height,
      externalUrl: row.asset.externalUrl,
      url: row.asset.objectKey
        ? `${assetPublicUrl(row.asset.id)}?token=${encodeURIComponent(token)}`
        : row.asset.externalUrl,
    })),
    approvalStatement: DEFAULT_APPROVAL_STATEMENT,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const resolved = await resolveShareToken(token);
    const [comments, handoff] = await Promise.all([
      listPublishedComments(resolved.revision.id),
      listReleasedHandoffItems(resolved.project.id),
    ]);
    return NextResponse.json(
      {
        ...sharePayload(token, resolved),
        comments: comments.map((c) => ({
          id: c.id,
          revisionAssetId: c.revisionAssetId,
          xPercent: Number(c.xPercent),
          yPercent: Number(c.yPercent),
          body: c.body,
          status: c.status,
          createdAt: c.createdAt,
        })),
        handoff: handoff.map((item) => ({
          ...item,
          downloadUrl: item.assetId
            ? `${assetPublicUrl(item.assetId)}?token=${encodeURIComponent(token)}&download=1`
            : item.externalUrl,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid share link." },
      { status: 404 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const limited = rateLimit(`public:${token}:${clientIp(request)}`, 60, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
      );
    }

    const body = (await request.json()) as {
      action?: unknown;
      name?: unknown;
      email?: unknown;
      revisionAssetId?: unknown;
      xPercent?: unknown;
      yPercent?: unknown;
      body?: unknown;
      decision?: unknown;
      acceptanceStatement?: unknown;
      confirmed?: unknown;
    };

    const resolved = await resolveShareToken(token);
    const action = typeof body.action === "string" ? body.action : "";
    const ownerNotify = await getWorkspaceNotificationEmail(resolved.link.workspaceId);

    if (action === "view") {
      await recordShareView(resolved.link.id, resolved.project.id, resolved.link.workspaceId);
      return NextResponse.json({ ok: true });
    }

    if (action === "identify" || action === "comment" || action === "decision") {
      const reviewer = await upsertReviewer({
        workspaceId: resolved.link.workspaceId,
        projectId: resolved.project.id,
        name: typeof body.name === "string" ? body.name : "",
        email: typeof body.email === "string" ? body.email : "",
      });

      if (action === "identify") {
        return NextResponse.json({
          reviewer: { id: reviewer.id, name: reviewer.name, email: reviewer.email },
        });
      }

      if (action === "comment") {
        const comment = await createPublicComment({
          workspaceId: resolved.link.workspaceId,
          projectId: resolved.project.id,
          revisionId: resolved.revision.id,
          revisionAssetId: typeof body.revisionAssetId === "string" ? body.revisionAssetId : "",
          reviewerId: reviewer.id,
          xPercent: typeof body.xPercent === "number" ? body.xPercent : Number(body.xPercent),
          yPercent: typeof body.yPercent === "number" ? body.yPercent : Number(body.yPercent),
          body: typeof body.body === "string" ? body.body : "",
          projectName: resolved.project.name,
          clientName: resolved.project.clientName,
          reviewerName: reviewer.name,
          notifyTo: ownerNotify,
        });
        return NextResponse.json(
          {
            comment,
            notification: ownerNotify
              ? { status: "queued" }
              : { status: "skipped", reason: "no_owner_email" },
          },
          { status: 201 },
        );
      }

      if (action === "decision") {
        if (resolved.link.scope === "view_only") {
          return NextResponse.json({ error: "This link is view-only." }, { status: 403 });
        }
        const decision = body.decision === "request_changes" ? "request_changes" : "approve";
        if (decision === "approve" && body.confirmed !== true) {
          return NextResponse.json(
            { error: "Confirm approval in a second step.", requiresConfirmation: true },
            { status: 400 },
          );
        }
        const result = await submitPublicDecision({
          workspaceId: resolved.link.workspaceId,
          projectId: resolved.project.id,
          revisionId: resolved.revision.id,
          reviewerId: reviewer.id,
          decision,
          acceptanceStatement:
            typeof body.acceptanceStatement === "string" ? body.acceptanceStatement : undefined,
          notifyTo: ownerNotify,
          reviewerEmail: reviewer.email,
          reviewerName: reviewer.name,
        });
        return NextResponse.json({
          ...result,
          notification: ownerNotify
            ? { status: "queued" }
            : { status: "skipped", reason: "no_owner_email" },
        });
      }
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed." },
      { status: 400 },
    );
  }
}
