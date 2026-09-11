import { describe, expect, it } from "vitest";

import {
  formatApprovalReferenceId,
  serializeApprovalReceipt,
  serializePublicApprovalReceipt,
  shortenDigest,
} from "@/lib/rooms/approval-receipt";
import { DEFAULT_APPROVAL_STATEMENT } from "@/lib/rooms/types";

describe("approval receipt serialization", () => {
  const source = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    decision: "approved",
    acceptanceStatement: DEFAULT_APPROVAL_STATEMENT,
    contentDigest: "abcdef0123456789deadbeef0123456789abcdef0123456789deadbeef01234567",
    approvedAt: "2026-09-06T18:30:00.000Z",
    supersededAt: null,
    projectName: "Harbor & Co. Website",
    clientName: "Harbor & Co.",
    revisionId: "r2-id",
    revisionNumber: 2,
    reviewerName: "Alex Rivera",
    reviewerEmail: "alex.rivera@example.com",
    assetNames: ["Homepage hero", "Menu — mobile", "Contact page"],
    designVersions: [{
      designId: "design-1",
      designVersionId: "design-version-3",
      designName: "Checkout flow",
      versionNumber: 3,
      contentSha256: "design-content-sha256",
      screenNames: ["Checkout", "Payment"],
    }],
  };

  it("derives a short reference id from the approval uuid", () => {
    expect(formatApprovalReferenceId(source.id)).toBe("PO-A1B2C3D4");
  });

  it("serializes receipt fields from the approval record for owners", () => {
    const receipt = serializeApprovalReceipt(source, { includeReviewerEmail: true });
    expect(receipt.statusLabel).toBe("Approved");
    expect(receipt.referenceId).toBe("PO-A1B2C3D4");
    expect(receipt.revisionNumber).toBe(2);
    expect(receipt.reviewerName).toBe("Alex Rivera");
    expect(receipt.reviewerEmail).toBe("alex.rivera@example.com");
    expect(receipt.assetCount).toBe(3);
    expect(receipt.assetNames).toEqual(source.assetNames);
    expect(receipt.designCount).toBe(1);
    expect(receipt.reviewedItemCount).toBe(4);
    expect(receipt.designVersions).toEqual(source.designVersions);
    expect(receipt.contentDigest).toBe(source.contentDigest);
    expect(receipt.digestShort).toBe(shortenDigest(source.contentDigest));
    expect(receipt.boundToFrozenRevision).toBe(true);
    expect(receipt.acceptanceStatement).toBe(DEFAULT_APPROVAL_STATEMENT);
  });

  it("omits reviewer email from public share serialization", () => {
    const receipt = serializePublicApprovalReceipt(source);
    expect(receipt.reviewerEmail).toBeNull();
    expect(receipt.reviewerName).toBe("Alex Rivera");
    expect(receipt.referenceId).toBe("PO-A1B2C3D4");
  });

  it("can omit reviewer email for privacy-sensitive surfaces", () => {
    const receipt = serializeApprovalReceipt(source, { includeReviewerEmail: false });
    expect(receipt.reviewerEmail).toBeNull();
    expect(receipt.reviewerName).toBe("Alex Rivera");
  });

  it("does not invent a separate digest or statement", () => {
    const receipt = serializeApprovalReceipt(source);
    expect(receipt.contentDigest).toBe(source.contentDigest);
    expect(receipt.acceptanceStatement).toBe(source.acceptanceStatement);
    expect(receipt.id).toBe(source.id);
  });
});
