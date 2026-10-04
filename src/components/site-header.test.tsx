import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", () => {
  it("keeps the logo free of a decorative badge and exposes a primary action", () => {
    render(
      <AppProviders>
        <SiteHeader />
      </AppProviders>,
    );

    const home = screen.getByRole("link", { name: "Passoff home" });
    expect(home.className).not.toMatch(/logo-back/);
    expect(screen.getAllByRole("link", { name: "Pricing" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Start a review" }).length).toBeGreaterThan(0);
  });

  it("opens mobile navigation from the keyboard and restores focus", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <SiteHeader />
      </AppProviders>,
    );

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    menuButton.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "Passoff" });
    expect(dialog).toBeVisible();
    expect(screen.getAllByRole("navigation", { name: "Main navigation" }).length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Passoff" })).not.toBeInTheDocument();
    });
    expect(menuButton).toHaveFocus();
  });
});
