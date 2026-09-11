import { NextResponse } from "next/server";

import { getWorkspaceNotificationEmail } from "@/lib/auth/tenant-membership";
import { clientIp, rateLimit } from "@/lib/rooms/rate-limit";
import {
  createPublicComment,
  createReviewer,
  getReviewerById,
  listApprovalReceiptsForRoom,
  listPublishedDesignerNotes,
  listPublishedComments,
  listReleasedHandoffItems,
  recordShareView,
  resolveShareToken,
  submitPublicDecision,
  updatePublicComment,
  updateSessionReviewerProfile,
} from "@/lib/rooms/service";
import {
  REVIEWER_SESSION_COOKIE,
  ReviewerSessionError,
  createReviewerSessionToken,
  readReviewerSessionCookie,
  reviewerSessionCookieOptions,
  verifyReviewerSessionToken,
} from "@/lib/rooms/reviewer-session";
import { assetPublicUrl } from "@/lib/rooms/storage";
import { DEFAULT_APPROVAL_STATEMENT } from "@/lib/rooms/types";

export const runtime = "nodejs";

function sharePayload(token: string, resolved: Awaited<ReturnType<typeof resolveShareToken>>) {
  const assetTargets = resolved.membership.map((row) => ({
    type: "asset" as const,
    revisionAssetId: row.revisionAssetId,
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
  }));
  const designTargets = resolved.designMembership.flatMap((item) =>
    item.screens.map((screen) => ({
      type: "design_screen" as const,
      revisionDesignVersionId: item.id,
      designId: item.designId,
      designVersionId: item.designVersionId,
      designName: item.designName,
      versionNumber: item.versionNumber,
      screenId: screen.id,
      screenName: screen.name,
      width: screen.width,
      height: screen.height,
      previewUrl: screen.imageUrl
        ? `/api/public/${encodeURIComponent(token)}/design-previews/${encodeURIComponent(item.designVersionId)}/${encodeURIComponent(screen.id)}`
        : null,
    })),
  );
  const videoTargets = resolved.designMembership.flatMap((item) =>
    item.sourceType === "video" && item.video
      ? [{
          type: "video" as const,
          revisionDesignVersionId: item.id,
          designId: item.designId,
          designVersionId: item.designVersionId,
          designName: item.designName,
          versionNumber: item.versionNumber,
          durationMs: item.video.durationMs,
          width: item.video.width,
          height: item.video.height,
          mimeType: item.video.mimeType,
          playbackUrl: `/api/public/${encodeURIComponent(token)}/videos/${encodeURIComponent(item.designVersionId)}`,
        }]
      : [],
  );
  return {
    project: {
      id: resolved.project.id,
      name: resolved.project.name,
      clientName: resolved.project.clientName,
    },
    room: {
      id: resolved.room.id,
      name: resolved.room.name,
      status: resolved.room.status,
      handoffReleasedAt: resolved.room.handoffReleasedAt,
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
    designs: resolved.designMembership.map((item) => ({
      id: item.id,
      designId: item.designId,
      designVersionId: item.designVersionId,
      name: item.designName,
      versionNumber: item.versionNumber,
      screens: item.screens.map((screen) => ({
        id: screen.id,
        name: screen.name,
        width: screen.width,
        height: screen.height,
        url: screen.imageUrl
          ? `/api/public/${encodeURIComponent(token)}/design-previews/${encodeURIComponent(item.designVersionId)}/${encodeURIComponent(screen.id)}`
          : null,
      })),
    })),
    targets: [...assetTargets, ...designTargets, ...videoTargets],
    approvalStatement: DEFAULT_APPROVAL_STATEMENT,
  };
}

function attachReviewerSession(
  response: NextResponse,
  input: { shareToken: string; reviewerId: string; roomId: string },
) {
  const value = createReviewerSessionToken({
    reviewerId: input.reviewerId,
    roomId: input.roomId,
    shareToken: input.shareToken,
  });
  response.cookies.set(REVIEWER_SESSION_COOKIE, value, reviewerSessionCookieOptions(input.shareToken));
  return response;
}

function clearReviewerSession(response: NextResponse, shareToken: string) {
  response.cookies.set(REVIEWER_SESSION_COOKIE, "", {
    ...reviewerSessionCookieOptions(shareToken),
    maxAge: 0,
  });
  return response;
}

function statusFromError(error: unknown, fallback = 400) {
  if (error instanceof ReviewerSessionError) return error.status;
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return fallback;
}

function requireReviewerSession(
  request: Request,
  input: { roomId: string; shareToken: string },
) {
  const sessionToken = readReviewerSessionCookie(request.headers.get("cookie"));
  return verifyReviewerSessionToken(sessionToken, {
    roomId: input.roomId,
    shareToken: input.shareToken,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const resolved = await resolveShareToken(token);
    const [comments, designerNotes, handoff, approvalReceipts] = await Promise.all([
      listPublishedComments(resolved.revision.id),
      listPublishedDesignerNotes(resolved.room, resolved.designMembership),
      listReleasedHandoffItems(resolved.room.id),
      listApprovalReceiptsForRoom(resolved.room.id, {
        includeReviewerEmail: false,
        decision: "approved",
      }),
    ]);
    const approvalReceipt =
      approvalReceipts.find((row) => !row.supersededAt) || approvalReceipts[0] || null;
    return NextResponse.json(
      {
        ...sharePayload(token, resolved),
        comments: comments.map((c) => ({
          id: c.id,
          revisionAssetId: c.revisionAssetId,
          revisionDesignVersionId: c.revisionDesignVersionId,
          screenId: c.designScreenId,
          videoTimeMs: c.videoTimeMs,
          reviewerId: c.reviewerId,
          xPercent: c.xPercent === null ? null : Number(c.xPercent),
          yPercent: c.yPercent === null ? null : Number(c.yPercent),
          body: c.body,
          status: c.status,
          createdAt: c.createdAt,
        })),
        designerNotes,
        handoff: handoff.map((item) => ({
          ...item,
          downloadUrl: item.assetId
            ? `${assetPublicUrl(item.assetId)}?token=${encodeURIComponent(token)}&download=1`
            : item.externalUrl,
        })),
        approvalReceipt,
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
      target?: unknown;
      commentId?: unknown;
      xPercent?: unknown;
      yPercent?: unknown;
      videoTimeMs?: unknown;
      body?: unknown;
      decision?: unknown;
      acceptanceStatement?: unknown;
      confirmed?: unknown;
    };

    const resolved = await resolveShareToken(token);
    const action = typeof body.action === "string" ? body.action : "";
    const ownerNotify = await getWorkspaceNotificationEmail(resolved.link.workspaceId);

    if (action === "view") {
      await recordShareView(resolved.link.id, resolved.room.id, resolved.link.workspaceId);
      return NextResponse.json({ ok: true });
    }

    if (action === "forget") {
      const response = NextResponse.json({ ok: true });
      return clearReviewerSession(response, token);
    }

    if (action === "identify") {
      // Session cookie is the only way to resume an existing reviewer.
      // Name/email never look up or claim another reviewer's identity.
      const sessionToken = readReviewerSessionCookie(request.headers.get("cookie"));
      let reviewer;
      let sessionReviewerId: string | null = null;
      if (sessionToken) {
        try {
          const session = verifyReviewerSessionToken(sessionToken, {
            roomId: resolved.room.id,
            shareToken: token,
          });
          sessionReviewerId = session.reviewerId;
        } catch {
          sessionReviewerId = null;
        }
      }

      if (sessionReviewerId) {
        const name = typeof body.name === "string" ? body.name : "";
        const email = typeof body.email === "string" ? body.email : "";
        if (name.trim() && email.trim()) {
          reviewer = await updateSessionReviewerProfile({
            workspaceId: resolved.link.workspaceId,
            roomId: resolved.room.id,
            reviewerId: sessionReviewerId,
            name,
            email,
          });
        } else {
          reviewer = await getReviewerById({
            workspaceId: resolved.link.workspaceId,
            roomId: resolved.room.id,
            reviewerId: sessionReviewerId,
          });
        }
      } else {
        reviewer = await createReviewer({
          workspaceId: resolved.link.workspaceId,
          roomId: resolved.room.id,
          name: typeof body.name === "string" ? body.name : "",
          email: typeof body.email === "string" ? body.email : "",
        });
      }

      const response = NextResponse.json({
        reviewer: { id: reviewer.id, name: reviewer.name, email: reviewer.email },
        // Browser/session identity only — email is not verified.
        identity: "session",
      });
      return attachReviewerSession(response, {
        shareToken: token,
        reviewerId: reviewer.id,
        roomId: resolved.room.id,
      });
    }

    if (action === "edit_comment" || action === "comment" || action === "decision") {
      const session = requireReviewerSession(request, {
        roomId: resolved.room.id,
        shareToken: token,
      });
      const reviewer = await getReviewerById({
        workspaceId: resolved.link.workspaceId,
        roomId: resolved.room.id,
        reviewerId: session.reviewerId,
      });

      if (action === "edit_comment") {
        const comment = await updatePublicComment({
          workspaceId: resolved.link.workspaceId,
          roomId: resolved.room.id,
          revisionId: resolved.revision.id,
          commentId: typeof body.commentId === "string" ? body.commentId : "",
          reviewerId: session.reviewerId,
          body: typeof body.body === "string" ? body.body : "",
        });
        const response = NextResponse.json({ comment });
        return attachReviewerSession(response, {
          shareToken: token,
          reviewerId: session.reviewerId,
          roomId: resolved.room.id,
        });
      }

      if (action === "comment") {
        const targetValue =
          body.target && typeof body.target === "object"
            ? body.target as Record<string, unknown>
            : null;
        const target = targetValue?.type === "video"
          && typeof targetValue.revisionDesignVersionId === "string"
          && typeof targetValue.videoTimeMs === "number"
          ? {
              type: "video" as const,
              revisionDesignVersionId: targetValue.revisionDesignVersionId,
              videoTimeMs: targetValue.videoTimeMs,
            }
          : targetValue?.type === "design_screen"
          && typeof targetValue.revisionDesignVersionId === "string"
          && typeof targetValue.screenId === "string"
          ? {
              type: "design_screen" as const,
              revisionDesignVersionId: targetValue.revisionDesignVersionId,
              screenId: targetValue.screenId,
            }
          : typeof body.revisionAssetId === "string"
            ? { type: "asset" as const, revisionAssetId: body.revisionAssetId }
            : null;
        if (!target) {
          return NextResponse.json({ error: "A valid review target is required." }, { status: 400 });
        }
        const comment = await createPublicComment({
          workspaceId: resolved.link.workspaceId,
          roomId: resolved.room.id,
          revisionId: resolved.revision.id,
          target,
          reviewerId: session.reviewerId,
          xPercent: typeof body.xPercent === "number" ? body.xPercent : undefined,
          yPercent: typeof body.yPercent === "number" ? body.yPercent : undefined,
          body: typeof body.body === "string" ? body.body : "",
          projectName: resolved.project.name,
          clientName: resolved.project.clientName,
          reviewerName: reviewer.name,
          notifyTo: ownerNotify,
        });
        const response = NextResponse.json(
          {
            comment,
            notification: ownerNotify
              ? { status: "queued" }
              : { status: "skipped", reason: "no_owner_email" },
          },
          { status: 201 },
        );
        return attachReviewerSession(response, {
          shareToken: token,
          reviewerId: session.reviewerId,
          roomId: resolved.room.id,
        });
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
          roomId: resolved.room.id,
          revisionId: resolved.revision.id,
          reviewerId: session.reviewerId,
          decision,
          acceptanceStatement:
            typeof body.acceptanceStatement === "string" ? body.acceptanceStatement : undefined,
          notifyTo: ownerNotify,
          reviewerEmail: reviewer.email,
          reviewerName: reviewer.name,
        });
        const response = NextResponse.json({
          ...result,
          notification: ownerNotify
            ? { status: "queued" }
            : { status: "skipped", reason: "no_owner_email" },
        });
        return attachReviewerSession(response, {
          shareToken: token,
          reviewerId: session.reviewerId,
          roomId: resolved.room.id,
        });
      }
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed." },
      { status: statusFromError(error) },
    );
  }
}
