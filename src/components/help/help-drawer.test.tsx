import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";

import { AppShell } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";
import { HelpTopicButton } from "@/components/help/help-topic-button";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { HELP_TOPICS, type HelpPageContext } from "@/lib/help/topics";

const PATH_FOR_CONTEXT: Record<HelpPageContext, string> = {
  "projects-dashboard": "/dashboard",
  "project-detail": "/projects/p1",
  "website-review-detail": "/projects/p1/reviews/r1",
};

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(async () => ({ status: "success" })),
}));

function renderWithHelp(
  helpContext: HelpPageContext,
  children: React.ReactNode = <p>Essential status stays visible</p>,
) {
  navigation.pathname = PATH_FOR_CONTEXT[helpContext];
  return render(
    <AppProviders>
      <AppShell
        workspaceName="Acme Studio"
        workspaceRole="owner"
        accountName="Alex Rivera"
      >
        {children}
      </AppShell>
    </AppProviders>,
  );
}

function headerHelpButton() {
  const help = screen
    .getAllByRole("button", { name: "Help" })
    .find((button) => button.dataset.size === "icon");
  if (!help) throw new Error("Header Help button not found");
  return help;
}

describe("Help drawer", () => {
  it("shows a compact Help trigger in the authenticated AppShell header", () => {
    renderWithHelp("projects-dashboard");
    const help = headerHelpButton();
    expect(help).toBeVisible();
    expect(help).toHaveAttribute("data-size", "icon");
    expect(help).toHaveAttribute("data-variant", "ghost");
    expect(help).toHaveAttribute("aria-controls", "help-drawer");
  });

  it("opens page-context help content", async () => {
    const user = userEvent.setup();
    renderWithHelp("projects-dashboard");

    await user.click(headerHelpButton());
    const dialog = await screen.findByRole("dialog", {
      name: HELP_TOPICS["projects-dashboard"].title,
    });
    expect(
      within(dialog).getByText(
        HELP_TOPICS["projects-dashboard"].paragraphs[0],
      ),
    ).toBeVisible();
  });

  it.each([
    ["projects-dashboard", HELP_TOPICS["projects-dashboard"].title],
    ["project-detail", HELP_TOPICS["project-detail"].title],
    ["website-review-detail", HELP_TOPICS["website-review-detail"].title],
  ] as const)(
    "shows %s topic from the shell Help trigger",
    async (context, title) => {
      const user = userEvent.setup();
      renderWithHelp(context);
      await user.click(headerHelpButton());
      expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
    },
  );

  it("opens a specific topic from a form action without clearing input", async () => {
    const user = userEvent.setup();
    renderWithHelp(
      "projects-dashboard",
      <form>
        <FormField id="project-name" label="Project name">
          <Input name="name" />
        </FormField>
        <HelpTopicButton topicId="create-project">
          Why create a project?
        </HelpTopicButton>
      </form>,
    );

    const nameInput = screen.getByLabelText("Project name");
    await user.type(nameInput, "Kept project name");

    await user.click(
      screen.getByRole("button", { name: "Why create a project?" }),
    );

    const helpDialog = await screen.findByRole("dialog", {
      name: HELP_TOPICS["create-project"].title,
    });
    expect(
      within(helpDialog).getByText(HELP_TOPICS["create-project"].paragraphs[0]),
    ).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: HELP_TOPICS["create-project"].title,
        }),
      ).not.toBeInTheDocument();
    });

    expect(nameInput).toHaveValue("Kept project name");
    expect(
      screen.getByRole("button", { name: "Why create a project?" }),
    ).toHaveFocus();
  });

  it("opens a topic button, traps focus, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    renderWithHelp(
      "website-review-detail",
      <div>
        <p>Website setup: Not installed</p>
        <HelpTopicButton topicId="website-review-detail">
          Learn about website setup
        </HelpTopicButton>
      </div>,
    );

    const trigger = screen.getByRole("button", {
      name: "Learn about website setup",
    });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: HELP_TOPICS["website-review-detail"].title,
    });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();

    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: HELP_TOPICS["website-review-detail"].title,
        }),
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("keeps essential status visible without opening Help", () => {
    renderWithHelp(
      "website-review-detail",
      <p>Website setup: Not detected</p>,
    );
    expect(screen.getByText("Website setup: Not detected")).toBeVisible();
    expect(
      screen.queryByRole("dialog", {
        name: HELP_TOPICS["website-review-detail"].title,
      }),
    ).not.toBeInTheDocument();
  });

  it("has no serious accessibility violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderWithHelp("project-detail");
    await user.click(headerHelpButton());
    await screen.findByRole("dialog", {
      name: HELP_TOPICS["project-detail"].title,
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("uses full-width sheet styles on the help drawer content", async () => {
    const user = userEvent.setup();
    renderWithHelp("projects-dashboard");
    await user.click(headerHelpButton());
    const dialog = await screen.findByRole("dialog", {
      name: HELP_TOPICS["projects-dashboard"].title,
    });
    expect(dialog.className).toMatch(/w-full/);
  });
});

describe("form help topic helpers", () => {
  it("keeps unrelated form fields intact while Help is open", async () => {
    const user = userEvent.setup();
    renderWithHelp(
      "project-detail",
      <form>
        <label htmlFor="scratch">Scratch note</label>
        <Input id="scratch" name="scratch" defaultValue="" />
        <HelpTopicButton topicId="website-address">
          Why do we need this?
        </HelpTopicButton>
      </form>,
    );

    const input = screen.getByLabelText("Scratch note");
    await user.type(input, "still here");
    await user.click(
      screen.getByRole("button", { name: "Why do we need this?" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: HELP_TOPICS["website-address"].title,
      }),
    ).toBeVisible();
    expect(input).toHaveValue("still here");
  });
});
