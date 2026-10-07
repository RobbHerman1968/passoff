import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { videoAnnotations, videoAssets } from "@/db/schema";
import { videoNoteVideoStateFor } from "@/lib/video/annotations/state";
import type { VideoNoteLink } from "@/lib/video/annotations/types";

/**
 * For a set of discussion comments, finds the ones that are notes on a video. The result
 * is keyed by comment id. Only comments the caller already chose to show are passed in, so
 * private notes can never appear here for a guest.
 */
export async function loadVideoNoteLinks(
  workspaceId: string,
  commentIds: string[],
): Promise<Map<string, VideoNoteLink>> {
  const links = new Map<string, VideoNoteLink>();
  if (commentIds.length === 0) return links;

  const rows = await db
    .select({
      commentId: videoAnnotations.commentId,
      annotationId: videoAnnotations.id,
      timestampMs: videoAnnotations.timestampMs,
      normalizedX: videoAnnotations.normalizedX,
      lifecycle: videoAssets.lifecycle,
      removalReason: videoAssets.removalReason,
    })
    .from(videoAnnotations)
    .innerJoin(videoAssets, eq(videoAssets.id, videoAnnotations.videoAssetId))
    .where(
      and(
        eq(videoAnnotations.workspaceId, workspaceId),
        inArray(videoAnnotations.commentId, commentIds),
      ),
    );

  for (const row of rows) {
    links.set(row.commentId, {
      annotationId: row.annotationId,
      timestampMs: row.timestampMs,
      hasPin: row.normalizedX != null,
      videoState: videoNoteVideoStateFor(row.lifecycle, row.removalReason),
    });
  }
  return links;
}
