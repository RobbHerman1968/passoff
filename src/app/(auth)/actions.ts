"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { getValidSession, signIn, signOut } from "@/auth";
import { sanitizeCallbackUrl, sanitizePostSignUpUrl } from "@/lib/auth/callback-url";
import { userHasActiveMembership } from "@/lib/auth/membership";
import {
  inspectResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import {
  enforceAuthRateLimit,
  formatRetryGuidance,
} from "@/lib/auth/rate-limit";
import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import {
  forgotPasswordSchema,
  onboardingSchema,
  resetPasswordSchema,
  signUpSchema,
  zodFieldErrors,
  type FieldErrors,
} from "@/lib/auth/schemas";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createCredentialsUser } from "@/lib/auth/users";

export type ActionResult = {
  status: "idle" | "error" | "success" | "rate_limited" | "unavailable";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
};

const GENERIC_SIGN_IN_ERROR =
  "We couldn’t sign you in. Check your email and password and try again.";

const GENERIC_SIGN_UP_ERROR =
  "We couldn’t create your account. Check your details and try again.";

const FORGOT_ACCEPTED =
  "If an account matches that email, we’ll send a password reset link.";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInWithCredentialsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = formString(formData, "email");
  const password = formString(formData, "password");
  const callbackUrl = sanitizeCallbackUrl(formString(formData, "callbackUrl"));
  const fingerprint = await getRequestFingerprint();

  const rate = await enforceAuthRateLimit({
    scope: "credentials_sign_in",
    subjects: [email.trim().toLowerCase(), fingerprint],
  });

  if (!rate.ok) {
    return {
      status: "rate_limited",
      message: `Too many sign-in attempts. ${formatRetryGuidance(rate.retryAfterSeconds)}`,
      values: { email },
    };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
    return { status: "success" };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message: GENERIC_SIGN_IN_ERROR,
        values: { email },
      };
    }
    throw error;
  }
}

export async function signUpAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const values = {
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  };

  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
      },
    };
  }

  const fingerprint = await getRequestFingerprint();
  const rate = await enforceAuthRateLimit({
    scope: "sign_up",
    subjects: [parsed.data.email, fingerprint],
  });

  if (!rate.ok) {
    return {
      status: "rate_limited",
      message: `Too many signup attempts. ${formatRetryGuidance(rate.retryAfterSeconds)}`,
      values: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: values.email,
      },
    };
  }

  const created = await createCredentialsUser({
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (!created.ok) {
    return {
      status: "error",
      message: GENERIC_SIGN_UP_ERROR,
      values: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: values.email,
      },
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: sanitizePostSignUpUrl(formString(formData, "callbackUrl")),
    });
    return { status: "success" };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message: "Your account was created, but we couldn’t sign you in. Try signing in.",
        values: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: values.email,
        },
      };
    }
    throw error;
  }
}

export async function forgotPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = formString(formData, "email");
  const parsed = forgotPasswordSchema.safeParse({ email });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values: { email },
    };
  }

  const fingerprint = await getRequestFingerprint();
  const rate = await enforceAuthRateLimit({
    scope: "forgot_password",
    subjects: [parsed.data.email, fingerprint],
  });

  if (!rate.ok) {
    return {
      status: "rate_limited",
      message: `Too many reset requests. ${formatRetryGuidance(rate.retryAfterSeconds)}`,
      values: { email },
    };
  }

  try {
    await requestPasswordReset(parsed.data.email);
    return {
      status: "success",
      message: FORGOT_ACCEPTED,
      values: { email },
    };
  } catch {
    return {
      status: "unavailable",
      message: "We couldn’t send a reset link right now. Try again in a moment.",
      values: { email },
    };
  }
}

export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const values = {
    token: formString(formData, "token"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  };

  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const fingerprint = await getRequestFingerprint();
  const rate = await enforceAuthRateLimit({
    scope: "reset_password",
    subjects: [parsed.data.token.slice(0, 12), fingerprint],
  });

  if (!rate.ok) {
    return {
      status: "rate_limited",
      message: `Too many reset attempts. ${formatRetryGuidance(rate.retryAfterSeconds)}`,
    };
  }

  const result = await resetPasswordWithToken({
    rawToken: parsed.data.token,
    password: parsed.data.password,
  });

  if (result === "success") {
    return {
      status: "success",
      message: "Your password has been updated. Sign in with your new password.",
    };
  }

  if (result === "unavailable") {
    return {
      status: "unavailable",
      message: "We couldn’t update your password right now. Try again in a moment.",
    };
  }

  return {
    status: "error",
    message: "This reset link is no longer valid.",
  };
}

export async function createWorkspaceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getValidSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const workspaceName = formString(formData, "workspaceName");
  const parsed = onboardingSchema.safeParse({ workspaceName });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values: { workspaceName },
    };
  }

  const created = await createOwnerWorkspace({
    userId: session.user.id,
    workspaceName: parsed.data.workspaceName,
  });

  if (created.ok) {
    redirect("/dashboard");
  }

  if (created.reason === "already_onboarded") {
    redirect("/dashboard");
  }

  return {
    status: "unavailable",
    message: "We couldn’t create your workspace right now. Try again in a moment.",
    values: { workspaceName: parsed.data.workspaceName },
  };
}

export async function signOutAction(): Promise<ActionResult> {
  try {
    await signOut({ redirectTo: "/sign-in" });
    return { status: "success" };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return {
      status: "error",
      message: "We couldn’t sign you out. Try again.",
    };
  }
}

export async function getResetTokenViewState(token: string) {
  return inspectResetToken(token);
}

export async function requireAuthDestination() {
  const session = await getValidSession();
  if (!session?.user?.id) {
    return null;
  }

  const hasWorkspace = await userHasActiveMembership(session.user.id);
  return hasWorkspace ? "/dashboard" : "/onboarding";
}
