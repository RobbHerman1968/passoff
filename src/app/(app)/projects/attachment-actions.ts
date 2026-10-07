"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  attachAssetToIssue,
  detachAttachmentFromIssue,
  setAttachmentVisibility,
  type AttachmentMutationResult,
} from "@/lib/attachments/service";
import type { AttachmentView } from "@/lib/attachments/types";
import { issueDetailPath } from "@/lib/issues/url";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type IssueAttachmentActionResult =
  | { ok: true; attachments: AttachmentView[] }
  | { ok: false; message: string };

const scopeSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.uuid(),
  issueNumber: z.number().int().positive(),
});
const attachSchema = scopeSchema.extend({
  assetId: z.uuid(),
  isPrivate: z.boolean(),
});
const detachSchema = scopeSchema.extend({ assetId: z.uuid() });

const CHECK_MESSAGE = "Check this file and try again.";

async function context() {
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

function finish(
  result: AttachmentMutationResult,
  loc: { projectId: string; reviewId: string; issueNumber: number },
): IssueAttachmentActionResult {
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath(issueDetailPath(loc.projectId, loc.reviewId, loc.issueNumber));
  return { ok: true, attachments: result.attachments };
}

export async function attachFileToIssueAction(
  input: unknown,
): Promise<IssueAttachmentActionResult> {
  const auth = await context();
  if (!auth.ok) return auth;
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_MESSAGE };
  return finish(await attachAssetToIssue(auth.context, parsed.data), parsed.data);
}

export async function setAttachmentVisibilityAction(
  input: unknown,
): Promise<IssueAttachmentActionResult> {
  const auth = await context();
  if (!auth.ok) return auth;
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_MESSAGE };
  return finish(await setAttachmentVisibility(auth.context, parsed.data), parsed.data);
}

export async function removeIssueAttachmentAction(
  input: unknown,
): Promise<IssueAttachmentActionResult> {
  const auth = await context();
  if (!auth.ok) return auth;
  const parsed = detachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_MESSAGE };
  return finish(await detachAttachmentFromIssue(auth.context, parsed.data), parsed.data);
}
