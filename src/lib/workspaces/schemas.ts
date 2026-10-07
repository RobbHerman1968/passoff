import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/email";
import { zodFieldErrors, type FieldErrors } from "@/lib/auth/schemas";

export { zodFieldErrors, type FieldErrors };

export const WORKSPACE_NAME_MAX_LENGTH = 80;
export const INVITATION_TTL_DAYS = 7;
export const INVITATION_MIN_RESEND_INTERVAL_MS = 60 * 1000;
export const INVITATION_MAX_SENDS = 8;
export const WORKSPACE_PURGE_DELAY_DAYS = 30;

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a workspace name.")
  .max(
    WORKSPACE_NAME_MAX_LENGTH,
    `Enter a shorter workspace name (up to ${WORKSPACE_NAME_MAX_LENGTH} characters).`,
  );

export const renameWorkspaceSchema = z.object({
  name: workspaceNameSchema,
});

export const inviteEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter an email address.")
  .max(320, "Enter a valid email address.")
  .email("Enter a valid email address.")
  .transform(normalizeEmail);

export const inviteMemberSchema = z.object({ email: inviteEmailSchema });

export const idSchema = z.string().uuid();

export const profileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Enter your first name.")
    .max(60, "Enter a shorter first name."),
  lastName: z
    .string()
    .trim()
    .min(1, "Enter your last name.")
    .max(60, "Enter a shorter last name."),
});

/** Hide most of an email address so a leaked link does not reveal who was invited. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "an email address";
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
