"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  acceptInvitationAction,
  switchAccountForInvitationAction,
  type AcceptInvitationActionResult,
} from "@/app/(auth)/invite/[token]/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { Button } from "@/components/ui/button";
import type { InvitationView } from "@/lib/workspaces/invitations";

const idle: AcceptInvitationActionResult = { status: "idle" };

function Explain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <FormAlert tone="info" title={title} description={undefined} />
      <div className="type-supporting max-w-prose">{children}</div>
    </div>
  );
}

/**
 * Every way an invitation link can look: usable, wrong account, already joined, expired,
 * cancelled, used, or not valid. Each one says what happened and what to do next.
 */
export function InvitationCard({
  view,
  token,
  signedIn,
  signedInEmail,
}: {
  view: InvitationView;
  token: string;
  signedIn: boolean;
  signedInEmail?: string | null;
}) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, idle);
  const returnTo = `/invite/${token}`;
  const next = encodeURIComponent(returnTo);

  const homeLink = signedIn ? (
    <Button asChild variant="outline">
      <Link href="/dashboard">Go to your projects</Link>
    </Button>
  ) : (
    <Button asChild variant="outline">
      <Link href="/sign-in">Sign in</Link>
    </Button>
  );

  switch (view.status) {
    case "invalid":
      return (
        <div className="grid gap-4">
          <Explain title="This invitation link isn’t valid">
            Check that you opened the whole link from your email. If it still doesn’t work, ask the
            workspace owner to send you a new invitation.
          </Explain>
          <div>{homeLink}</div>
        </div>
      );
    case "revoked":
      return (
        <div className="grid gap-4">
          <Explain title="This invitation was cancelled">
            The workspace owner cancelled it. Ask them to send a new invitation if you should still join.
          </Explain>
          <div>{homeLink}</div>
        </div>
      );
    case "accepted":
      return (
        <div className="grid gap-4">
          <Explain title="This invitation was already used">
            {signedIn
              ? "If you joined with this link, your workspace is ready."
              : "Sign in to open the workspace, or ask the owner for a new invitation."}
          </Explain>
          <div>{homeLink}</div>
        </div>
      );
    case "expired":
      return (
        <div className="grid gap-4">
          <Explain title="This invitation has expired">
            The invitation to join {view.workspaceName} (sent to {view.invitedEmailMasked}) is no longer
            valid. Ask the workspace owner to send you a new one.
          </Explain>
          <div>{homeLink}</div>
        </div>
      );
    case "pending": {
      const inviter = view.inviterName ? `${view.inviterName} invited you` : "You’ve been invited";
      if (!signedIn) {
        return (
          <div className="grid gap-4">
            <p className="text-sm">
              {inviter} to join <strong className="font-semibold">{view.workspaceName}</strong> on
              Passoff. This invitation was sent to {view.invitedEmailMasked}.
            </p>
            <p className="type-supporting">
              Use that email address to join. New to Passoff? Create an account first. It takes a
              minute.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild>
                <Link href={`/sign-up?callbackUrl=${next}`}>Create account to join</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/sign-in?callbackUrl=${next}`}>Sign in to join</Link>
              </Button>
            </div>
          </div>
        );
      }

      if (view.emailMismatch) {
        return (
          <div className="grid gap-4">
            <FormAlert
              title="This invitation is for a different email address"
              description={`It was sent to ${view.invitedEmailMasked}, but you’re signed in as ${signedInEmail ?? "another account"}. Sign in with the invited address to join ${view.workspaceName}.`}
            />
            <form action={switchAccountForInvitationAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit">Sign out and use a different account</Button>
            </form>
            <div>{homeLink}</div>
          </div>
        );
      }

      return (
        <NetworkGate>
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="token" value={token} />
            {state.status === "error" && state.message ? (
              <FormAlert title="We couldn’t add you to the workspace" description={state.message} />
            ) : null}
            <p className="text-sm">
              {inviter} to join <strong className="font-semibold">{view.workspaceName}</strong> on
              Passoff.
            </p>
            <p className="type-supporting">
              {view.alreadyMember
                ? "You’re already in this workspace. Open it to get back to your work."
                : "You’ll be able to work on its projects and reviews right away."}
            </p>
            <div>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Joining…"
                  : view.alreadyMember
                    ? `Open ${view.workspaceName}`
                    : `Join ${view.workspaceName}`}
              </Button>
            </div>
            <p className="sr-only" aria-live="polite">
              {pending ? "Joining workspace" : ""}
            </p>
          </form>
        </NetworkGate>
      );
    }
  }
}
