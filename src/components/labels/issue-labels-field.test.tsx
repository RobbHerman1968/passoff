import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueLabelsField } from "@/components/labels/issue-labels-field";
import type { LabelView } from "@/lib/labels/types";

const addIssueLabelAction = vi.fn();
const removeIssueLabelAction = vi.fn();
const createAndAddIssueLabelAction = vi.fn();

vi.mock("@/app/(app)/projects/label-actions", () => ({
  addIssueLabelAction: (...args: unknown[]) => addIssueLabelAction(...args),
  removeIssueLabelAction: (...args: unknown[]) => removeIssueLabelAction(...args),
  createAndAddIssueLabelAction: (...args: unknown[]) => createAndAddIssueLabelAction(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const copy: LabelView = { id: "l1", name: "Copy", color: "blue" };
const layout: LabelView = { id: "l2", name: "Layout", color: "green" };
const scope = { projectId: "p1", reviewId: "r1", issueNumber: 4 };

function renderField(props: Partial<React.ComponentProps<typeof IssueLabelsField>> = {}) {
  return render(
    <IssueLabelsField
      {...scope}
      initialLabels={[copy]}
      workspaceLabels={[copy, layout]}
      canEdit
      {...props}
    />,
  );
}

describe("IssueLabelsField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows label names as text with accessible remove buttons", async () => {
    const { container } = renderField();
    const list = screen.getByRole("list", { name: "Labels on this issue" });
    expect(list).toHaveTextContent("Copy");
    expect(screen.getByRole("button", { name: "Remove label Copy" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("hides editing controls for read-only viewers", () => {
    renderField({ canEdit: false });
    expect(screen.getByRole("list", { name: "Labels on this issue" })).toHaveTextContent("Copy");
    expect(screen.queryByRole("button", { name: /remove label/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add a label")).not.toBeInTheDocument();
  });

  it("explains the empty state", () => {
    renderField({ initialLabels: [] });
    expect(screen.getByText(/No labels yet/)).toBeInTheDocument();
  });

  it("adds an existing label by name and reports the history event", async () => {
    const onHistoryEvent = vi.fn();
    const event = {
      id: "e1",
      type: "issue.label_added" as const,
      createdAt: "2026-10-07T12:00:00.000Z",
      actorDisplayName: "Rob",
      summary: "Rob added the label “Layout”.",
    };
    addIssueLabelAction.mockResolvedValue({
      ok: true,
      labels: [copy, layout],
      event,
      createdLabel: null,
    });
    const user = userEvent.setup();
    renderField({ onHistoryEvent });

    await user.type(screen.getByLabelText("Add a label"), "layout");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    await waitFor(() =>
      expect(addIssueLabelAction).toHaveBeenCalledWith({ ...scope, labelId: "l2" }),
    );
    expect(createAndAddIssueLabelAction).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Remove label Layout" })).toBeInTheDocument();
    expect(onHistoryEvent).toHaveBeenCalledWith(event);
  });

  it("creates a new label when the name is new", async () => {
    const created: LabelView = { id: "l3", name: "Spacing", color: "slate" };
    createAndAddIssueLabelAction.mockResolvedValue({
      ok: true,
      labels: [copy, created],
      event: null,
      createdLabel: created,
    });
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByLabelText("Add a label"), "Spacing");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    await waitFor(() =>
      expect(createAndAddIssueLabelAction).toHaveBeenCalledWith(
        expect.objectContaining({ ...scope, name: "Spacing", color: "slate" }),
      ),
    );
    expect(await screen.findByRole("button", { name: "Remove label Spacing" })).toBeInTheDocument();
  });

  it("removes a label and keeps the person informed when saving fails", async () => {
    removeIssueLabelAction.mockResolvedValueOnce({
      ok: false,
      message: "We couldn’t save that label change. Try again.",
    });
    const user = userEvent.setup();
    renderField();

    await user.click(screen.getByRole("button", { name: "Remove label Copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save that label change. Try again.",
    );
    expect(screen.getByRole("button", { name: "Remove label Copy" })).toBeInTheDocument();

    removeIssueLabelAction.mockResolvedValueOnce({
      ok: true,
      labels: [],
      event: null,
      createdLabel: null,
    });
    await user.click(screen.getByRole("button", { name: "Remove label Copy" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove label Copy" })).not.toBeInTheDocument(),
    );
  });
});
