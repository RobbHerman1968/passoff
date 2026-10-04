import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/email";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(320, "Enter a valid email address.")
  .email("Enter a valid email address.")
  .transform(normalizeEmail);

const passwordSchema = z
  .string()
  .min(1, "Enter a password.")
  .superRefine((value, ctx) => {
    const policyError = validatePasswordPolicy(value);
    if (policyError) {
      ctx.addIssue({ code: "custom", message: policyError });
    }
  });

export const credentialsSignInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(PASSWORD_MAX_LENGTH, `Enter a password with at most ${PASSWORD_MAX_LENGTH} characters.`),
});

const personNamePart = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(60, `Enter a shorter ${label}.`);

export const signUpSchema = z
  .object({
    firstName: personNamePart("first name"),
    lastName: personNamePart("last name"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "This reset link is no longer valid."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const onboardingSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(80, "Enter a shorter workspace name."),
});

export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_POLICY_HINT };

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
