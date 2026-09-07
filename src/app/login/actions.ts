"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { createPasswordUser } from "@/lib/auth/password";
import { createPrivateTenantForUser } from "@/lib/auth/tenant-membership";

export type AuthFormState = {
  error?: string;
  mode?: "signin" | "signup";
};

export async function credentialsSignIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required.", mode: "signin" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: error.type === "CredentialsSignin" ? "Invalid email or password." : "Sign-in failed. Try again.",
        mode: "signin",
      };
    }
    throw error;
  }

  return { mode: "signin" };
}

export async function credentialsSignUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") || "");
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");

  try {
    const user = await createPasswordUser({ email, password, name });
    await createPrivateTenantForUser(user.id);
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try signing in.", mode: "signin" };
    }
    return {
      error: error instanceof Error ? error.message : "Unable to create account.",
      mode: "signup",
    };
  }

  return { mode: "signup" };
}

export async function googleSignIn(formData: FormData) {
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");
  try {
    await signIn("google", { redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}

export async function githubSignIn(formData: FormData) {
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");
  try {
    await signIn("github", { redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}
