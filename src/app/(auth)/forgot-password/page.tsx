import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuthDestination } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a Passoff password reset link.",
};

export default async function ForgotPasswordPage() {
  const destination = await requireAuthDestination();
  if (destination) {
    redirect(destination);
  }

  return (
    <AuthCard
      title="Forgot password"
      description="Enter your email and we’ll send a reset link if an account matches."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
