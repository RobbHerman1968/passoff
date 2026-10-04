import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getValidSession } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { userHasActiveMembership } from "@/lib/auth/membership";

export const metadata: Metadata = {
  title: "Create your workspace",
  description: "Create a Passoff workspace to start projects and website reviews.",
};

export default async function OnboardingPage() {
  const session = await getValidSession();
  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/onboarding");
  }

  if (await userHasActiveMembership(session.user.id)) {
    redirect("/dashboard");
  }

  return (
    <AuthCard
      title="Create your workspace"
      description="A workspace is the shared home for your projects, reviews, and the people you work with."
    >
      <OnboardingForm />
    </AuthCard>
  );
}
