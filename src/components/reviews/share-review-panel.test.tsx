import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShareReviewPanel } from "@/components/reviews/share-review-panel";

const createShareLinkAction = vi.fn();
const revokeShareLinkAction = vi.fn();

vi.mock("@/app/(app)/projects/actions", () => ({
  createShareLinkAction: (...args: unknown[]) => createShareLinkAction(...args),
  revokeShareLinkAction: (...args: unknown[]) => revokeShareLinkAction(...args),
}));

const scope = { projectId: "p1", reviewId: "r1" };
const link = {
  id: "l1",
  canComment: true,
  canApprove: false,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  lastOpenedAt: null,
};

describe("ShareReviewPanel approval permission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates view-and-comment links by default", async () => {
    createShareLinkAction.mockResolvedValueOnce({ status: "success", url: "https://x.test/r/abc" });
    const user = userEvent.setup();
    render(<ShareReviewPanel {...scope} links={[]} />);
    await user.click(screen.getByRole("button", { name: "Share review" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("switch", { name: "Approve or request changes" })).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Create guest link" }));
    await waitFor(() =>
      expect(createShareLinkAction).toHaveBeenCalledWith({
        ...scope,
        canComment: true,
        canApprove: false,
      }),
    );
  });

  it("creates an approval link when the guest may approve", async () => {
    createShareLinkAction.mockResolvedValueOnce({ status: "success", url: "https://x.test/r/abc" });
    const user = userEvent.setup();
    render(<ShareReviewPanel {...scope} links={[]} />);
    await user.click(screen.getByRole("button", { name: "Share review" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("switch", { name: "Approve or request changes" }));
    await user.click(within(dialog).getByRole("button", { name: "Create guest link" }));
    await waitFor(() =>
      expect(createShareLinkAction).toHaveBeenCalledWith(
        expect.objectContaining({ canApprove: true }),
      ),
    );
  });

  it("shows which active links can approve", async () => {
    const user = userEvent.setup();
    render(
      <ShareReviewPanel
        {...scope}
        links={[link, { ...link, id: "l2", canApprove: true }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share review" }));
    const items = within(await screen.findByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Can comment");
    expect(items[0]).not.toHaveTextContent("can approve");
    expect(items[1]).toHaveTextContent("Can comment, can approve");
  });
});
