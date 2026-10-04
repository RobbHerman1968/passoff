import { describe, expect, it } from "vitest";

import { LEGACY_ISSUE_STATUS_MAP } from "@/lib/issues/statuses";

describe("legacy issue status mapping", () => {
  it("does not treat resolved as verified", () => {
    expect(LEGACY_ISSUE_STATUS_MAP.resolved).toEqual({
      status: "ready_for_verification",
      closureReason: null,
    });
    expect(LEGACY_ISSUE_STATUS_MAP.ready_for_review).toEqual({
      status: "ready_for_verification",
      closureReason: null,
    });
    expect(LEGACY_ISSUE_STATUS_MAP.not_planned).toEqual({
      status: "closed",
      closureReason: "not_planned",
    });
  });
});
