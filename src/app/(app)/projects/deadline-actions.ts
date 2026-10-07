"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setReviewFeedbackDeadline } from "@/lib/reviews/deadline";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

const idSchema = z.string().uuid();

export async function setReviewDeadlineAction(input: {
  projectId: string;
  reviewId: string;
  deadline: string | null;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }

  const projectId = idSchema.safeParse(input.projectId);
  const reviewId = idSchema.safeParse(input.reviewId);
  if (!projectId.success || !reviewId.success) {
    return { ok: false as const, message: "This review isn’t available." };
  }

  const result = await setReviewFeedbackDeadline(auth.context, {
    projectId: projectId.data,
    reviewId: reviewId.data,
    deadline: input.deadline,
  });

  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }

  revalidatePath(`/projects/${projectId.data}/reviews/${reviewId.data}`);
  revalidatePath(`/projects/${projectId.data}`);
  return {
    ok: true as const,
    deadline: result.deadline?.toISOString() ?? null,
    changed: result.changed,
  };
}
