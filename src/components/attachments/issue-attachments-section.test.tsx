import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueAttachmentsSection } from "@/components/attachments/issue-attachments-section";
import type { AttachmentView } from "@/lib/attachments/types";

const attachFileToIssueAction = vi.fn();
const removeIssueAttachmentAction = vi.fn();
const setAttachmentVisibilityAction = vi.fn();

vi.mock("@/app/(app)/projects/attachment-actions", () => ({
  attachFileToIssueAction: (...args: unknown[]) => attachFileToIssueAction(...args),
  removeIssueAttachmentAction: (...args: unknown[]) => removeIssueAttachmentAction(...args),
  setAttachmentVisibilityAction: (...args: unknown[]) => setAttachmentVisibilityAction(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const scope = { projectId: "p1", reviewId: "r1", issueNumber: 7 };
const privateFile: AttachmentView = {
  assetId: "a1",
  fileName: "brief.pdf",
  mimeType: "application/pdf",
  byteSize: 2048,
  isPrivate: true,
  attachedAt: "2026-10-07T12:00:00.000Z",
};
const publicFile: AttachmentView = {
  ...privateFile,
  assetId: "a2",
  fileName: "mockup.png",
  mimeType: "image/png",
  isPrivate: false,
};

describe("IssueAttachmentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists files with a text label for who can see each one", async () => {
    const { container } = render(
      <IssueAttachmentsSection
        {...scope}
        initialAttachments={[privateFile, publicFile]}
        attachable={[]}
        canEdit
      />,
    );
    const list = screen.getByRole("list", { name: "Files attached to this issue" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("brief.pdf");
    expect(items[0]).toHaveTextContent("Private — team only");
    expect(items[1]).toHaveTextContent("mockup.png");
    expect(items[1]).toHaveTextContent("Visible to reviewers");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows an empty state with a next step when nothing is attached or available", () => {
    render(
      <IssueAttachmentsSection {...scope} initialAttachments={[]} attachable={[]} canEdit />,
    );
    expect(screen.getByText("No files are attached to this issue yet.")).toBeInTheDocument();
    expect(screen.getByText(/No other files are available in this review yet/)).toBeInTheDocument();
  });

  it("is read-only when the person cannot edit", () => {
    render(
      <IssueAttachmentsSection
        {...scope}
        initialAttachments={[privateFile]}
        attachable={[]}
        canEdit={false}
      />,
    );
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("switches a file between private and visible", async () => {
    setAttachmentVisibilityAction.mockResolvedValue({
      ok: true,
      attachments: [{ ...privateFile, isPrivate: false }],
    });
    const user = userEvent.setup();
    render(
      <IssueAttachmentsSection
        {...scope}
        initialAttachments={[privateFile]}
        attachable={[]}
        canEdit
      />,
    );
    await user.click(screen.getByRole("button", { name: /Show to reviewers/ }));
    await waitFor(() =>
      expect(setAttachmentVisibilityAction).toHaveBeenCalledWith({
        ...scope,
        assetId: "a1",
        isPrivate: false,
      }),
    );
    expect(await screen.findByText("Visible to reviewers")).toBeInTheDocument();
  });

  it("confirms before removing a file from the issue and shows server problems", async () => {
    removeIssueAttachmentAction.mockResolvedValue({
      ok: false,
      message: "We couldn’t save that attachment change. Try again.",
    });
    const user = userEvent.setup();
    render(
      <IssueAttachmentsSection
        {...scope}
        initialAttachments={[privateFile]}
        attachable={[]}
        canEdit
      />,
    );
    await user.click(screen.getByRole("button", { name: /Remove brief\.pdf from this issue/ }));
    expect(await screen.findByText("Remove this file from the issue?")).toBeInTheDocument();
    expect(removeIssueAttachmentAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove from issue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save that attachment change. Try again.",
    );
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
  });
});
