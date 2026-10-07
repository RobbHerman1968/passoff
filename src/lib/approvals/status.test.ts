import { describe, expect, it } from "vitest";

import {
  APPROVAL_STATE_TONE,
  approvalStateLabel,
  deriveApprovalVisibleState,
} from "@/lib/approvals/status";
import {
  APPROVAL_NOTE_MAX_LENGTH,
  validateApprovalNote,
} from "@/lib/approvals/types";

const CURRENT = "deployment-v13";
const OLDER = "deployment-v12";

describe("deriveApprovalVisibleState", () => {
  it("is not requested when nothing has happened", () => {
    expect(deriveApprovalVisibleState([], CURRENT)).toBe("not_requested");
  });

  it("shows waiting only for a request on the current version", () => {
    expect(
      deriveApprovalVisibleState(
        [{ state: "awaiting_decision", deploymentId: CURRENT }],
        CURRENT,
      ),
    ).toBe("awaiting_approval");
    // A stale request for an older version is not "waiting" for this version.
    expect(
      deriveApprovalVisibleState(
        [{ state: "awaiting_decision", deploymentId: OLDER }],
        CURRENT,
      ),
    ).toBe("not_requested");
  });

  it("reports the decision on the current version", () => {
    expect(
      deriveApprovalVisibleState([{ state: "approved", deploymentId: CURRENT }], CURRENT),
    ).toBe("approved");
    expect(
      deriveApprovalVisibleState(
        [{ state: "changes_requested", deploymentId: CURRENT }],
        CURRENT,
      ),
    ).toBe("changes_requested");
  });

  it("turns an approval for an older version into a historical approval", () => {
    expect(
      deriveApprovalVisibleState([{ state: "approved", deploymentId: OLDER }], CURRENT),
    ).toBe("historical_approval");
  });

  it("prefers a fresh request over a historical approval", () => {
    expect(
      deriveApprovalVisibleState(
        [
          { state: "awaiting_decision", deploymentId: CURRENT },
          { state: "approved", deploymentId: OLDER },
        ],
        CURRENT,
      ),
    ).toBe("awaiting_approval");
  });

  it("falls back to superseded when only replaced requests remain", () => {
    expect(
      deriveApprovalVisibleState([{ state: "superseded", deploymentId: CURRENT }], CURRENT),
    ).toBe("superseded");
    expect(
      deriveApprovalVisibleState([{ state: "cancelled", deploymentId: CURRENT }], CURRENT),
    ).toBe("not_requested");
  });
});

describe("approval labels", () => {
  it("always names the version and never implies coverage of future versions", () => {
    expect(
      approvalStateLabel({ state: "approved", currentVersionLabel: "v12" }),
    ).toBe("Approved for v12");
    expect(
      approvalStateLabel({
        state: "historical_approval",
        currentVersionLabel: "v13",
        approvedVersionLabel: "v12",
      }),
    ).toBe("Approved for v12");
    expect(
      approvalStateLabel({ state: "awaiting_approval", currentVersionLabel: "v13" }),
    ).toBe("Waiting for approval on v13");
    expect(
      approvalStateLabel({ state: "changes_requested", currentVersionLabel: "v13" }),
    ).toBe("Changes requested on v13");
  });

  it("mutes historical approvals", () => {
    expect(APPROVAL_STATE_TONE.historical_approval).toBe("muted");
    expect(APPROVAL_STATE_TONE.approved).toBe("positive");
  });
});

describe("validateApprovalNote", () => {
  it("requires a note when requesting changes", () => {
    const empty = validateApprovalNote("changes_requested", "   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toMatch(/what needs to change/i);

    const given = validateApprovalNote("changes_requested", "  Fix the footer ");
    expect(given).toEqual({ ok: true, note: "Fix the footer" });
  });

  it("keeps notes optional for approvals", () => {
    expect(validateApprovalNote("approved", undefined)).toEqual({ ok: true, note: null });
    expect(validateApprovalNote("approved", "Looks good")).toEqual({
      ok: true,
      note: "Looks good",
    });
  });

  it("rejects notes that are too long", () => {
    const tooLong = "x".repeat(APPROVAL_NOTE_MAX_LENGTH + 1);
    expect(validateApprovalNote("approved", tooLong).ok).toBe(false);
    expect(validateApprovalNote("approved", "x".repeat(APPROVAL_NOTE_MAX_LENGTH)).ok).toBe(
      true,
    );
  });
});
