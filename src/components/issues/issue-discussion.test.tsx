import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueDiscussion } from "@/components/issues/issue-discussion";
import type { IssueCommentView } from "@/lib/comments/types";

const createIssueCommentAction = vi.fn();

vi.mock("@/app/(app)/projects/comment-actions", () => ({
  createIssueCommentAction: (...args: unknown[]) => createIssueCommentAction(...args),
}));

vi.mock("@/components/issues/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

const members = [
  { userId: "member-1", displayName: "Maya Chen" },
  { userId: "member-2", displayName: "Sam Rivera" },
];

function makeComment(
  overrides: Partial<IssueCommentView> = {},
): IssueCommentView {
  return {
    id: overrides.id ?? "comment-1",
    body: overrides.body ?? "Looks good on mobile.",
    visibility: overrides.visibility ?? "public",
    authorDisplayName: overrides.authorDisplayName ?? "Maya Chen",
    authorKind: overrides.authorKind ?? "member",
    createdAt: overrides.createdAt ?? "2026-10-07T12:00:00.000Z",
    mentions: overrides.mentions ?? [],
  };
}

describe("IssueDiscussion", () => {
  beforeEach(() => {
    createIssueCommentAction.mockReset();
  });

  it("shows an empty discussion state", () => {
    render(
      <IssueDiscussion
        projectId="p1"
        reviewId="r1"
        issueNumber={3}
        initialComments={[]}
        members={members}
      />,
    );
    expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();
    expect(screen.getByText("No replies yet")).toBeInTheDocument();
    expect(screen.getByTestId("comment-count")).toHaveTextContent("0 comments");
  });

  it("renders a public reply and a private-note indicator for members", () => {
    render(
      <IssueDiscussion
        projectId="p1"
        reviewId="r1"
        issueNumber={3}
        initialComments={[
          makeComment({ id: "c1", body: "Public reply from guest", authorKind: "guest" }),
          makeComment({
            id: "c2",
            body: "Internal plan",
            visibility: "private",
            authorDisplayName: "Sam Rivera",
          }),
        ]}
        members={members}
      />,
    );
    expect(screen.getByText("Public reply from guest")).toBeInTheDocument();
    expect(screen.getByText("Guest reviewer")).toBeInTheDocument();
    expect(screen.getByText("Internal plan")).toBeInTheDocument();
    const privateArticle = screen.getByText("Internal plan").closest("article");
    expect(privateArticle).toBeTruthy();
    expect(
      within(privateArticle as HTMLElement).getByText("Private note"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("comment-count")).toHaveTextContent("2 comments");
  });

  it("submits a reply, preserves text on recoverable errors, and supports keyboard visibility", async () => {
    const user = userEvent.setup();
    createIssueCommentAction
      .mockResolvedValueOnce({
        ok: false,
        message: "We couldn’t save that reply. Try again.",
      })
      .mockResolvedValueOnce({
        ok: true,
        comment: makeComment({
          id: "c-new",
          body: "Saved after retry",
          authorDisplayName: "You",
          visibility: "private",
        }),
      });

    render(
      <IssueDiscussion
        projectId="p1"
        reviewId="r1"
        issueNumber={3}
        initialComments={[]}
        members={members}
      />,
    );

    const reply = screen.getByLabelText("Reply");
    await user.type(reply, "Saved after retry");

    const privateOption = screen.getByLabelText(/Private note/i);
    await user.click(privateOption);
    expect(privateOption).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add private note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn’t save that reply/i,
    );
    expect(reply).toHaveValue("Saved after retry");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByText("Saved after retry")).toBeInTheDocument();
    });
    expect(screen.getByTestId("discussion-status")).toHaveTextContent(
      "Private note added.",
    );
    expect(createIssueCommentAction).toHaveBeenCalledTimes(2);
  });

  it("supports accessible mention selection", async () => {
    const user = userEvent.setup();
    createIssueCommentAction.mockResolvedValue({
      ok: true,
      comment: makeComment({
        id: "c-mention",
        body: "Hi @Maya Chen",
        mentions: [{ userId: "member-1", displayName: "Maya Chen" }],
      }),
    });

    render(
      <IssueDiscussion
        projectId="p1"
        reviewId="r1"
        issueNumber={3}
        initialComments={[]}
        members={members}
      />,
    );

    const reply = screen.getByLabelText("Reply");
    await user.click(reply);
    await user.paste("Hi @Maya");
    const listbox = await screen.findByRole("listbox", {
      name: /Mention a teammate/i,
      hidden: true,
    });
    expect(within(listbox).getByRole("option", { name: "Maya Chen" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect((reply as HTMLTextAreaElement).value).toMatch(/@Maya Chen/);

    await user.click(screen.getByRole("button", { name: "Add reply" }));
    await waitFor(() => {
      expect(createIssueCommentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          mentionedUserIds: ["member-1"],
        }),
      );
    });
  });

  it("has no serious accessibility violations in the empty state", async () => {
    const { container } = render(
      <IssueDiscussion
        projectId="p1"
        reviewId="r1"
        issueNumber={3}
        initialComments={[]}
        members={members}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
  it("links a video note to its moment, and warns when the video is gone", async () => {
    const selected = vi.fn();
    window.addEventListener("passoff:video-note-select", selected);
    const user = userEvent.setup();
    render(
      <IssueDiscussion
        projectId="p1"
        reviewId="r1"
        issueNumber={3}
        initialComments={[
          {
            ...makeComment({ id: "c1", body: "Cut off here" }),
            videoNote: {
              annotationId: "a1",
              timestampMs: 42_000,
              hasPin: true,
              videoState: "current",
            },
          },
          {
            ...makeComment({ id: "c2", body: "Old note" }),
            videoNote: {
              annotationId: "a2",
              timestampMs: 5_000,
              hasPin: false,
              videoState: "replaced",
            },
          },
        ]}
        members={members}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Go to 42 seconds in the video" }));
    expect(selected).toHaveBeenCalledTimes(1);
    expect((selected.mock.calls[0][0] as CustomEvent).detail).toEqual({ annotationId: "a1" });
    expect(screen.getByText(/Note at 0:05 on an earlier video/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /in the video$/ })).toHaveLength(1);
    expect(document.getElementById("issue-discussion-reply")).toBeTruthy();
    window.removeEventListener("passoff:video-note-select", selected);
  });
});
