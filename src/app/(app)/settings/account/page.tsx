import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { DeleteAccountSection } from "@/components/workspaces/delete-account-section";
import { LeaveWorkspaceSection } from "@/components/workspaces/leave-workspace-section";
import { ProfileForm } from "@/components/workspaces/profile-form";
import {
  getAccountOverview,
  listAccountDeletionBlockers,
  listSoleOwnedWorkspaces,
} from "@/lib/account/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Your account",
  description: "Update your name, leave a workspace, or delete your account.",
};

export default async function AccountSettingsPage() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/settings/account");
    }
    redirect("/onboarding");
  }
  const { context } = auth;

  const [overview, blockers, soleWorkspaces] = await Promise.all([
    getAccountOverview(context.userId),
    listAccountDeletionBlockers(context.userId),
    listSoleOwnedWorkspaces(context.userId),
  ]);

  if (!overview) {
    return (
      <>
        <PageHeader title="Your account" />
        <ErrorState title="We couldn’t load your account" description="Sign in again to continue." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your account"
        description="Your name and sign-in details follow you across every workspace you belong to."
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: "Your account" },
        ]}
      />
      <div className="grid gap-8">
        <section aria-labelledby="profile-heading" className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 id="profile-heading" className="type-section-title">
            Profile
          </h2>
          <ProfileForm firstName={overview.firstName} lastName={overview.lastName} email={overview.email} />
        </section>

        <LeaveWorkspaceSection workspaceName={context.workspaceName} isOwner={context.role === "owner"} />

        <DeleteAccountSection
          hasPassword={overview.hasPassword}
          email={overview.email}
          blockers={blockers}
          soleWorkspaces={soleWorkspaces.map((workspace) => workspace.workspaceName)}
        />
      </div>
    </>
  );
}
