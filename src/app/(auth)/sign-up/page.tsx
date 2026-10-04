import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuthDestination } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Passoff account to start reviewing websites and videos.",
};

export default async function SignUpPage() {
  const destination = await requireAuthDestination();
  if (destination) {
    redirect(destination);
  }

  return (
    <AuthCard
      title="Create account"
      description="Start with your details, or continue with Google or GitHub."
    >
      <SignUpForm oauthButtons={<OAuthButtons callbackUrl="/onboarding" />} />
    </AuthCard>
  );
}
