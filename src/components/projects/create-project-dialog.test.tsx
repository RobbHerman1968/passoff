import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";

import { AppProviders } from "@/components/app-providers";
import { ContextualHelpProvider } from "@/components/help/help-context";
import { HelpDrawer } from "@/components/help/help-drawer";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Button } from "@/components/ui/button";

vi.mock("@/app/(app)/projects/actions", () => ({
  createProjectAction: vi.fn(async () => ({
    status: "error",
    message:
      "We couldn’t create this project. Your project name is still here. Try again.",
    values: { name: "Kept name" },
    fieldErrors: { name: "Enter a project name." },
  })),
}));

describe("CreateProjectDialog", () => {
  it("exposes accessible names and traps focus", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppProviders>
        <ContextualHelpProvider pageContext="projects-dashboard">
          <CreateProjectDialog
            trigger={<Button type="button">Create project</Button>}
          />
          <HelpDrawer />
        </ContextualHelpProvider>
      </AppProviders>,
    );

    const trigger = screen.getByRole("button", { name: "Create project" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Create project" });
    expect(
      within(dialog).getByLabelText("Project name"),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Why create a project?" }),
    ).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Create project" }),
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });
});
