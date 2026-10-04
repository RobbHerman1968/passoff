"use server";

import { redirect } from "next/navigation";

import {
  buildWebsiteLaunchUrl,
  createSdkExchangeCode,
  resolveShareLinkToken,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { normalizeOrigin } from "@/lib/installations/origin";

export type LaunchActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    name?: string;
    email?: string;
  };
  values?: {
    name?: string;
    email?: string;
  };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function openWebsiteReviewAction(
  _prev: LaunchActionState,
  formData: FormData,
): Promise<LaunchActionState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const values = { name, email };
  const fieldErrors: LaunchActionState["fieldErrors"] = {};

  if (!name || name.length < 2) {
    fieldErrors.name = "Enter your name so the team knows who left feedback.";
  } else if (name.length > 120) {
    fieldErrors.name = "Use a shorter name.";
  }

  if (!email) {
    fieldErrors.email = "Enter your email so the team can follow up if needed.";
  } else if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (fieldErrors.name || fieldErrors.email) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const resolved = await resolveShareLinkToken(token);
  if (!resolved.ok) {
    const message =
      resolved.reason === "expired"
        ? "This review link has expired. Ask the team for a new link."
        : resolved.reason === "revoked"
          ? "This review link was turned off. Ask the team for a new link."
          : resolved.reason === "closed"
            ? "This review is closed."
            : resolved.reason === "archived"
              ? "This review isn’t available anymore."
              : resolved.reason === "disabled"
                ? "Passoff is turned off for this website."
                : "This review link isn’t valid.";
    return { status: "error", message, values };
  }

  let startingOrigin: string | null = null;
  try {
    startingOrigin = new URL(resolved.startingUrl).origin;
  } catch {
    startingOrigin = null;
  }
  const allowedOrigin = normalizeOrigin(startingOrigin);
  if (
    !allowedOrigin.ok ||
    !resolved.allowedOrigins.some((item) => {
      const candidate = normalizeOrigin(item);
      return candidate.ok && candidate.origin === allowedOrigin.origin;
    })
  ) {
    return {
      status: "error",
      message: "This website isn’t ready for review yet.",
      values,
    };
  }

  try {
    const guest = await upsertGuestIdentity({
      workspaceId: resolved.workspaceId,
      name,
      email,
    });

    const { rawCode } = await createSdkExchangeCode({
      workspaceId: resolved.workspaceId,
      reviewId: resolved.reviewId,
      shareLinkId: resolved.shareLinkId,
      guestIdentityId: guest.id,
      environmentId: resolved.environmentId,
      allowedOrigin: allowedOrigin.origin,
    });

    const launchUrl = buildWebsiteLaunchUrl(resolved.startingUrl, rawCode);
    redirect(launchUrl);
  } catch (error) {
    // redirect() throws — rethrow those.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      status: "error",
      message: "Passoff couldn’t open the review. Try again.",
      values,
    };
  }
}
