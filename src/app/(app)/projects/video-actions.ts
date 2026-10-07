"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { issueDetailPath } from "@/lib/issues/url";
import { getIssueVideoView } from "@/lib/video/issue-video";
import { removeIssueVideo } from "@/lib/video/removal-service";
import type { IssueVideoView } from "@/lib/video/states";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type IssueVideoActionResult =
  | { ok: true; view: IssueVideoView }
  | { ok: false; message: string };

const scopeSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.uuid(),
  issueNumber: z.number().int().positive(),
});
const removeSchema = scopeSchema.extend({ videoAssetId: z.uuid() });

async function memberContext() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      ok: false as const,
      message:
        auth.reason === "unauthenticated"
          ? "Sign in to continue."
          : "This issue isn’t available.",
    };
  }
  return { ok: true as const, context: auth.context };
}

/** Removes a clip, or cancels an upload that hasn’t finished. */
export async function removeIssueVideoAction(input: unknown): Promise<IssueVideoActionResult> {
  const auth = await memberContext();
  if (!auth.ok) return auth;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This video isn’t available." };

  const result = await removeIssueVideo(auth.context, parsed.data);
  if (!result.ok) return result;
  revalidatePath(
    issueDetailPath(parsed.data.projectId, parsed.data.reviewId, parsed.data.issueNumber),
  );
  return result;
}

/** Reads the latest video state for an issue, for the page to refresh itself. */
export async function refreshIssueVideoAction(input: unknown): Promise<IssueVideoActionResult> {
  const auth = await memberContext();
  if (!auth.ok) return auth;
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This issue isn’t available." };
  try {
    const view = await getIssueVideoView(auth.context, parsed.data);
    if (!view) return { ok: false, message: "This issue isn’t available." };
    return { ok: true, view };
  } catch {
    return { ok: false, message: "We couldn’t check on this video. Try again." };
  }
}
