import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

describe("dialogs and sheets", () => {
  it("traps focus in a dialog and restores it on close", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open review details</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review details</DialogTitle>
              <DialogDescription>
                This review is open for client feedback.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </AppProviders>,
    );

    const trigger = screen.getByRole("button", { name: "Open review details" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Review details" });
    const closeButton = within(dialog).getByRole("button", { name: "Close" });
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Review details" })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("names what a destructive confirmation will remove", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ConfirmDialog
          title="Delete this project?"
          description="This will permanently remove the Acme website review and its feedback. This cannot be undone."
          confirmLabel="Delete project"
          trigger={<Button variant="destructive">Delete project</Button>}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Delete project" }));
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName(
      "Delete this project?",
    );
    expect(
      screen.getByText(/permanently remove the Acme website review/i),
    ).toBeVisible();
  });
});
