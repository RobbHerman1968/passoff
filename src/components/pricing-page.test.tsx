import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";

import { PricingPage } from "@/components/pricing-page";
import { describeMembers, describeReviewWebsites, describeVideoAllowance } from "@/lib/billing/format";
import {
  AGENCY_TRIAL_DAYS,
  ANNUAL_SAVINGS_PERCENT,
  PLAN_ENTITLEMENTS,
  formatUsd,
  type PlanId,
} from "@/lib/billing/plans";

describe("PricingPage", () => {
  it("presents the recommended plans and keeps client reviewers unlimited", () => {
    render(<PricingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your workspace pays. Every client reviews free." }),
    ).toBeVisible();
    const planCards = screen.getByRole("region", { name: "Start small. Move up when the client work does." });
    expect(within(planCards).getByText("$29")).toBeVisible();
    expect(within(planCards).getByText("$89")).toBeVisible();
    expect(within(planCards).getByText("6 workspace members")).toBeVisible();
    expect(within(planCards).getByText("3 workspace members")).toBeVisible();
    expect(within(planCards).getByText("5 active review websites")).toBeVisible();
    expect(within(planCards).getByText("Unlimited active review websites")).toBeVisible();
    expect(within(planCards).getByText("10 min new video / month · 15 min retained")).toBeVisible();
    expect(within(planCards).getByText("30 min new video / month · 1 hour retained")).toBeVisible();
    expect(within(planCards).getByText("1 hour new video / month · 2 hours retained")).toBeVisible();

    const comparison = screen.getByRole("table", { name: "What each Passoff plan includes" });
    expect(within(comparison).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Plan details",
      "Free",
      "Studio",
      "Agency",
    ]);
    expect(screen.getByText("Unlimited client reviewers")).toBeVisible();
    expect(screen.getByText("Unlimited issues and comments")).toBeVisible();
    expect(screen.getAllByText("Unlimited reviewer playback")).toHaveLength(2);
    expect(screen.queryByText("Unlimited review rounds")).not.toBeInTheDocument();
    expect(screen.queryByText("100 hours of stored video")).not.toBeInTheDocument();
    expect(screen.queryByText(/Add 25 hours for \$15 per month/)).not.toBeInTheDocument();

    expect(within(planCards).getByText("Free").closest('[data-slot="card"]')).toHaveClass(
      "ring-border",
      "dark:bg-background",
    );
    expect(within(planCards).getByText("Studio").closest('[data-slot="card"]')).toHaveClass(
      "ring-border",
      "dark:bg-background",
    );

    const agencyFeatures = screen.getByRole("list", { name: "Agency features" });
    expect(within(agencyFeatures).getByText("Your logo on shared reviews")).toBeVisible();
    expect(screen.getByRole("link", { name: /Try Agency free/ })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("switches the displayed plan prices between annual and monthly billing", async () => {
    const user = userEvent.setup();
    render(<PricingPage />);

    const annual = screen.getByRole("button", { name: /Annual/ });
    const monthly = screen.getByRole("button", { name: "Monthly" });

    expect(annual).toHaveAttribute("aria-pressed", "true");
    expect(annual).toHaveAttribute("data-variant", "default");
    expect(monthly).toHaveAttribute("data-variant", "ghost");
    expect(screen.getByText("$29")).toBeVisible();
    expect(screen.getByText("$89")).toBeVisible();
    expect(screen.getByText("billed $348 yearly")).toHaveClass("font-semibold");
    expect(screen.getByText("billed $348 yearly")).toHaveClass("text-foreground");
    expect(screen.getByText("billed $1,068 yearly")).toHaveClass("text-white");
    expect(screen.getByText("Annual pricing saves up to 18%—that is $240 a year.")).toBeVisible();
    expect(within(annual).queryByText(/18%/)).not.toBeInTheDocument();

    await user.click(monthly);

    expect(monthly).toHaveAttribute("aria-pressed", "true");
    expect(annual).toHaveAttribute("aria-pressed", "false");
    expect(monthly).toHaveAttribute("data-variant", "default");
    expect(annual).toHaveAttribute("data-variant", "ghost");
    expect(screen.getByText("$35")).toBeVisible();
    expect(screen.getByText("$109")).toBeVisible();
    expect(screen.getAllByText("billed monthly")).toHaveLength(2);
    expect(screen.getAllByText("billed monthly")[0]).toHaveClass("font-semibold");
    expect(screen.queryByText("$29")).not.toBeInTheDocument();
    expect(screen.queryByText("$89")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<PricingPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows exactly what the plan catalog says, in both schedules", async () => {
    const user = userEvent.setup();
    render(<PricingPage />);
    const cards = screen.getByRole("region", { name: "Start small. Move up when the client work does." });

    for (const id of ["free", "studio", "agency"] as PlanId[]) {
      const plan = PLAN_ENTITLEMENTS[id];
      expect(within(cards).getByText(describeMembers(id))).toBeVisible();
      expect(within(cards).getByText(describeReviewWebsites(id))).toBeVisible();
      expect(within(cards).getByText(describeVideoAllowance(id))).toBeVisible();
      if (plan.monthlyPriceUsd > 0) {
        expect(within(cards).getByText(formatUsd(plan.annualMonthlyPriceUsd))).toBeVisible();
        expect(within(cards).getByText(`billed ${formatUsd(plan.annualTotalUsd)} yearly`)).toBeVisible();
      }
    }

    await user.click(screen.getByRole("button", { name: "Monthly" }));
    for (const id of ["studio", "agency"] as PlanId[]) {
      expect(within(cards).getByText(formatUsd(PLAN_ENTITLEMENTS[id].monthlyPriceUsd))).toBeVisible();
    }
  });

  it("advertises the trial length and savings from the catalog, and the trial only on Agency", () => {
    render(<PricingPage />);
    expect(screen.getByText(`${AGENCY_TRIAL_DAYS} days on Agency, free`)).toBeVisible();
    expect(
      screen.getByText(new RegExp(`Annual pricing saves up to ${ANNUAL_SAVINGS_PERCENT}%`)),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Try Agency free/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Choose Studio/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Try Studio free/ })).not.toBeInTheDocument();
  });

  it("explains active review websites and what happens over a limit", () => {
    render(<PricingPage />);
    expect(screen.getByText(/not archived or closed/)).toBeInTheDocument();
    expect(screen.getByText(/only new additions pause/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
  });

  it("keeps dollar amounts and plan limits out of component source", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      "src/components/pricing-page.tsx",
      "src/components/billing/plan-picker.tsx",
      "src/components/billing/plan-summary.tsx",
      "src/components/billing/usage-section.tsx",
      "src/components/billing/billing-notices.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(source, file).not.toMatch(/\$\d/);
    }
  });
});
