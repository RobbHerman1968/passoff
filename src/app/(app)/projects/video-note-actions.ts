"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import { issueDetailPath } from "@/lib/issues/url";
import {
  createVideoNote,
  listVideoNotesForMember,
  VIDEO_NOTE_MESSAGES,
} from "@/lib/video/annotations/service";
import type { VideoNoteView } from "@/lib/video/annotations/types";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type VideoNoteActionResult =
  | { ok: true; note: VideoNoteView; notes: VideoNoteView[] }
  | { ok: false; message: string };

export type VideoNotesRefreshResult =
  | { ok: true; notes: VideoNoteView[] }
  | { ok: false; message: string };

const scopeSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.uuid(),
  issueNumber: z.number().int().positive(),
});

const createSchema = scopeSchema.extend({
  videoAssetId: z.uuid(),
  timestampMs: z.number().finite().min(0).max(24 * 60 * 60 * 1000),
  x: z.number().finite().min(0).max(1).nullable().optional(),
  y: z.number().finite().min(0).max(1).nullable().optional(),
  body: z.string().max(ISSUE_COMMENT_MAX_LENGTH + 1_000),
  visibility: z.enum(["public", "private"]).default("public"),
});

async function memberContext() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      ok: false as const,
      message:
        auth.reason === "unauthenticated"
          ? "Sign in to continue."
          : VIDEO_NOTE_MESSAGES.notFound,
    };
  }
  return { ok: true as const, context: auth.context };
}

/** Adds a note at one moment of the issue's video. Works for the clip people see now. */
export async function createVideoNoteAction(input: unknown): Promise<VideoNoteActionResult> {
  const auth = await memberContext();
  if (!auth.ok) return auth;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the time and your note, then try again. Your text is still here.",
    };
  }

  const result = await createVideoNote(auth.context, parsed.data);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath(
    issueDetailPath(parsed.data.projectId, parsed.data.reviewId, parsed.data.issueNumber),
  );
  return { ok: true, note: result.note, notes: result.notes };
}

/** Reads every note on an issue again, for the page to stay current. */
export async function refreshVideoNotesAction(input: unknown): Promise<VideoNotesRefreshResult> {
  const auth = await memberContext();
  if (!auth.ok) return auth;
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: VIDEO_NOTE_MESSAGES.notFound };
  const result = await listVideoNotesForMember(auth.context, parsed.data);
  if (!result.ok) {
    return { ok: false, message: "We couldn’t load video notes. Try again." };
  }
  return { ok: true, notes: result.notes };
}
