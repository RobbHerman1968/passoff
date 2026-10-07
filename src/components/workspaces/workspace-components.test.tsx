import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationCard } from "@/components/workspaces/invitation-card";
import { InviteMemberForm } from "@/components/workspaces/invite-member-form";
import { MembersPanel, type InvitationRow, type MemberRow } from "@/components/workspaces/members-panel";
import { PlanCapacityCard } from "@/components/workspaces/plan-capacity-card";
import { DeleteAccountSection } from "@/components/workspaces/delete-account-section";
import { DeleteWorkspaceSection } from "@/components/workspaces/delete-workspace-section";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { summarizeCapacity } from "@/lib/workspaces/capacity";

const actions = vi.hoisted(() => ({
  removeMemberAction: vi.fn(),
  resendInvitationAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
  transferOwnershipAction: vi.fn(),
  inviteMemberAction: vi.fn(),
  deleteWorkspaceAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  switchWorkspaceAction: vi.fn(),
  acceptInvitationAction: vi.fn(),
  switchAccountForInvitationAction: vi.fn(),
}));

vi.mock("@/app/(app)/settings/actions", () => ({
  removeMemberAction: actions.removeMemberAction,
  resendInvitationAction: actions.resendInvitationAction,
  revokeInvitationAction: actions.revokeInvitationAction,
  transferOwnershipAction: actions.transferOwnershipAction,
  inviteMemberAction: actions.inviteMemberAction,
  deleteWorkspaceAction: actions.deleteWorkspaceAction,
  deleteAccountAction: actions.deleteAccountAction,
}));
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(app)/workspaces/actions", () => ({
  switchWorkspaceAction: actions.switchWorkspaceAction,
}));
vi.mock("@/app/(auth)/invite/[token]/actions", () => ({
  acceptInvitationAction: actions.acceptInvitationAction,
  switchAccountForInvitationAction: actions.switchAccountForInvitationAction,
}));

const members: MemberRow[] = [
  {
    userId: "u1",
    name: "Maya Owner",
    email: "maya@example.com",
    role: "owner",
    joinedAt: "2026-09-01T10:00:00.000Z",
    isYou: true,
  },
  {
    userId: "u2",
    name: "Sam Member",
    email: "sam@example.com",
    role: "member",
    joinedAt: "2026-09-10T10:00:00.000Z",
    isYou: false,
  },
];

const invitations: InvitationRow[] = [
  {
    id: "inv-1",
    email: "new@example.com",
    status: "pending",
    invitedByName: "Maya Owner",
    lastSentAt: "2026-10-05T10:00:00.000Z",
    expiresAt: "2026-10-12T10:00:00.000Z",
  },
  {
    id: "inv-2",
    email: "old@example.com",
    status: "expired",
    invitedByName: null,
    lastSentAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-09-08T10:00:00.000Z",
  },
];

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

