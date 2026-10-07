"use server";

import { z } from "zod";

import { recordVerification } from "@/lib/issues/service";
import { getIssueDetailForReview } from "@/lib/issues/list";
import { startVerificationRun, updateVerificationHookAllowlist } from "@/lib/verification/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";
import { VERIFICATION_CHECK_KINDS } from "@/lib/verification/contract";

const startSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  issueNumber: z.number().int().positive(),
  checks: z.array(z.enum(VERIFICATION_CHECK_KINDS)).min(1).max(3),
  namedHook: z.string().max(63).optional().nullable(),
});

export async function startVerificationChecksAction(input: z.infer<typeof startSchema>) {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      title: "Choose at least one check to run.",
      next: "Select visibility, overlap, or a named check.",
    };
  }
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      ok: false as const,
      title: "Sign in to run these checks.",
      next: "Sign in, then try again.",
    };
  }
  return startVerificationRun(auth.context, parsed.data);
}

const humanSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  issueNumber: z.number().int().positive(),
  outcome: z.enum(["passed", "failed"]),
  note: z.string().max(2_000).optional(),
  checkedUrl: z.string().max(2_000).optional(),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
});

export async function recordHumanVerificationAction(input: z.infer<typeof humanSchema>) {
  const parsed = humanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: "Choose whether the issue looks fixed.",
    };
  }
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to record verification." };
  }
  const issue = await getIssueDetailForReview(
    auth.context,
    parsed.data.projectId,
    parsed.data.reviewId,
    parsed.data.issueNumber,
  );
  if (!issue || issue === "unavailable") {
    return { ok: false as const, message: "This issue isn’t available." };
  }
  const result = await recordVerification(auth.context, {
    issueId: issue.id,
    method: "human",
    outcome: parsed.data.outcome,
    note: parsed.data.note,
    checkedUrl: parsed.data.checkedUrl,
    viewportWidth: parsed.data.viewportWidth,
    viewportHeight: parsed.data.viewportHeight,
  });
  if (!result.ok) {
    return {
      ok: false as const,
      message: result.message ?? "Passoff couldn’t save that verification.",
    };
  }
  return { ok: true as const };
}

const hooksSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  namesText: z.string().max(2_000),
});

export async function saveVerificationHooksAction(input: z.infer<typeof hooksSchema>) {
  const parsed = hooksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: "Use lowercase names like checkout-ready." };
  }
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to save named checks." };
  }
  const result = await updateVerificationHookAllowlist(auth.context, parsed.data);
  if (!result.ok) {
    return {
      ok: false as const,
      message:
        result.error === "forbidden"
          ? "You don’t have permission to change named checks."
          : "This review isn’t available.",
    };
  }
  return { ok: true as const, names: result.names };
}
