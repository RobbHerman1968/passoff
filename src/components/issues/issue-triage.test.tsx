import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueTriage } from "@/components/issues/issue-triage";
import type { IssueListItem, IssuePreview } from "@/lib/issues/list";

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

function makePreview(overrides: Partial<IssuePreview> = {}): IssuePreview {
  return {
    ...makeIssue(overrides),
    environmentName: "Production",
    versionLabel: "v1",
    screenshotCaptureMethod: "browser_reconstruction",
    ...overrides,
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
        name: "Issue 12: Header overlaps navigation, Open, High priority.",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getByText("Unassigned")).toBeVisible();
  });

  it("shows filtered-empty and unavailable selected issue states", () => {
    const { rerender } = render(
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

    rerender(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1, issue: 99 }}
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
        selectedIssueNumber={99}
        selectedUnavailable
        installed
      />,
    );

    expect(
      screen.getByRole("heading", { name: "This issue isn’t available" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to issues" })).toBeVisible();
  });

  it("shows screenshot states in the selected issue preview", () => {
    const { rerender } = render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1, issue: 12 }}
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
        selectedIssueNumber={12}
        selectedIssue={makePreview()}
        installed
      />,
    );

    expect(screen.getByText("Browser reconstruction")).toBeVisible();
    expect(
      screen.getByText(
        /created in the reviewer’s browser and may not match the page pixel for pixel/i,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Browser reconstruction for issue 12",
      }),
    ).toHaveAttribute(
      "src",
      "/api/projects/p1/reviews/r1/issues/12/screenshot",
    );

    rerender(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1, issue: 12 }}
        issues={[makeIssue({ screenshotCaptureStatus: "pending" })]}
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
        selectedIssueNumber={12}
        selectedIssue={makePreview({ screenshotCaptureStatus: "pending" })}
        installed
      />,
    );
    expect(screen.getByText("The picture is still being prepared.")).toBeVisible();

    rerender(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1, issue: 12 }}
        issues={[makeIssue({ screenshotCaptureStatus: "failed" })]}
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
        selectedIssueNumber={12}
        selectedIssue={makePreview({ screenshotCaptureStatus: "failed" })}
        installed
      />,
    );
    expect(screen.getByText("The picture could not be prepared.")).toBeVisible();
  });

  it("supports keyboard selection of an issue row", async () => {
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
      name: "Issue 12: Header overlaps navigation, Open, High priority.",
    });
    link.focus();
    expect(link).toHaveFocus();
    await user.keyboard("{Enter}");
    // Link navigation is handled by Next; ensure the control remains operable.
    expect(link).toHaveAttribute("href", expect.stringContaining("issue=12"));
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <IssueTriage
        projectId="p1"
        reviewId="r1"
        pathname="/projects/p1/reviews/r1"
        filters={{ q: "", show: "active", p: 1, issue: 12 }}
        issues={[makeIssue()]}
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
        selectedIssueNumber={12}
        selectedIssue={makePreview()}
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
