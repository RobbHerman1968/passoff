import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { issueEvidence, issues, videoAssets } from "@/db/schema";
import {
  resolveGuestReviewSession,
  type GuestReviewSession,
} from "@/lib/reviews/guest-session";
import {
  userMessageForVideoFailure,
  userMessageForVideoProcessing,
} from "@/lib/video/failure-reasons";
import { MuxConfigurationError, signMuxPlaybackTokens } from "@/lib/video/mux";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type PlaybackTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
};

export type PlaybackAuthorizationResult =
  | {
      ok: true;
      playbackId: string;
      tokens: PlaybackTokens;
      expiresInSeconds: number;
    }
  | {
      ok: false;
      status: 401 | 403 | 404 | 409 | 503;
      code:
        | "unauthenticated"
        | "permission_denied"
        | "not_found"
        | "processing"
        | "failed"
        | "needs_attention"
        | "unavailable"
        | "misconfigured";
      message: string;
    };

type VideoPlaybackRow = {
  id: string;
  workspaceId: string;
  reviewId: string;
  processingStatus: string;
  failureReason: string | null;
  providerPlaybackId: string | null;
  evidenceStatus: string | null;
};

async function loadVideoForWorkspace(
  videoAssetId: string,
  workspaceId: string,
  reviewId?: string,
): Promise<VideoPlaybackRow | null> {
  const conditions = [
    eq(videoAssets.id, videoAssetId),
    eq(videoAssets.workspaceId, workspaceId),
    eq(issues.workspaceId, workspaceId),
  ];
  if (reviewId) {
    conditions.push(eq(issues.reviewId, reviewId));
  }

  const [row] = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      reviewId: issues.reviewId,
      processingStatus: videoAssets.processingStatus,
      failureReason: videoAssets.failureReason,
      providerPlaybackId: videoAssets.providerPlaybackId,
      evidenceStatus: issueEvidence.captureStatus,
    })
    .from(videoAssets)
    .innerJoin(
      issueEvidence,
      and(
        eq(issueEvidence.id, videoAssets.evidenceId),
        eq(issueEvidence.workspaceId, videoAssets.workspaceId),
      ),
    )
    .innerJoin(
      issues,
      and(eq(issues.id, issueEvidence.issueId), eq(issues.workspaceId, videoAssets.workspaceId)),
    )
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

function notPlayableResult(video: VideoPlaybackRow): PlaybackAuthorizationResult {
  if (video.processingStatus === "processing" || video.processingStatus === "uploading") {
    return {
      ok: false,
      status: 409,
      code: "processing",
      message: userMessageForVideoProcessing(),
    };
  }

  if (video.processingStatus === "needs_attention") {
    return {
      ok: false,
      status: 409,
      code: "needs_attention",
      message: userMessageForVideoFailure(video.failureReason),
    };
  }

  if (video.processingStatus === "failed") {
    return {
      ok: false,
      status: 409,
      code: "failed",
      message: userMessageForVideoFailure(video.failureReason),
    };
  }

  if (
    video.processingStatus !== "ready" ||
    video.evidenceStatus !== "ready" ||
    !video.providerPlaybackId
  ) {
    return {
      ok: false,
      status: 409,
      code: "unavailable",
      message: "This video isn’t ready to play yet.",
    };
  }

  return {
    ok: false,
    status: 404,
    code: "not_found",
    message: "This video isn’t available.",
  };
}

async function issueTokens(playbackId: string): Promise<PlaybackAuthorizationResult> {
  try {
    const tokens = await signMuxPlaybackTokens(playbackId);
    return {
      ok: true,
      playbackId,
      tokens,
      expiresInSeconds: 15 * 60,
    };
  } catch (error) {
    if (error instanceof MuxConfigurationError) {
      return {
        ok: false,
        status: 503,
        code: "misconfigured",
        message: "Video playback isn’t available right now. Try again later.",
      };
    }
    return {
      ok: false,
      status: 503,
      code: "unavailable",
      message: "We couldn’t start playback. Try again.",
    };
  }
}

export async function authorizeVideoPlayback(
  request: Request,
  videoAssetId: string,
): Promise<PlaybackAuthorizationResult> {
  const member = await requireWorkspaceContext();
  const guest = await resolveGuestReviewSession(request);

  if (member.ok) {
    const video = await loadVideoForWorkspace(videoAssetId, member.context.workspaceId);
    if (!video) {
      // Fall through to guest path when the member has a guest cookie for another review.
      if (guest.ok) {
        return authorizeGuestPlayback(guest.session, videoAssetId);
      }
      return {
        ok: false,
        status: 404,
        code: "not_found",
        message: "This video isn’t available.",
      };
    }

    const blocked = notPlayableResult(video);
    if (
      video.processingStatus !== "ready" ||
      video.evidenceStatus !== "ready" ||
      !video.providerPlaybackId
    ) {
      return blocked;
    }

    return issueTokens(video.providerPlaybackId);
  }

  if (guest.ok) {
    return authorizeGuestPlayback(guest.session, videoAssetId);
  }

  if (guest.reason === "revoked" || guest.reason === "expired") {
    return {
      ok: false,
      status: 403,
      code: "permission_denied",
      message:
        guest.reason === "revoked"
          ? "This review link is no longer active, so the video can’t be played."
          : "This review session has ended, so the video can’t be played.",
    };
  }

  if (guest.reason === "invalid") {
    return {
      ok: false,
      status: 403,
      code: "permission_denied",
      message: "You don’t have access to play this video.",
    };
  }

  return {
    ok: false,
    status: 401,
    code: "unauthenticated",
    message: "Sign in or open a shared review link to play this video.",
  };
}

async function authorizeGuestPlayback(
  session: GuestReviewSession,
  videoAssetId: string,
): Promise<PlaybackAuthorizationResult> {
  const video = await loadVideoForWorkspace(
    videoAssetId,
    session.workspaceId,
    session.reviewId,
  );
  if (!video) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "This video isn’t available.",
    };
  }

  if (
    video.processingStatus !== "ready" ||
    video.evidenceStatus !== "ready" ||
    !video.providerPlaybackId
  ) {
    return notPlayableResult(video);
  }

  return issueTokens(video.providerPlaybackId);
}
