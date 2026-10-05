import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotificationItem } from "@/components/notifications/notification-item";

describe("NotificationItem", () => {
  it("includes unread text that is not color-only", () => {
    render(
      <NotificationItem
        id="11111111-1111-4111-8111-111111111111"
        type="issue.assigned"
        hrefPath="/projects/p/reviews/r/issues/24"
        createdAt={new Date("2026-10-04T12:00:00.000Z")}
        readAt={null}
        data={{
          workspaceName: "Studio",
          projectName: "Launch",
          reviewName: "Homepage review",
          actorName: "Jamie",
          issueNumber: 24,
        }}
      />,
    );
    expect(screen.getByText("Issue #24 was assigned to you.")).toBeInTheDocument();
    expect(screen.getByText("Unread.", { exact: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View issue" })).toBeInTheDocument();
  });
});
