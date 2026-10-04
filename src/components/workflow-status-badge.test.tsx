import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "jest-axe";

import {
  ProjectStatusBadge,
  ReviewStatusBadge,
} from "@/components/workflow-status-badge";

describe("workflow status badges", () => {
  it("shows visible text for project and review statuses", () => {
    render(
      <>
        <ProjectStatusBadge status="active" />
        <ProjectStatusBadge status="archived" />
        <ReviewStatusBadge status="draft" />
        <ReviewStatusBadge status="open" />
        <ReviewStatusBadge status="draft" archived />
      </>,
    );

    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getAllByText("Archived").length).toBe(2);
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.getByText("Open")).toBeVisible();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = render(
      <>
        <ProjectStatusBadge status="active" />
        <ReviewStatusBadge status="closed" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
