"use client";

import { MoreHorizontal } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/account-menu";
import {
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  transferOwnershipAction,
} from "@/app/(app)/settings/actions";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionMessage } from "@/components/workspaces/action-message";
import { ConfirmActionDialog } from "@/components/workspaces/confirm-action-dialog";
import { InviteMemberForm } from "@/components/workspaces/invite-member-form";
import { useSettingsAction } from "@/components/workspaces/use-settings-action";
import { formatReminderDate } from "@/lib/notifications/types";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
  isYou: boolean;
};

export type InvitationRow = {
  id: string;
  email: string;
  status: "pending" | "expired";
  invitedByName: string | null;
  lastSentAt: string;
  expiresAt: string;
};

type Pending =
  | { kind: "remove"; member: MemberRow }
  | { kind: "transfer"; member: MemberRow }
  | { kind: "revoke"; invitation: InvitationRow }
  | null;

export function MembersPanel({
  members,
  invitations,
  canManage,
  atCapacity,
  capacityMessage,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  canManage: boolean;
  atCapacity: boolean;
  capacityMessage?: string;
}) {
  const { pending, result, run } = useSettingsAction();
  const [confirm, setConfirm] = React.useState<Pending>(null);
  const peopleHeading = React.useRef<HTMLHeadingElement>(null);
  const messageRef = React.useRef<HTMLDivElement>(null);

  // After a removal the row (and its menu) is gone, so focus moves to the list heading.
  React.useEffect(() => {
    if (result.status === "success") peopleHeading.current?.focus();
    else if (result.status !== "idle") messageRef.current?.focus();
  }, [result]);

  return (
    <div className="grid gap-8">
      <div ref={messageRef} tabIndex={-1} className="outline-none" aria-live="polite">
        <ActionMessage result={result} />
      </div>

      <section aria-labelledby="invite-heading" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="invite-heading" className="type-section-title">
          Invite someone
        </h2>
        {canManage ? (
          <InviteMemberForm atCapacity={atCapacity} capacityMessage={capacityMessage} />
        ) : (
          <p className="type-supporting max-w-prose">
            Only the workspace owner can invite people or remove them. Ask your owner if someone
            should join.
          </p>
        )}
      </section>

      <section aria-labelledby="people-heading" className="grid gap-3">
        <h2 id="people-heading" ref={peopleHeading} tabIndex={-1} className="type-section-title outline-none">
          People in this workspace
        </h2>
        <ul aria-labelledby="people-heading" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={member.name} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-semibold">
                  <span className="truncate">{member.name}</span>
                  {member.isYou ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground">
                  Joined <time dateTime={member.joinedAt}>{formatReminderDate(member.joinedAt)}</time>
                </p>
              </div>
              <StatusPill tone={member.role === "owner" ? "neutral" : "muted"}>
                {member.role === "owner" ? "Owner" : "Member"}
              </StatusPill>
              {canManage && member.role === "member" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${member.name}`} disabled={pending}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setConfirm({ kind: "transfer", member })}>
                      Make owner
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "remove", member })}>
                      Remove from workspace
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="type-supporting">
          Guest reviewers are free. They never appear here and never use a seat.
        </p>
      </section>

      <section aria-labelledby="invitations-heading" className="grid gap-3">
        <h2 id="invitations-heading" className="type-section-title">
          Open invitations
        </h2>
        {invitations.length === 0 ? (
          <EmptyState
            headingLevel={3}
            title="No open invitations"
            description={
              canManage
                ? "Invite a teammate above. Their invitation shows up here until they join."
                : "When your owner invites someone, the invitation shows up here until they join."
            }
          />
        ) : (
          <ul aria-labelledby="invitations-heading" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="truncate text-sm font-semibold">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.invitedByName ? `Invited by ${invitation.invitedByName} · ` : ""}
                    Last sent <time dateTime={invitation.lastSentAt}>{formatReminderDate(invitation.lastSentAt)}</time>
                    {" · "}
                    {invitation.status === "expired" ? "Expired" : "Expires"}{" "}
                    <time dateTime={invitation.expiresAt}>{formatReminderDate(invitation.expiresAt)}</time>
                  </p>
                </div>
                <StatusPill tone={invitation.status === "expired" ? "muted" : "in-progress"}>
                  {invitation.status === "expired" ? "Expired" : "Waiting to join"}
                </StatusPill>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      aria-label={`Resend invitation to ${invitation.email}`}
                      onClick={() => run(resendInvitationAction, { invitationId: invitation.id })}
                    >
                      Resend invitation
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      aria-label={`Cancel invitation for ${invitation.email}`}
                      onClick={() => setConfirm({ kind: "revoke", invitation })}
                    >
                      Cancel invitation
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmActionDialog
        open={confirm?.kind === "remove"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "remove" ? `Remove ${confirm.member.name}?` : "Remove this person?"}
        description="They lose access to this workspace right away. Issues assigned to them become unassigned. Their comments and history stay."
        confirmLabel="Remove from workspace"
        onConfirm={() => {
          if (confirm?.kind === "remove") run(removeMemberAction, { memberUserId: confirm.member.userId });
        }}
      />
      <ConfirmActionDialog
        open={confirm?.kind === "transfer"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "transfer" ? `Make ${confirm.member.name} the owner?` : "Make this person the owner?"}
        description="They will be able to invite and remove people, change the workspace name, and delete the workspace. You’ll become a member, and only they can give ownership back."
        confirmLabel="Make owner"
        destructive={false}
        onConfirm={() => {
          if (confirm?.kind === "transfer") run(transferOwnershipAction, { newOwnerUserId: confirm.member.userId });
        }}
      />
      <ConfirmActionDialog
        open={confirm?.kind === "revoke"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "revoke" ? `Cancel the invitation for ${confirm.invitation.email}?` : "Cancel this invitation?"}
        description="The link in their email stops working. You can invite them again later."
        confirmLabel="Cancel invitation"
        cancelLabel="Keep invitation"
        onConfirm={() => {
          if (confirm?.kind === "revoke") run(revokeInvitationAction, { invitationId: confirm.invitation.id });
        }}
      />
    </div>
  );
}