describe("MembersPanel", () => {
  it("shows people, roles, and open invitations with no accessibility violations", async () => {
    const { container } = render(
      <MembersPanel members={members} invitations={invitations} canManage atCapacity={false} />,
    );
    expect(screen.getByRole("heading", { name: "People in this workspace" })).toBeInTheDocument();
    expect(screen.getByText("Maya Owner")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Waiting to join")).toBeInTheDocument();
    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("hides owner controls from members but still lists people", () => {
    render(<MembersPanel members={members} invitations={invitations} canManage={false} atCapacity={false} />);
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resend invitation/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(screen.getByText(/Only the workspace owner can invite people/)).toBeInTheDocument();
  });

  it("shows a helpful empty state when nobody is waiting", () => {
    render(<MembersPanel members={members} invitations={[]} canManage atCapacity={false} />);
    expect(screen.getByText("No open invitations")).toBeInTheDocument();
  });

  it("asks before removing someone, naming them, then runs the action", async () => {
    actions.removeMemberAction.mockResolvedValue({ status: "success", message: "Sam Member was removed." });
    const user = userEvent.setup();
    render(<MembersPanel members={members} invitations={[]} canManage atCapacity={false} />);

    await user.click(screen.getByRole("button", { name: "Actions for Sam Member" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from workspace" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove Sam Member?")).toBeInTheDocument();
    expect(actions.removeMemberAction).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Remove from workspace" }));
    await waitFor(() => expect(actions.removeMemberAction).toHaveBeenCalledTimes(1));
    const formData = actions.removeMemberAction.mock.calls[0][1] as FormData;
    expect(formData.get("memberUserId")).toBe("u2");
    expect(await screen.findByText("Sam Member was removed.")).toBeInTheDocument();
  });

  it("explains what changes before handing over ownership", async () => {
    actions.transferOwnershipAction.mockResolvedValue({ status: "success", message: "Done." });
    const user = userEvent.setup();
    render(<MembersPanel members={members} invitations={[]} canManage atCapacity={false} />);
    await user.click(screen.getByRole("button", { name: "Actions for Sam Member" }));
    await user.click(await screen.findByRole("menuitem", { name: "Make owner" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/You’ll become a member/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Make owner" }));
    await waitFor(() => expect(actions.transferOwnershipAction).toHaveBeenCalled());
  });

  it("resends and cancels invitations with clear labels", async () => {
    actions.resendInvitationAction.mockResolvedValue({ status: "success", message: "Sent again." });
    actions.revokeInvitationAction.mockResolvedValue({ status: "success", message: "Cancelled." });
    const user = userEvent.setup();
    render(<MembersPanel members={members} invitations={invitations} canManage atCapacity={false} />);

    await user.click(screen.getByRole("button", { name: "Resend invitation to new@example.com" }));
    await waitFor(() => expect(actions.resendInvitationAction).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Cancel invitation for new@example.com" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Cancel the invitation for new@example.com?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel invitation" }));
    await waitFor(() => expect(actions.revokeInvitationAction).toHaveBeenCalled());
  });

  it("shows a plain error when an action fails and keeps people on the page", async () => {
    actions.removeMemberAction.mockResolvedValue({
      status: "forbidden",
      message: "Only a workspace owner can do this.",
    });
    const user = userEvent.setup();
    render(<MembersPanel members={members} invitations={[]} canManage atCapacity={false} />);
    await user.click(screen.getByRole("button", { name: "Actions for Sam Member" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from workspace" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove from workspace" }));
    expect(await screen.findByText("Only a workspace owner can do this.")).toBeInTheDocument();
    expect(screen.getByText("Sam Member")).toBeInTheDocument();
  });
});

describe("InviteMemberForm", () => {
  it("has a visible label and sends the address", async () => {
    actions.inviteMemberAction.mockResolvedValue({ status: "success", message: "Invitation sent." });
    const user = userEvent.setup();
    const { container } = render(<InviteMemberForm atCapacity={false} />);
    const field = screen.getByLabelText("Email address");
    await user.type(field, "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));
    await waitFor(() => expect(actions.inviteMemberAction).toHaveBeenCalled());
    const formData = actions.inviteMemberAction.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("friend@example.com");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("explains the limit and disables sending when seats are full", () => {
    render(<InviteMemberForm atCapacity capacityMessage="All 3 seats on your plan are in use." />);
    expect(screen.getByText(/All 3 seats on your plan are in use/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send invitation/ })).toBeDisabled();
  });

  it("keeps what was typed and points at the field when the address is wrong", async () => {
    actions.inviteMemberAction.mockResolvedValue({
      status: "error",
      message: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
      values: { email: "nope" },
    });
    const user = userEvent.setup();
    render(<InviteMemberForm atCapacity={false} />);
    await user.type(screen.getByLabelText("Email address"), "nope");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));
    expect((await screen.findAllByText("Enter a valid email address.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Email address")).toHaveValue("nope");
  });
});

describe("PlanCapacityCard", () => {
  it("reports seats, points to the billing page, and passes axe", async () => {
    const capacity = summarizeCapacity({ planId: "studio", activeMembers: 2, pendingInvitations: 1 });
    const { container } = render(
      <PlanCapacityCard planName="Studio" capacity={capacity} activeReviewWebsites={5} canManageMembers />,
    );
    expect(screen.getByTestId("seat-count")).toHaveTextContent("3 of 3 seats used");
    expect(screen.getByText("All seats are in use.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plan and usage" })).toHaveAttribute(
      "href",
      "/settings/billing",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("speaks to members differently from owners", () => {
    const capacity = summarizeCapacity({ planId: "free", activeMembers: 1, pendingInvitations: 0 });
    render(<PlanCapacityCard planName="Free" capacity={capacity} activeReviewWebsites={1} canManageMembers={false} />);
    expect(screen.getByText(/Ask your workspace owner/)).toBeInTheDocument();
  });
});

describe("WorkspaceSwitcher", () => {
  const two = [
    { id: "w1", name: "Acme Studio", role: "owner" as const },
    { id: "w2", name: "Client Co", role: "member" as const },
  ];

  it("shows a plain card when there is only one workspace", () => {
    render(<WorkspaceSwitcher current={two[0]} workspaces={[two[0]]} />);
    expect(screen.getByText("Acme Studio")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists every workspace and switches on request", async () => {
    actions.switchWorkspaceAction.mockResolvedValue({ status: "ok" });
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={two[0]} workspaces={two} />);
    await user.click(screen.getByRole("button", { name: /Workspace: Acme Studio/ }));
    const second = await screen.findByRole("menuitemradio", { name: /Client Co/ });
    expect(screen.getByRole("menuitemradio", { name: /Acme Studio/ })).toBeChecked();
    await user.click(second);
    await waitFor(() => expect(actions.switchWorkspaceAction).toHaveBeenCalledWith("w2"));
  });

  it("explains when switching fails", async () => {
    actions.switchWorkspaceAction.mockResolvedValue({
      status: "error",
      message: "You no longer have access to that workspace.",
    });
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={two[0]} workspaces={two} />);
    await user.click(screen.getByRole("button", { name: /Workspace: Acme Studio/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Client Co/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You no longer have access");
  });
});

describe("DeleteWorkspaceSection", () => {
  it("only enables deleting once the exact name is typed", async () => {
    const user = userEvent.setup();
    render(<DeleteWorkspaceSection workspaceId="w1" workspaceName="Acme Studio" />);
    await user.click(screen.getByRole("button", { name: /Delete workspace…/ }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete workspace" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Type “Acme Studio” to confirm/), "Acme");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Type “Acme Studio” to confirm/), " Studio");
    expect(confirm).toBeEnabled();
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it("names what will be removed and offers a safe way out", async () => {
    const user = userEvent.setup();
    render(<DeleteWorkspaceSection workspaceId="w1" workspaceName="Acme Studio" />);
    expect(screen.getByText(/can’t be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Delete workspace…/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Keep workspace" })).toBeInTheDocument();
  });
});

describe("DeleteAccountSection", () => {
  it("explains what blocks deletion and points to the next step", () => {
    render(
      <DeleteAccountSection
        hasPassword
        email="maya@example.com"
        blockers={[{ workspaceId: "w1", workspaceName: "Acme Studio", otherMembers: 2 }]}
        soleWorkspaces={[]}
      />,
    );
    expect(screen.getByText(/Acme Studio/)).toBeInTheDocument();
    expect(screen.getByText(/Make someone else the owner/i)).toBeInTheDocument();
  });

  it("asks for the password before deleting and lists workspaces that will close", async () => {
    const user = userEvent.setup();
    render(
      <DeleteAccountSection hasPassword email="maya@example.com" blockers={[]} soleWorkspaces={["Solo Studio"]} />,
    );
    await user.click(screen.getByRole("button", { name: /Delete (my )?account/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Solo Studio/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Password")).toBeInTheDocument();
    expect(await axe(dialog)).toHaveNoViolations();
  });
});

describe("InvitationCard", () => {
  const token = "abcdefghijklmnopqrstuvwxyz012345";

  it("invites signed-out people to create an account or sign in, keeping the invitation", () => {
    render(
      <InvitationCard
        token={token}
        signedIn={false}
        view={{
          status: "pending",
          workspaceName: "Acme Studio",
          inviterName: "Maya",
          invitedEmailMasked: "j•••@example.com",
          emailMismatch: false,
          alreadyMember: false,
        }}
      />,
    );
    expect(screen.getByText(/Maya invited you/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account to join" })).toHaveAttribute(
      "href",
      `/sign-up?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`,
    );
    expect(screen.getByRole("link", { name: "Sign in to join" })).toHaveAttribute(
      "href",
      `/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`,
    );
  });

  it("lets a signed-in person join and shows the reason if it fails", async () => {
    actions.acceptInvitationAction.mockResolvedValue({
      status: "error",
      message: "This workspace has no free seats right now.",
    });
    const user = userEvent.setup();
    const { container } = render(
      <InvitationCard
        token={token}
        signedIn
        signedInEmail="jo@example.com"
        view={{
          status: "pending",
          workspaceName: "Acme Studio",
          inviterName: null,
          invitedEmailMasked: "j•••@example.com",
          emailMismatch: false,
          alreadyMember: false,
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Join Acme Studio" }));
    expect(await screen.findByText("This workspace has no free seats right now.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("explains an email mismatch with only a masked address", () => {
    render(
      <InvitationCard
        token={token}
        signedIn
        signedInEmail="other@example.com"
        view={{
          status: "pending",
          workspaceName: "Acme Studio",
          inviterName: null,
          invitedEmailMasked: "j•••@example.com",
          emailMismatch: true,
          alreadyMember: false,
        }}
      />,
    );
    expect(screen.getByText(/different email address/)).toBeInTheDocument();
    expect(screen.getByText(/j•••@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out and use a different account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Join/ })).not.toBeInTheDocument();
  });

  it.each([
    [{ status: "invalid" as const }, "This invitation link isn’t valid"],
    [{ status: "revoked" as const }, "This invitation was cancelled"],
    [{ status: "accepted" as const }, "This invitation was already used"],
    [
      { status: "expired" as const, workspaceName: "Acme Studio", invitedEmailMasked: "j•••@example.com" },
      "This invitation has expired",
    ],
  ])("explains %o with a next step", async (view, heading) => {
    const { container } = render(<InvitationCard token={token} signedIn={false} view={view} />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
