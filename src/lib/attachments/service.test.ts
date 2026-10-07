import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { assets } from "@/db/schema";
import {
  attachAssetToIssue,
  detachAttachmentFromIssue,
  listAttachableAssets,
  listGuestVisibleIssueAttachments,
  listIssueAttachments,
  setAttachmentVisibility,
} from "@/lib/attachments/service";
import { ATTACHMENT_MAX_BYTES } from "@/lib/attachments/types";
import { seedReviewWithIssue } from "@/test/workspace-fixtures";

async function insertAsset(
  seeded: { context: { workspaceId: string }; reviewId: string },
  overrides: Partial<typeof assets.$inferInsert> = {},
) {
  const [row] = await db
    .insert(assets)
    .values({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      kind: "attachment",
      status: "ready",
      storageProvider: "test",
      storageKey: `attachments/${randomUUID()}.png`,
      originalFileName: "../../etc/passwd.png",
      mimeType: "image/png",
      byteSize: 2048,
      ...overrides,
    })
    .returning({ id: assets.id });
  return row.id;
}

describe("attachments service", { timeout: 60_000 }, () => {
  it("attaches a file privately by default and never lists private files to guests", async () => {
    const seeded = await seedReviewWithIssue("attprivate");
    const privateId = await insertAsset(seeded);
    const publicId = await insertAsset(seeded, { originalFileName: "mock.png" });

    const candidates = await listAttachableAssets(seeded.context, seeded.scope);
    expect(candidates?.map((c) => c.assetId).sort()).toEqual([privateId, publicId].sort());
    // File names are treated as untrusted: no folders, no control characters.
    expect(candidates?.find((c) => c.assetId === privateId)?.fileName).toBe("passwd.png");

    const first = await attachAssetToIssue(seeded.context, {
      ...seeded.scope,
      assetId: privateId,
      isPrivate: true,
    });
    const second = await attachAssetToIssue(seeded.context, {
      ...seeded.scope,
      assetId: publicId,
      isPrivate: false,
    });
    expect(first.ok && second.ok).toBe(true);

    const memberView = await listIssueAttachments(seeded.context, seeded.scope);
    expect(memberView).toHaveLength(2);

    const guestView = await listGuestVisibleIssueAttachments({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
    });
    expect(guestView.map((item) => item.assetId)).toEqual([publicId]);
    expect(JSON.stringify(guestView)).not.toContain(privateId);

    // Attached files stop appearing as candidates.
    const remaining = await listAttachableAssets(seeded.context, seeded.scope);
    expect(remaining).toEqual([]);
  });

  it("can change visibility and detach, hiding files from guests as soon as they go private", async () => {
    const seeded = await seedReviewWithIssue("attvis");
    const assetId = await insertAsset(seeded, { originalFileName: "spec.png" });
    await attachAssetToIssue(seeded.context, { ...seeded.scope, assetId, isPrivate: false });

    const guestArgs = {
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
    };
    expect(await listGuestVisibleIssueAttachments(guestArgs)).toHaveLength(1);

    const hidden = await setAttachmentVisibility(seeded.context, {
      ...seeded.scope,
      assetId,
      isPrivate: true,
    });
    expect(hidden.ok).toBe(true);
    expect(await listGuestVisibleIssueAttachments(guestArgs)).toHaveLength(0);

    const removed = await detachAttachmentFromIssue(seeded.context, { ...seeded.scope, assetId });
    expect(removed.ok && removed.attachments).toEqual([]);
  });

  it("denies cross-workspace and cross-review files and issues", async () => {
    const mine = await seedReviewWithIssue("attmine");
    const other = await seedReviewWithIssue("attother");
    const foreignAsset = await insertAsset(other);

    const crossFile = await attachAssetToIssue(mine.context, {
      ...mine.scope,
      assetId: foreignAsset,
      isPrivate: false,
    });
    expect(crossFile.ok).toBe(false);

    const ownAsset = await insertAsset(mine);
    const crossIssue = await attachAssetToIssue(mine.context, {
      ...other.scope,
      assetId: ownAsset,
      isPrivate: false,
    });
    expect(crossIssue.ok).toBe(false);

    expect(await listIssueAttachments(mine.context, other.scope)).toBeNull();
    expect(await listAttachableAssets(mine.context, other.scope)).toBeNull();
    // A guest session for another review sees nothing.
    expect(
      await listGuestVisibleIssueAttachments({
        workspaceId: other.context.workspaceId,
        reviewId: other.reviewId,
        issueId: mine.issueId,
      }),
    ).toEqual([]);
  });

  it("rejects unsupported types, oversized files, and files that are not ready", async () => {
    const seeded = await seedReviewWithIssue("attvalid");
    const exe = await insertAsset(seeded, { mimeType: "application/x-msdownload" });
    const huge = await insertAsset(seeded, { byteSize: ATTACHMENT_MAX_BYTES + 1 });
    const pending = await insertAsset(seeded, { status: "pending" });

    for (const assetId of [exe, huge, pending]) {
      const result = await attachAssetToIssue(seeded.context, {
        ...seeded.scope,
        assetId,
        isPrivate: false,
      });
      expect(result.ok).toBe(false);
    }
    expect(await listIssueAttachments(seeded.context, seeded.scope)).toEqual([]);
  });
});
