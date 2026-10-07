import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { MembersPanel } from "@/components/workspaces/members-panel";
import { capacityBlockedMessage, getMemberCapacity } from "@/lib/workspaces/capacity";
import { listInvitations } from "@/lib/workspaces/invitations";
import { listMembers } from "@/lib/workspaces/members";
import { can } from "@/lib/workspaces/permissions";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Members",
  description: "See who is in your workspace, invite teammates, and manage ownership.",
};

export default async function MembersPage() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/settings/members");
    }
    redirect("/onboarding");
  }
  const { context } = auth;

  const [members, invitations, capacity] = await Promise.all([
    listMembers(context),
    listInvitations(context),
    getMemberCapacity(context.workspaceId),
  ]);

  if (!members.ok || !invitations.ok) {
    return (
      <>
        <PageHeader title="Members" />
        <ErrorState
          title="We couldn’t load your members"
          description="Check your connection and try again."
        />
      </>
    );
  }

  const canManage = can(context, "members.invite");

  return (
    <>
      <PageHeader
        title="Members"
        description={`People who can work in ${context.workspaceName}. ${capacity.seatsUsed} of ${capacity.limit} ${capacity.limit === 1 ? "seat" : "seats"} used.`}
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: "Members" },
        ]}
      />
      <MembersPanel
        canManage={canManage}
        atCapacity={capacity.atCapacity}
        capacityMessage={capacity.atCapacity ? capacityBlockedMessage(capacity) : undefined}
        members={members.members.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
          isYou: member.isYou,
        }))}
        invitations={invitations.invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          invitedByName: invitation.invitedByName,
          lastSentAt: invitation.lastSentAt.toISOString(),
          expiresAt: invitation.expiresAt.toISOString(),
        }))}
      />
    </>
  );
}
