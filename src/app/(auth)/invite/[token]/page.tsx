import type { Metadata } from "next";

import { getValidSession } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { InvitationCard } from "@/components/workspaces/invitation-card";
import { enforceAuthRateLimit, formatRetryGuidance } from "@/lib/auth/rate-limit";
import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { inspectInvitation } from "@/lib/workspaces/invitations";

export const metadata: Metadata = {
  title: "Join a workspace",
  description: "Accept your invitation to a Passoff workspace.",
  // Invitation links are private.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const session = await getValidSession();
  const viewer =
    session?.user?.id && session.user.email
      ? { userId: session.user.id, email: session.user.email }
      : null;

  const rate = await enforceAuthRateLimit({
    scope: "invitation_lookup",
    subjects: [token.slice(0, 8), await getRequestFingerprint()],
  });
  if (!rate.ok) {
    return (
      <AuthCard title="Join a workspace">
        <FormAlert
          title="Too many tries"
          description={`We’ve checked this link too many times. ${formatRetryGuidance(rate.retryAfterSeconds)}`}
        />
      </AuthCard>
    );
  }

  const view = await inspectInvitation(token, viewer);

  return (
    <AuthCard
      title={view.status === "pending" ? "Join a workspace" : "Workspace invitation"}
      description={
        view.status === "pending"
          ? "Teammates work together on website reviews and sign-off."
          : undefined
      }
    >
      <InvitationCard
        view={view}
        token={token}
        signedIn={Boolean(viewer)}
        signedInEmail={viewer?.email}
      />
    </AuthCard>
  );
}
