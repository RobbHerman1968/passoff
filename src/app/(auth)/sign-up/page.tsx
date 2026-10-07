import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuthDestination } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { sanitizePostSignUpUrl } from "@/lib/auth/callback-url";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Passoff account to start reviewing websites and videos.",
};

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const destination = await requireAuthDestination();
  if (destination) {
    redirect(destination);
  }

  const params = await searchParams;
  const callbackUrl = sanitizePostSignUpUrl(
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined,
  );
  const fromInvitation = callbackUrl !== "/onboarding";

  return (
    <AuthCard
      title="Create account"
      description={
        fromInvitation
          ? "Create an account with the email address that was invited, and you’ll join the workspace next."
          : "Start with your details, or continue with Google or GitHub."
      }
    >
      <SignUpForm
        callbackUrl={callbackUrl}
        signInHref={fromInvitation ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-in"}
        oauthButtons={<OAuthButtons callbackUrl={callbackUrl} />}
      />
    </AuthCard>
  );
}
