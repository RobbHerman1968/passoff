"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { deleteAccount, updateProfile } from "@/lib/account/service";
import { withNotice } from "@/lib/projects/notices";
import { forgetActiveWorkspace } from "@/lib/workspaces/active-workspace";
import { deleteWorkspace } from "@/lib/workspaces/deletion";
import {
  inviteMember,
  resendInvitation,
  revokeInvitation,
} from "@/lib/workspaces/invitations";
import {
  leaveWorkspace,
  removeMember,
  transferOwnership,
} from "@/lib/workspaces/members";
import {
  idSchema,
  type FieldErrors,
} from "@/lib/workspaces/schemas";
import { renameWorkspace } from "@/lib/workspaces/settings";
import {
  requireWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/workspaces/context";

export type SettingsActionResult = {
  status: "idle" | "success" | "error" | "forbidden" | "unavailable";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  /** Changes on every success so the form can react (clear fields, move focus). */
  nonce?: number;
};

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function requireContext(): Promise<
  | { ok: true; context: WorkspaceContext }
  | { ok: false; result: SettingsActionResult }
> {
  const auth = await requireWorkspaceContext();
  if (auth.ok) return { ok: true, context: auth.context };
  if (auth.reason === "unauthenticated") redirect("/sign-in");
  redirect("/onboarding");
}

function done(message: string): SettingsActionResult {
  return { status: "success", message, nonce: Date.now() };
}

function failed(
  error: string,
  message: string,
  extra: Partial<SettingsActionResult> = {},
): SettingsActionResult {
  return {
    status: error === "forbidden" ? "forbidden" : error === "unavailable" ? "unavailable" : "error",
    message,
    ...extra,
  };
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function renameWorkspaceAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const name = formString(formData, "name");
  const result = await renameWorkspace(auth.context, { name });
  if (!result.ok) {
    return failed(result.error, result.message, {
      fieldErrors: result.fieldErrors,
      values: { name },
    });
  }
  refresh();
  return { ...done("Workspace name updated."), values: { name: result.name } };
}

export async function inviteMemberAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const email = formString(formData, "email");
  const result = await inviteMember(auth.context, { email });
  if (!result.ok) {
    return failed(result.error, result.message, {
      fieldErrors: result.error === "invalid_email" ? { email: result.message } : undefined,
      values: { email },
    });
  }
  refresh();
  if (!result.emailSent) {
    return {
      status: "error",
      message: `The invitation for ${result.invitation.email} is saved, but we couldn’t send the email. Use “Resend invitation” to try again.`,
      nonce: Date.now(),
    };
  }
  return done(`Invitation sent to ${result.invitation.email}.`);
}

export async function resendInvitationAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const invitationId = idSchema.safeParse(formString(formData, "invitationId"));
  if (!invitationId.success) {
    return failed("error", "We couldn’t find that invitation. Refresh the page and try again.");
  }
  const result = await resendInvitation(auth.context, { invitationId: invitationId.data });
  if (!result.ok) return failed(result.error, result.message);
  refresh();
  return result.emailSent
    ? done(`Invitation sent again to ${result.email}. The earlier link no longer works.`)
    : failed("error", `We couldn’t email ${result.email}. Try again in a moment.`);
}

export async function revokeInvitationAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const invitationId = idSchema.safeParse(formString(formData, "invitationId"));
  if (!invitationId.success) {
    return failed("error", "We couldn’t find that invitation. Refresh the page and try again.");
  }
  const result = await revokeInvitation(auth.context, { invitationId: invitationId.data });
  if (!result.ok) return failed(result.error, result.message);
  refresh();
  return done(`Invitation for ${result.email} cancelled. Its link no longer works.`);
}

export async function removeMemberAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const memberUserId = idSchema.safeParse(formString(formData, "memberUserId"));
  if (!memberUserId.success) {
    return failed("error", "We couldn’t find that person. Refresh the page and try again.");
  }
  const result = await removeMember(auth.context, { memberUserId: memberUserId.data });
  if (!result.ok) return failed(result.error, result.message);
  refresh();
  return done(
    result.unassignedIssues > 0
      ? `${result.memberName} was removed. ${result.unassignedIssues} ${result.unassignedIssues === 1 ? "issue is" : "issues are"} now unassigned.`
      : `${result.memberName} was removed from the workspace.`,
  );
}

export async function transferOwnershipAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const newOwnerUserId = idSchema.safeParse(formString(formData, "newOwnerUserId"));
  if (!newOwnerUserId.success) {
    return failed("error", "We couldn’t find that person. Refresh the page and try again.");
  }
  const result = await transferOwnership(auth.context, { newOwnerUserId: newOwnerUserId.data });
  if (!result.ok) return failed(result.error, result.message);
  refresh();
  return done(`${result.newOwnerName} is now the workspace owner. You’re a member.`);
}

export async function leaveWorkspaceAction(): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const result = await leaveWorkspace(auth.context);
  if (!result.ok) return failed(result.error, result.message);
  await forgetActiveWorkspace();
  refresh();
  redirect(withNotice("/dashboard", "workspace-left"));
}

export async function deleteWorkspaceAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const confirmName = formString(formData, "confirmName");
  const result = await deleteWorkspace(auth.context, {
    workspaceId: formString(formData, "workspaceId"),
    confirmName,
  });
  if (!result.ok) {
    return failed(result.error, result.message, {
      fieldErrors: result.error === "confirm_mismatch" ? { confirmName: result.message } : undefined,
      values: { confirmName },
    });
  }
  await forgetActiveWorkspace();
  refresh();
  redirect(withNotice("/dashboard", "workspace-deleted"));
}

export async function updateProfileAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const values = {
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
  };
  const result = await updateProfile(auth.context.userId, values);
  if (!result.ok) {
    return failed(result.error, result.message, { fieldErrors: result.fieldErrors, values });
  }
  refresh();
  return { ...done("Your name was updated."), values };
}

export async function deleteAccountAction(
  _prev: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const auth = await requireContext();
  if (!auth.ok) return auth.result;
  const result = await deleteAccount(auth.context.userId, {
    password: formString(formData, "password"),
    confirmEmail: formString(formData, "confirmEmail"),
  });
  if (!result.ok) {
    return failed(result.error, result.message, {
      fieldErrors:
        result.error === "wrong_password"
          ? { password: result.message }
          : result.error === "wrong_email"
            ? { confirmEmail: result.message }
            : undefined,
    });
  }
  await forgetActiveWorkspace();
  await signOut({ redirectTo: "/sign-in?notice=account-deleted" });
  return done("Your account was deleted.");
}
