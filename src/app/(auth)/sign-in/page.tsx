import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuthDestination } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Passoff to manage website reviews and issues.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const destination = await requireAuthDestination();
  if (destination) {
    redirect(destination);
  }

  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined,
  );
  const notice =
    params.notice === "account-deleted"
      ? "Your account was deleted. We’re sorry to see you go."
      : undefined;
  const oauthError =
    typeof params.error === "string" && params.error.length > 0;

  return (
    <AuthCard
      title="Sign in"
      description="Use your email and password, or continue with Google or GitHub."
    >
      <SignInForm
        callbackUrl={callbackUrl}
        oauthError={oauthError}
        notice={notice}
        signUpHref={
          callbackUrl.startsWith("/invite/")
            ? `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
            : "/sign-up"
        }
        oauthButtons={<OAuthButtons callbackUrl={callbackUrl} />}
      />
    </AuthCard>
  );
}
