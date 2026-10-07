import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BillingNotices } from "@/components/billing/billing-notices";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { PlanPicker } from "@/components/billing/plan-picker";
import { ReviewLimitNotice } from "@/components/billing/review-limit-notice";
import { PlanSummary } from "@/components/billing/plan-summary";
import { UsageMeter, usageMeterState } from "@/components/billing/usage-meter";
import { UsageSection } from "@/components/billing/usage-section";
import { AGENCY_TRIAL_DAYS, ANNUAL_SAVINGS_PERCENT, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import {
  billingCadenceLabel,
  describeMembers,
  describeReviewWebsites,
  monthlyPriceLabel,
} from "@/lib/billing/format";
import type { BillingOverview } from "@/lib/billing/service";
import { resolveEntitlement, describeBillingState } from "@/lib/billing/subscription-state";
import { summarizeCapacity } from "@/lib/workspaces/capacity";
import { summarizeReviewWebsiteCapacity } from "@/lib/billing/review-websites";

const actions = vi.hoisted(() => ({
  startCheckoutAction: vi.fn(),
  openBillingPortalAction: vi.fn(),
}));

vi.mock("@/app/(app)/settings/billing/actions", () => ({
  startCheckoutAction: actions.startCheckoutAction,
  openBillingPortalAction: actions.openBillingPortalAction,
}));

beforeEach(() => {
  actions.startCheckoutAction.mockReset();
  actions.openBillingPortalAction.mockReset();
});

const now = new Date("2026-10-07T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

type Overrides = {
  plan?: string;
  status?: "trialing" | "active" | "past_due" | "cancelled";
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: Date | null;
  pastDueSince?: Date | null;
  subscription?: boolean;
  canManage?: boolean;
  websitesUsed?: number;
  memberSeats?: number;
};

function overview(overrides: Overrides = {}): BillingOverview {
  const hasStored = overrides.subscription ?? Boolean(overrides.plan);
  const resolution = resolveEntitlement(
    hasStored
      ? {
          plan: overrides.plan ?? "studio",
          status: overrides.status ?? "active",
          billingInterval: "year",
          currentPeriodEnd: new Date(now.getTime() + 20 * DAY),
          cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
          trialStartedAt: overrides.trialEndsAt ? new Date(now.getTime() - DAY) : null,
          trialEndsAt: overrides.trialEndsAt ?? null,
          pastDueSince: overrides.pastDueSince ?? null,
        }
      : null,
    now,
  );
  const planId = resolution.planId;
  const members = summarizeCapacity({
    planId,
    activeMembers: overrides.memberSeats ?? 1,
    pendingInvitations: 0,
  });
  const websites = summarizeReviewWebsiteCapacity({ planId, used: overrides.websitesUsed ?? 1 });
  return {
    workspaceName: "Acme Studio",
    canManage: overrides.canManage ?? true,
    billingConfigured: true,
    resolution,
    planName: PLAN_ENTITLEMENTS[planId].name,
    state: resolution.state,
    stateLabel: describeBillingState(resolution.state),
    canOpenPortal: hasStored,
    hasSubscription: hasStored && overrides.status !== "cancelled",
    cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
    trial: {
      eligible: !hasStored,
      days: AGENCY_TRIAL_DAYS,
      endsAt: resolution.trialEndsAt,
      daysLeft: resolution.state === "trialing" ? 3 : null,
    },
    members,
    websites,
    video: {
      newMinutesUsed: 2,
      newMinutesAllowed: PLAN_ENTITLEMENTS[planId].videoEvidence.status === "approved" ? 10 : 0,
      retainedMinutesUsed: 4,
      retainedMinutesAllowed: 15,
    } as unknown as BillingOverview["video"],
    over: {
      members: members.overCapacity,
      websites: websites.overLimit,
      video: false,
    },
  };
}

describe("usageMeterState", () => {
  it("warns at 80%, pauses at 100%, and flags being over", () => {
    expect(usageMeterState(3, 5)).toBe("ok");
    expect(usageMeterState(4, 5)).toBe("near");
    expect(usageMeterState(5, 5)).toBe("full");
    expect(usageMeterState(6, 5)).toBe("over");
    expect(usageMeterState(99, "unlimited")).toBe("unlimited");
  });
});

describe("UsageMeter", () => {
  it("spells out the state in words, not just color, and passes axe", async () => {
    const { container } = render(
      <UsageMeter label="Active review websites" used={5} limit={5} window="Websites with a review that isn’t archived" />,
    );
    expect(screen.getByText("5 of 5 used")).toBeInTheDocument();
    expect(screen.getByText(/Full\. New additions are paused/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says nothing was removed when over the plan", () => {
    render(<UsageMeter label="Active review websites" used={3} limit={1} window="Now" />);
    expect(screen.getByText(/Nothing was removed; new additions are paused/)).toBeInTheDocument();
  });

  it("shows unlimited plainly", () => {
    render(<UsageMeter label="Active review websites" used={12} limit="unlimited" window="Now" />);
    expect(screen.getByText(/12 used · Unlimited/)).toBeInTheDocument();
  });
});

describe("PlanPicker", () => {
  it("shows prices and limits that come from the plan catalog", async () => {
    const user = userEvent.setup();
    const { container } = render(<PlanPicker trialEligible />);

    for (const planId of ["studio", "agency"] as const) {
      const card = within(screen.getByTestId(`plan-card-${planId}`));
      expect(card.getByText(monthlyPriceLabel(planId, "year"))).toBeInTheDocument();
      expect(card.getByText(billingCadenceLabel(planId, "year"))).toBeInTheDocument();
      expect(card.getByText(describeMembers(planId))).toBeInTheDocument();
      expect(card.getByText(describeReviewWebsites(planId))).toBeInTheDocument();
    }
    expect(screen.getByText(`Save up to ${ANNUAL_SAVINGS_PERCENT}%`)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Monthly/ }));
    expect(
      within(screen.getByTestId("plan-card-studio")).getByText(monthlyPriceLabel("studio", "month")),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("offers the trial only on Agency, and only when it is still available", () => {
    const { unmount } = render(<PlanPicker trialEligible />);
    expect(
      screen.getByRole("button", { name: `Start ${AGENCY_TRIAL_DAYS}-day Agency trial` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Studio" })).toBeInTheDocument();
    unmount();

    render(<PlanPicker trialEligible={false} />);
    expect(screen.getByRole("button", { name: "Choose Agency" })).toBeInTheDocument();
    expect(screen.queryByText(/trial/i)).not.toBeInTheDocument();
  });

  it("explains instead of failing when billing is not set up", () => {
    render(<PlanPicker trialEligible unavailableReason="Plan changes aren’t available right now." />);
    expect(screen.getByText("Plan changes aren’t available right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Studio" })).toBeDisabled();
  });

  it("never asks for card details", () => {
    render(<PlanPicker trialEligible />);
    expect(screen.queryByLabelText(/card number|cvc|expiry/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Passoff never sees your card/)).toBeInTheDocument();
  });

  it("shows a recoverable message when the payment page cannot open", async () => {
    const user = userEvent.setup();
    actions.startCheckoutAction.mockResolvedValue({
      status: "unavailable",
      message: "We couldn’t reach our payment provider. Nothing was charged. Try again in a moment.",
    });
    render(<PlanPicker trialEligible={false} />);
    await user.click(screen.getByRole("button", { name: "Choose Studio" }));
    expect(await screen.findByText(/Nothing was charged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Studio" })).toBeEnabled();
    expect(actions.startCheckoutAction).toHaveBeenCalled();
    const formData = actions.startCheckoutAction.mock.calls[0][1] as FormData;
    expect(formData.get("plan")).toBe("studio");
    expect(formData.get("interval")).toBe("year");
  });
});

describe("ManageBillingButton", () => {
  it("opens billing and shows a calm message when it cannot", async () => {
    const user = userEvent.setup();
    actions.openBillingPortalAction.mockResolvedValue({
      status: "unavailable",
      message: "We couldn’t reach our payment provider. Nothing was charged. Try again in a moment.",
    });
    const { container } = render(<ManageBillingButton />);
    await user.click(screen.getByRole("button", { name: /Manage billing/ }));
    expect(await screen.findByText(/Try again in a moment/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PlanSummary", () => {
  it("shows the plan for the owner with the one billing action", async () => {
    const data = overview({ plan: "studio" });
    const { container } = render(<PlanSummary overview={data} />);
    expect(screen.getByTestId("plan-name")).toHaveTextContent("Studio");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage billing/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("asks for updated payment details when a payment failed", () => {
    render(
      <PlanSummary
        overview={overview({ plan: "agency", status: "past_due", pastDueSince: new Date(now.getTime() - DAY) })}
      />,
    );
    expect(screen.getByText("Payment needs attention")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update payment details/ })).toBeInTheDocument();
  });

  it("gives members the information without the controls", () => {
    render(<PlanSummary overview={overview({ plan: "studio", canManage: false })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Only the workspace owner can change the plan/)).toBeInTheDocument();
  });

  it("shows Free with no billing button for a workspace that never subscribed", () => {
    render(<PlanSummary overview={overview()} />);
    expect(screen.getByTestId("plan-name")).toHaveTextContent("Free");
    expect(screen.queryByRole("button", { name: /Manage billing/ })).not.toBeInTheDocument();
  });
});

describe("BillingNotices", () => {
  it("renders nothing for a healthy plan", () => {
    const { container } = render(<BillingNotices overview={overview({ plan: "studio" })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains a failed payment with the date, and promises nothing was removed", async () => {
    const data = overview({ plan: "agency", status: "past_due", pastDueSince: new Date(now.getTime() - DAY) });
    const { container } = render(<BillingNotices overview={data} />);
    expect(screen.getByText("We couldn’t take your latest payment")).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been removed/)).toBeInTheDocument();
    expect(screen.getByText(/Update your payment details by/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("tells members to ask the owner", () => {
    const data = overview({
      plan: "agency",
      status: "past_due",
      pastDueSince: new Date(now.getTime() - DAY),
      canManage: false,
    });
    render(<BillingNotices overview={data} />);
    expect(screen.getByText(/Ask your workspace owner to update the payment details/)).toBeInTheDocument();
  });

  it("says the workspace is on Free limits after a lapse, with all work kept", () => {
    const data = overview({ plan: "agency", status: "past_due", pastDueSince: new Date(now.getTime() - 10 * DAY) });
    render(<BillingNotices overview={data} />);
    expect(screen.getByText("This workspace is using Free limits")).toBeInTheDocument();
    expect(screen.getByText(/projects, reviews, issues, and video are kept/)).toBeInTheDocument();
  });

  it("announces trial days left and what happens next", () => {
    const data = overview({ plan: "agency", status: "trialing", trialEndsAt: new Date(now.getTime() + 3 * DAY) });
    render(<BillingNotices overview={data} />);
    expect(screen.getByText(/Your Agency trial ends on/)).toBeInTheDocument();
    expect(screen.getByText(/3 days left/)).toBeInTheDocument();
    expect(screen.getByText(/moves to Free and all of your work stays safe/)).toBeInTheDocument();
  });

  it("explains a plan that ends at the end of the period", () => {
    render(<BillingNotices overview={overview({ plan: "studio", cancelAtPeriodEnd: true })} />);
    expect(screen.getByText(/The Studio plan ends on/)).toBeInTheDocument();
    expect(screen.getByText(/You keep every feature until then/)).toBeInTheDocument();
  });

  it("explains being over the plan, names the fix, and says nothing was removed", async () => {
    const data = overview({ websitesUsed: 3 });
    const { container } = render(<BillingNotices overview={data} />);
    expect(screen.getByText(/You’re over what the Free plan includes/)).toBeInTheDocument();
    expect(screen.getByText(/3 active review websites \(your plan includes 1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was removed and everyone can keep working/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("waits for the webhook instead of trusting the success redirect", () => {
    render(<BillingNotices overview={{ ...overview(), checkout: "success" }} />);
    expect(screen.getByText("Waiting for confirmation from our payment provider")).toBeInTheDocument();
    expect(screen.queryByText(/You’re on the/)).not.toBeInTheDocument();
  });

  it("confirms the plan once the webhook has arrived", () => {
    render(<BillingNotices overview={{ ...overview({ plan: "studio" }), checkout: "success" }} />);
    expect(screen.getByText("You’re on the Studio plan.")).toBeInTheDocument();
  });

  it("says no changes were made when the owner leaves Checkout", () => {
    render(<BillingNotices overview={{ ...overview(), checkout: "cancelled" }} />);
    expect(screen.getByText("No changes were made")).toBeInTheDocument();
  });
});

describe("UsageSection", () => {
  it("shows every limit from the catalog and passes axe", async () => {
    const data = overview({ plan: "studio", websitesUsed: 4, memberSeats: 2 });
    const { container } = render(<UsageSection overview={data} />);
    expect(screen.getByRole("heading", { level: 2, name: "What your workspace is using" })).toBeInTheDocument();
    expect(within(screen.getByTestId("usage-members")).getByText(/2 of 3/)).toBeInTheDocument();
    expect(within(screen.getByTestId("usage-websites")).getByText(/4 of 5/)).toBeInTheDocument();
    expect(within(screen.getByTestId("usage-websites")).getByText(/Almost full/)).toBeInTheDocument();
    expect(screen.getByTestId("usage-video-new")).toBeInTheDocument();
    expect(screen.getByText(/Guest reviewers, issues, and comments are always free/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows unlimited review websites on Agency", () => {
    render(<UsageSection overview={overview({ plan: "agency", websitesUsed: 9 })} />);
    expect(within(screen.getByTestId("usage-websites")).getByText(/Unlimited/)).toBeInTheDocument();
  });
});

describe("ReviewLimitNotice", () => {
  it("stays out of the way until a limit is near", () => {
    const { container } = render(
      <ReviewLimitNotice capacity={summarizeReviewWebsiteCapacity({ planId: "studio", used: 2 })} isOwner />,
    );
    expect(container).toBeEmptyDOMElement();
    const unlimited = render(
      <ReviewLimitNotice capacity={summarizeReviewWebsiteCapacity({ planId: "agency", used: 40 })} isOwner />,
    );
    expect(unlimited.container).toBeEmptyDOMElement();
  });

  it("warns near the limit with how much room is left", () => {
    render(
      <ReviewLimitNotice capacity={summarizeReviewWebsiteCapacity({ planId: "studio", used: 4 })} isOwner />,
    );
    expect(screen.getByText("You’re using 4 of 5 active review websites")).toBeInTheDocument();
    expect(screen.getByText(/Room for 1 more/)).toBeInTheDocument();
  });

  it("tells an owner what paused and links to billing, without blocking reading or feedback", async () => {
    const { container } = render(
      <ReviewLimitNotice capacity={summarizeReviewWebsiteCapacity({ planId: "free", used: 1 })} isOwner />,
    );
    expect(screen.getByText(/reached your plan’s limit of 1 active review website/)).toBeInTheDocument();
    expect(screen.getByText(/keep reading and writing feedback/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /move to Studio on the Billing page/ })).toHaveAttribute(
      "href",
      "/settings/billing",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sends a member to the owner rather than a page they cannot use", () => {
    render(
      <ReviewLimitNotice capacity={summarizeReviewWebsiteCapacity({ planId: "free", used: 3 })} isOwner={false} />,
    );
    expect(screen.getByText(/over its plan: 3 active review websites/)).toBeInTheDocument();
    expect(screen.getByText(/ask your workspace owner to move to Studio/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
