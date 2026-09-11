import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { clampPercent, computeRevisionDigest, hashShareToken } from "@/lib/rooms/crypto";
import { DEFAULT_APPROVAL_STATEMENT } from "@/lib/rooms/types";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, buildTenantObjectPath } from "@/lib/rooms/storage";
import { formatPlanPrice, pricingPlans, publicPricingPlans } from "@/lib/pricing";

describe("revision digests", () => {
  it("is stable for the same ordered checksums", () => {
    const members = [
      { assetId: "a", sortOrder: 0, checksum: "abc" },
      { assetId: "b", sortOrder: 1, checksum: "def" },
    ];
    expect(computeRevisionDigest(members)).toBe(computeRevisionDigest(members));
  });

  it("changes when asset order or checksum changes", () => {
    const a = computeRevisionDigest([
      { assetId: "a", sortOrder: 0, checksum: "abc" },
      { assetId: "b", sortOrder: 1, checksum: "def" },
    ]);
    const b = computeRevisionDigest([
      { assetId: "b", sortOrder: 0, checksum: "def" },
      { assetId: "a", sortOrder: 1, checksum: "abc" },
    ]);
    const c = computeRevisionDigest([
      { assetId: "a", sortOrder: 0, checksum: "zzz" },
      { assetId: "b", sortOrder: 1, checksum: "def" },
    ]);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("binds selected screens while preserving legacy whole-design digests", () => {
    const design = { designVersionId: "version-1", contentSha256: "abc", sortOrder: 0 };
    const wholeDesign = computeRevisionDigest([], [design]);
    const legacyMetadata = computeRevisionDigest([], [{
      ...design,
      displayMetaJson: JSON.stringify({ designName: "Website" }),
    }]);
    const selectedScreens = computeRevisionDigest([], [{
      ...design,
      displayMetaJson: JSON.stringify({ selectedScreenIds: ["screen-b", "screen-a"] }),
    }]);
    const reorderedScreens = computeRevisionDigest([], [{
      ...design,
      displayMetaJson: JSON.stringify({ selectedScreenIds: ["screen-a", "screen-b"] }),
    }]);

    expect(legacyMetadata).toBe(wholeDesign);
    expect(selectedScreens).not.toBe(wholeDesign);
    expect(reorderedScreens).toBe(selectedScreens);
  });
});

describe("share token hashing", () => {
  it("never returns the raw token", () => {
    const raw = "share-token-example-value";
    const hashed = hashShareToken(raw);
    expect(hashed).not.toBe(raw);
    expect(hashed).toBe(createHash("sha256").update(raw).digest("hex"));
  });
});

describe("upload constraints", () => {
  it("allows expected MIME types and 25MB max", () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("image/png");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("application/pdf");
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it("builds tenant-scoped non-guessable pathnames", () => {
    const path = buildTenantObjectPath({
      workspaceId: "ws-1",
      roomId: "room-1",
      revisionId: "rev-1",
      filename: "Hero Draft.png",
    });
    expect(path.startsWith("workspaces/ws-1/rooms/room-1/revisions/rev-1/")).toBe(true);
    expect(path).toMatch(/Hero-Draft\.png$/);
  });
});

describe("pricing first release", () => {
  it("only sells Trial and Solo", () => {
    const purchasable = pricingPlans.filter((p) => p.purchasable);
    expect(purchasable.map((p) => p.id).sort()).toEqual(["solo", "trial"]);
    expect(pricingPlans.find((p) => p.id === "studio")?.comingLater).toBe(true);
    expect(pricingPlans.find((p) => p.id === "agency")?.comingLater).toBe(true);
  });

  it("formats Solo monthly price", () => {
    const solo = pricingPlans.find((p) => p.id === "solo")!;
    expect(formatPlanPrice(solo, "monthly")).toEqual({
      amount: "$19",
      period: "per month",
    });
  });

  it("exposes public plans including coming-later tiers", () => {
    expect(publicPricingPlans.some((p) => p.id === "solo")).toBe(true);
    expect(publicPricingPlans.some((p) => p.comingLater)).toBe(true);
  });
});

describe("approval statement", () => {
  it("provides a non-empty default acceptance statement", () => {
    expect(DEFAULT_APPROVAL_STATEMENT.length).toBeGreaterThan(20);
  });

  it("clamps comment percents to 0..1", () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(150)).toBe(1);
    expect(clampPercent(0.425)).toBe(0.425);
  });
});
