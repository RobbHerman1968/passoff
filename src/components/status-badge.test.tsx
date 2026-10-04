import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/status-badge";
import { ISSUE_STATUS_LABELS, ISSUE_STATUSES } from "@/lib/issues/statuses";

describe("StatusBadge", () => {
  it("keeps a visible text label for every issue status", () => {
    render(
      <>
        {ISSUE_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </>,
    );

    for (const status of ISSUE_STATUSES) {
      expect(screen.getByText(ISSUE_STATUS_LABELS[status])).toBeVisible();
    }
  });
});
