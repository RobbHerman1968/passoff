import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { DeleteWorkspaceSection } from "@/components/workspaces/delete-workspace-section";
import { PlanCapacityCard } from "@/components/workspaces/plan-capacity-card";
import { WorkspaceNameForm } from "@/components/workspaces/workspace-name-form";
import { can } from "@/lib/workspaces/permissions";
import { getPlanSummary } from "@/lib/workspaces/settings";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Workspace settings",
  description: "Rename your workspace, see your plan and seats, or delete the workspace.",
};

export default async function WorkspaceSettingsPage() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/settings/workspace");
    }
    redirect("/onboarding");
  }
  const { context } = auth;
  const summary = await getPlanSummary(context.workspaceId);

  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Your workspace is the shared home for projects, reviews, and the people you work with."
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: "Workspace settings" },
        ]}
      />
      <div className="grid gap-8">
        <section aria-labelledby="workspace-name-heading" className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 id="workspace-name-heading" className="type-section-title">
            Name
          </h2>
          <WorkspaceNameForm name={context.workspaceName} canRename={can(context, "workspace.rename")} />
        </section>

        <section aria-labelledby="owner-heading" className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 id="owner-heading" className="type-section-title">
            Your role
          </h2>
          <p className="type-supporting max-w-prose">
            {context.role === "owner"
              ? "You’re the owner. You can invite and remove people, hand over ownership, rename the workspace, and delete it."
              : "You’re a member. You can work on projects and reviews. Only the owner can change members, the workspace name, or delete the workspace."}
          </p>
        </section>

        <PlanCapacityCard
          planName={summary.planName}
          capacity={summary.capacity}
          activeReviewWebsites={summary.activeReviewWebsites}
          canManageMembers={can(context, "members.invite")}
        />

        {can(context, "workspace.delete") ? (
          <DeleteWorkspaceSection workspaceId={context.workspaceId} workspaceName={context.workspaceName} />
        ) : null}
      </div>
    </>
  );
}
