"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { IssueHistoryEvent } from "@/lib/issues/history";
import { issueDetailPath } from "@/lib/issues/url";
import {
  attachLabelToIssue,
  createLabel,
  detachLabelFromIssue,
  type LabelMutationResult,
} from "@/lib/labels/service";
import { LABEL_COLORS, type LabelView } from "@/lib/labels/types";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type IssueLabelActionResult =
  | {
      ok: true;
      labels: LabelView[];
      event: IssueHistoryEvent | null;
      /** The label that was just created, when the person typed a new name. */
      createdLabel: LabelView | null;
    }
  | { ok: false; message: string };

const scopeSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.uuid(),
  issueNumber: z.number().int().positive(),
});

const attachSchema = scopeSchema.extend({ labelId: z.uuid() });
const detachSchema = attachSchema;
const createAndAttachSchema = scopeSchema.extend({
  name: z.string().max(200),
  color: z.enum(LABEL_COLORS).optional(),
});

const CHECK_MESSAGE = "Check this label and try again.";

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
  result: LabelMutationResult,
  loc: { projectId: string; reviewId: string; issueNumber: number },
  createdLabel: LabelView | null = null,
): IssueLabelActionResult {
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath(issueDetailPath(loc.projectId, loc.reviewId, loc.issueNumber));
  return { ok: true, labels: result.labels, event: result.event, createdLabel };
}

export async function addIssueLabelAction(input: unknown): Promise<IssueLabelActionResult> {
  const auth = await context();
  if (!auth.ok) return auth;
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_MESSAGE };
  return finish(await attachLabelToIssue(auth.context, parsed.data), parsed.data);
}

export async function removeIssueLabelAction(
  input: unknown,
): Promise<IssueLabelActionResult> {
  const auth = await context();
  if (!auth.ok) return auth;
  const parsed = detachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_MESSAGE };
  return finish(await detachLabelFromIssue(auth.context, parsed.data), parsed.data);
}

/** Create a label (or reuse one with the same name) and add it to the issue. */
export async function createAndAddIssueLabelAction(
  input: unknown,
): Promise<IssueLabelActionResult> {
  const auth = await context();
  if (!auth.ok) return auth;
  const parsed = createAndAttachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_MESSAGE };

  const created = await createLabel(auth.context, {
    name: parsed.data.name,
    color: parsed.data.color,
  });
  if (!created.ok) return { ok: false, message: created.message };

  const attached = await attachLabelToIssue(auth.context, {
    projectId: parsed.data.projectId,
    reviewId: parsed.data.reviewId,
    issueNumber: parsed.data.issueNumber,
    labelId: created.label.id,
  });
  return finish(attached, parsed.data, created.created ? created.label : null);
}
