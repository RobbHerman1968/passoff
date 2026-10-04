import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

import { AppShell, helpContextForPath } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/p1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(async () => ({ status: "success" })),
}));

function renderShell(options?: { showAdministration?: boolean }) {
  return render(
    <AppProviders>
      <AppShell
        workspaceName="Acme Studio"
        workspaceRole="owner"
        accountName="Alex Rivera"
        accountEmail="alex@example.com"
        showAdministration={options?.showAdministration}
        recentProjects={[
          { id: "p1", name: "Acme Launch" },
          { id: "p2", name: "Harbor Rebrand" },
        ]}
      >
        <h1>Acme Launch</h1>
      </AppShell>
    </AppProviders>,
  );
}

describe("AppShell", () => {
  it("renders one main landmark with a skip link and labelled controls", () => {
    renderShell();

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Account: Alex Rivera" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Help" }).length).toBeGreaterThan(0);
  });

  it("marks the current project in the sidebar", () => {
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Acme Launch" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Projects" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
  });

  it("hides Administration for ordinary users and shows it for platform admins", () => {
    const { unmount } = renderShell();
    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
    unmount();

    renderShell({ showAdministration: true });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("offers theme and sign out in the account menu", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getAllByRole("button", { name: "Account: Alex Rivera" })[0]);
    expect(
      await screen.findByRole("menuitem", { name: /Switch to (light|dark) mode/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("opens mobile navigation from the keyboard and restores focus", async () => {
    const user = userEvent.setup();
    renderShell();

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    menuButton.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "Passoff" });
    expect(within(dialog).getByRole("link", { name: "Projects" })).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Passoff" })).not.toBeInTheDocument();
    });
    expect(menuButton).toHaveFocus();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderShell();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("helpContextForPath", () => {
  it("maps routes to their help topic", () => {
    expect(helpContextForPath("/dashboard")).toBe("projects-dashboard");
    expect(helpContextForPath("/projects/p1")).toBe("project-detail");
    expect(helpContextForPath("/projects/p1/reviews/r1")).toBe(
      "website-review-detail",
    );
  });
});
