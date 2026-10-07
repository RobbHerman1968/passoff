import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewDeadlineField } from "@/components/reviews/review-deadline-field";

const setReviewDeadlineAction = vi.fn();

vi.mock("@/app/(app)/projects/deadline-actions", () => ({
  setReviewDeadlineAction: (...args: unknown[]) => setReviewDeadlineAction(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const scope = { projectId: "p1", reviewId: "r1" };
const future = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

describe("ReviewDeadlineField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state and an accessible date field", async () => {
    const { container } = render(
      <ReviewDeadlineField {...scope} initialDeadline={null} canEdit />,
    );
    expect(screen.getByText("No deadline set")).toBeInTheDocument();
    expect(screen.getByLabelText("Set a deadline")).toHaveAttribute("type", "datetime-local");
    expect(screen.queryByRole("button", { name: "Clear deadline" })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is read-only for people who cannot edit", () => {
    render(
      <ReviewDeadlineField {...scope} initialDeadline={future().toISOString()} canEdit={false} />,
    );
    expect(screen.getByText("Feedback deadline")).toBeInTheDocument();
    expect(screen.queryByLabelText(/deadline$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("flags a deadline that has passed with text, not color alone", () => {
    render(
      <ReviewDeadlineField
        {...scope}
        initialDeadline={new Date(Date.now() - 60 * 60 * 1000).toISOString()}
        canEdit={false}
      />,
    );
    expect(screen.getByText("Past due")).toBeInTheDocument();
  });

  it("blocks a past date with a friendly message and does not call the server", async () => {
    const user = userEvent.setup();
    render(<ReviewDeadlineField {...scope} initialDeadline={null} canEdit />);

    const input = screen.getByLabelText("Set a deadline");
    await user.type(input, "2020-01-01T09:00");
    await user.click(screen.getByRole("button", { name: "Save deadline" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a date and time in the future, or clear the deadline.",
    );
    expect(setReviewDeadlineAction).not.toHaveBeenCalled();
  });

  it("saves a future deadline and can clear it", async () => {
    const when = future();
    setReviewDeadlineAction.mockResolvedValueOnce({ ok: true, deadline: when.toISOString() });
    const user = userEvent.setup();
    render(<ReviewDeadlineField {...scope} initialDeadline={null} canEdit />);

    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
    await user.type(screen.getByLabelText("Set a deadline"), local);
    await user.click(screen.getByRole("button", { name: "Save deadline" }));

    await waitFor(() => expect(setReviewDeadlineAction).toHaveBeenCalledTimes(1));
    expect(setReviewDeadlineAction.mock.calls[0][0]).toMatchObject({
      ...scope,
      deadline: expect.stringMatching(/Z$/),
    });

    setReviewDeadlineAction.mockResolvedValueOnce({ ok: true, deadline: null });
    await user.click(await screen.findByRole("button", { name: "Clear deadline" }));
    await waitFor(() =>
      expect(setReviewDeadlineAction).toHaveBeenLastCalledWith({ ...scope, deadline: null }),
    );
    expect(await screen.findByText("No deadline set")).toBeInTheDocument();
  });

  it("keeps the entered value and explains a server failure", async () => {
    setReviewDeadlineAction.mockResolvedValueOnce({
      ok: false,
      message: "We couldn’t save the deadline. Your other changes are safe. Try again.",
    });
    const when = future();
    const user = userEvent.setup();
    render(
      <ReviewDeadlineField {...scope} initialDeadline={when.toISOString()} canEdit />,
    );
    const input = screen.getByLabelText("Change deadline") as HTMLInputElement;
    const before = input.value;
    await user.click(screen.getByRole("button", { name: "Save deadline" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save the deadline.");
    expect(input.value).toBe(before);
  });
});
