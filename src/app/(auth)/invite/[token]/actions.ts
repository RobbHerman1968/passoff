"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getValidSession, signOut } from "@/auth";
import { enforceAuthRateLimit, formatRetryGuidance } from "@/lib/auth/rate-limit";
import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { withNotice } from "@/lib/projects/notices";
import { rememberActiveWorkspace } from "@/lib/workspaces/active-workspace";
import { acceptInvitation } from "@/lib/workspaces/invitations";

export type AcceptInvitationActionResult = {
  status: "idle" | "error";
  message?: string;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function invitePath(token: string) {
  return `/invite/${token}`;
}

export async function acceptInvitationAction(
  _prev: AcceptInvitationActionResult,
  formData: FormData,
): Promise<AcceptInvitationActionResult> {
  const rawToken = formData.get("token");
  const token = typeof rawToken === "string" ? rawToken : "";
  if (!TOKEN_PATTERN.test(token)) {
    return {
      status: "error",
      message: "This invitation link isn’t valid. Ask the workspace owner to send a new one.",
    };
  }

  const session = await getValidSession();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(invitePath(token))}`);
  }

  const rate = await enforceAuthRateLimit({
    scope: "invitation_lookup",
    subjects: [session.user.id, await getRequestFingerprint()],
  });
  if (!rate.ok) {
    return {
      status: "error",
      message: `Too many tries. ${formatRetryGuidance(rate.retryAfterSeconds)}`,
    };
  }

  const result = await acceptInvitation({ userId: session.user.id }, token);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  await rememberActiveWorkspace(session.user.id, result.workspaceId);
  revalidatePath("/", "layout");
  redirect(withNotice("/dashboard", "workspace-joined"));
}

/** For someone signed in with the wrong account: sign out, then come back to this invitation. */
export async function switchAccountForInvitationAction(formData: FormData): Promise<void> {
  const rawToken = formData.get("token");
  const token = typeof rawToken === "string" ? rawToken : "";
  if (!TOKEN_PATTERN.test(token)) {
    redirect("/sign-in");
  }
  await signOut({
    redirectTo: `/sign-in?callbackUrl=${encodeURIComponent(invitePath(token))}`,
  });
}
