"use server";

import { revalidatePath } from "next/cache";

import { decideGuestApproval } from "@/lib/approvals/service";
import { validateApprovalNote } from "@/lib/approvals/types";
import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import {
  resolveShareLinkToken,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";

export type GuestApprovalActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  /** The version changed or the request was replaced. The page should reload. */
  needsReload?: boolean;
  fieldErrors?: { name?: string; email?: string; note?: string };
  values?: { name?: string; email?: string; note?: string };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LINK_MESSAGES = {
  expired: "This review link has expired. Ask the team for a new link.",
  revoked: "This review link was turned off. Ask the team for a new link.",
  closed: "This review is closed, so it can’t be approved.",
  archived: "This review isn’t available anymore.",
  disabled: "Passoff is turned off for this website.",
  invalid: "This review link isn’t valid.",
} as const;

export async function decideApprovalFromLinkAction(
  _prev: GuestApprovalActionState,
  formData: FormData,
): Promise<GuestApprovalActionState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const note = String(formData.get("note") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const deploymentId = String(formData.get("deploymentId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const values = { name, email, note };

  if (decision !== "approved" && decision !== "changes_requested") {
    return {
      status: "error",
      message: "Choose whether to approve or request changes.",
      values,
    };
  }

  const fieldErrors: NonNullable<GuestApprovalActionState["fieldErrors"]> = {};
  if (name.length < 2) {
    fieldErrors.name = "Enter your name so the team knows who decided.";
  } else if (name.length > 120) {
    fieldErrors.name = "Use a shorter name.";
  }
  if (!email) {
    fieldErrors.email = "Enter your email so the team can follow up if needed.";
  } else if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    fieldErrors.email = "Enter a valid email address.";
  }
  const checkedNote = validateApprovalNote(decision, note);
  if (!checkedNote.ok) fieldErrors.note = checkedNote.message;

  if (!checkedNote.ok || fieldErrors.name || fieldErrors.email) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const resolved = await resolveShareLinkToken(token);
  if (!resolved.ok) {
    return { status: "error", message: LINK_MESSAGES[resolved.reason], values };
  }
  if (!resolved.canApprove) {
    return {
      status: "error",
      message:
        "This link lets you view and comment, but not approve. Ask the team for an approval link.",
      values,
    };
  }

  try {
    const fingerprint = await getRequestFingerprint();
    const limit = await enforceInstallationRateLimit({
      scope: "guest_approval_decide",
      subjects: [resolved.shareLinkId, fingerprint],
    });
    if (!limit.ok) {
      return {
        status: "error",
        message: "Too many attempts. Wait a few minutes and try again.",
        values,
      };
    }

    const guest = await upsertGuestIdentity({
      workspaceId: resolved.workspaceId,
      name,
      email,
    });

    const result = await decideGuestApproval(
      {
        workspaceId: resolved.workspaceId,
        reviewId: resolved.reviewId,
        shareLinkId: resolved.shareLinkId,
        guestIdentityId: guest.id,
        canApprove: resolved.canApprove,
      },
      {
        decision,
        note: checkedNote.note,
        deploymentId: UUID_PATTERN.test(deploymentId) ? deploymentId : null,
        requestId: UUID_PATTERN.test(requestId) ? requestId : null,
      },
    );

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
        needsReload: result.error === "stale_version" || result.error === "conflict",
        values,
      };
    }

    revalidatePath(`/r/${token}`);
    return {
      status: "success",
      message:
        decision === "approved"
          ? "Thanks. Your approval is recorded for this version."
          : "Thanks. Your requested changes were sent to the team.",
    };
  } catch {
    return {
      status: "error",
      message:
        "Passoff couldn’t save your decision. Your note is still here. Try again.",
      values,
    };
  }
}
