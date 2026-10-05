import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueTriage } from "@/components/issues/issue-triage";
import type { IssueListItem } from "@/lib/issues/list";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  usePathname: () => "/projects/p1/reviews/r1",
  useSearchParams: () => new URLSearchParams(),
}));

function makeIssue(overrides: Partial<IssueListItem> = {}): IssueListItem {
  return {
    id: overrides.id ?? "issue-1",
    number: overrides.number ?? 12,
    body: overrides.body ?? "Header overlaps navigation",
    displayTitle: overrides.displayTitle ?? "Header overlaps navigation",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "high",
    pageRoute: overrides.pageRoute ?? "/pricing",
    pageTitle: overrides.pageTitle ?? "Pricing",
    reporterDisplayName: overrides.reporterDisplayName ?? "Guest Reviewer",
    assigneeDisplayName: overrides.assigneeDisplayName ?? "Unassigned",
    assigneeUserId: overrides.assigneeUserId ?? null,
    hasScreenshotEvidence: overrides.hasScreenshotEvidence ?? true,
    screenshotCaptureStatus: overrides.screenshotCaptureStatus ?? "ready",
    hasVideoEvidence: overrides.hasVideoEvidence ?? false,
    createdAt: overrides.createdAt ?? new Date("2026-10-01T12:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-10-02T12:00:00.000Z"),
  };
}

describe("IssueTriage", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders list rows with accessible names and priority text", () => {
    render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1 }}
        issues={[makeIssue()]}
        total={1}
        page={1}
        pageCount={1}
        facets={{
          priorities: ["high"],
          pages: [{ route: "/pricing", title: "Pricing" }],
          assignees: [],
          hasUnassigned: true,
          hasVideo: false,
        }}
        installed
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Issue 12: Header overlaps navigation, Open, High priority, has screenshot.",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getByText("Unassigned")).toBeVisible();
    expect(screen.queryByText("Select an issue to read")).toBeNull();
  });

  it("links each row to the dedicated issue route and preserves list state", () => {
    render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "header", show: "verified", p: 2 }}
        issues={[makeIssue()]}
        total={1}
        page={2}
        pageCount={3}
        facets={{
          priorities: ["high"],
          pages: [],
          assignees: [],
          hasUnassigned: true,
          hasVideo: false,
        }}
        installed
      />,
    );

    const link = screen.getByRole("link", {
      name: "Issue 12: Header overlaps navigation, Open, High priority, has screenshot.",
    });
    expect(link).toHaveAttribute(
      "href",
      "/projects/p1/reviews/r1/issues/12?return=q%3Dheader%26show%3Dverified%26p%3D2",
    );
    expect(link).not.toHaveAttribute("href", expect.stringContaining("issue="));
  });

  it("shows filtered-empty state without a side preview", () => {
    render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "zzz", show: "active", p: 1 }}
        issues={[]}
        total={0}
        page={1}
        pageCount={1}
        facets={{
          priorities: [],
          pages: [],
          assignees: [],
          hasUnassigned: false,
          hasVideo: false,
        }}
        installed
      />,
    );

    expect(screen.getByRole("heading", { name: "No matching issues" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "This issue isn’t available" })).toBeNull();
  });

  it("supports keyboard focus on an issue row link", async () => {
    const user = userEvent.setup();
    render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1 }}
        issues={[makeIssue()]}
        total={1}
        page={1}
        pageCount={1}
        facets={{
          priorities: ["high"],
          pages: [],
          assignees: [],
          hasUnassigned: true,
          hasVideo: false,
        }}
        installed
      />,
    );

    const link = screen.getByRole("link", {
      name: "Issue 12: Header overlaps navigation, Open, High priority, has screenshot.",
    });
    link.focus();
    expect(link).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(link).toHaveAttribute(
      "href",
      "/projects/p1/reviews/r1/issues/12",
    );
  });

  it("keeps the list full width without a preview column", () => {
    const { container } = render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1 }}
        issues={[makeIssue()]}
        total={1}
        page={1}
        pageCount={1}
        facets={{
          priorities: ["high"],
          pages: [],
          assignees: [],
          hasUnassigned: true,
          hasVideo: false,
        }}
        installed
      />,
    );

    expect(container.querySelector(".lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_20rem\\]")).toBeNull();
    expect(screen.queryByText("Browser reconstruction")).toBeNull();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1 }}
        issues={[makeIssue({ hasVideoEvidence: true })]}
        total={1}
        page={1}
        pageCount={1}
        facets={{
          priorities: ["high", "low"],
          pages: [{ route: "/pricing", title: "Pricing" }],
          assignees: [{ userId: "u1", displayName: "Maya" }],
          hasUnassigned: true,
          hasVideo: true,
        }}
        installed
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
    expect(
      within(container).getByRole("search", {
        name: "Search and filter issues",
      }),
    ).toBeVisible();
  });
});
