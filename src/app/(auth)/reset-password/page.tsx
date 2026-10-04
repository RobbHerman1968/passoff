import type { Metadata } from "next";
import Link from "next/link";

import { getResetTokenViewState } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new Passoff password.",
};

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  // Allow signed-in visitors so a used/expired link can still explain what happened.
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    return (
      <AuthCard title="Reset password">
        <InvalidResetLink />
      </AuthCard>
    );
  }

  // Checking link state before rendering the form.
  const status = await getResetTokenViewState(token);

  if (status.status !== "valid") {
    return (
      <AuthCard title="Reset password">
        <InvalidResetLink />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset password"
      description="Choose a new password for your Passoff account."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}

function InvalidResetLink() {
  return (
    <div className="grid gap-6">
      <FormAlert
        title="This reset link is no longer valid."
        description="Request a new reset link, or return to sign in."
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/forgot-password">Request a new reset link</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Return to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
