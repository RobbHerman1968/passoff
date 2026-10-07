import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import {
  countActiveReviewWebsites,
  getReviewWebsiteCapacity,
  reviewWebsiteBlockedMessage,
  summarizeReviewWebsiteCapacity,
} from "@/lib/billing/review-websites";
import { usageLevel } from "@/lib/billing/usage-notices";
import { setEmailTransportForTests } from "@/lib/email";
import { TestEmailTransport } from "@/lib/email/test-transport";
import {
  archiveProject,
  archiveReview,
  createProject,
  createWebsiteReview,
  restoreProject,
  restoreReview,
} from "@/lib/projects/service";
import { createIssue } from "@/lib/issues/service";
import { createIssueComment } from "@/lib/comments/service";
import {
  addWorkspaceMember,
  createOwnerContext,
  seedWorkspacePlan,
} from "@/test/workspace-fixtures";
import type { WorkspaceContext } from "@/lib/workspaces/context";

beforeEach(() => {
  setEmailTransportForTests(new TestEmailTransport());
});

async function addReview(context: WorkspaceContext, projectId: string, name: string) {
  return createWebsiteReview(context, {
    projectId,
    name,
    websiteUrl: `https://${name.toLowerCase().replaceAll(" ", "-")}.example.com`,
  });
}

async function newProject(context: WorkspaceContext, name = "Limits project") {
  const project = await createProject(context, name);
  if (!project.ok) throw new Error("project failed");
  return project.project.id;
}

describe("review website capacity (pure)", () => {
  it("reads limits from the plan catalog", () => {
    for (const planId of ["free", "studio", "agency"] as const) {
      const capacity = summarizeReviewWebsiteCapacity({ planId, used: 0 });
      expect(capacity.limit).toBe(PLAN_ENTITLEMENTS[planId].activeReviewWebsites);
    }
  });

  it("flags 80% and 100% of a limit, never for unlimited", () => {
    expect(usageLevel(3, 5)).toBe("ok");
    expect(usageLevel(4, 5)).toBe("warning");
    expect(usageLevel(5, 5)).toBe("full");
    expect(usageLevel(9, 5)).toBe("full");
    expect(usageLevel(500, "unlimited")).toBe("ok");
  });

  it("explains the limit to owners and members differently", () => {
    const capacity = summarizeReviewWebsiteCapacity({ planId: "free", used: 1 });
    const owner = reviewWebsiteBlockedMessage(capacity, { isOwner: true });
    const member = reviewWebsiteBlockedMessage(capacity, { isOwner: false });
    expect(owner).toContain("1 active review website");
    expect(owner).toContain("Billing page");
    expect(member).toContain("ask your workspace owner");
    expect(member).not.toContain("Billing page");
    expect(owner).not.toMatch(/stripe|plan_limit|403/i);
  });

  it("has nothing to upgrade to from Agency", () => {
    const capacity = summarizeReviewWebsiteCapacity({ planId: "agency", used: 0 });
    expect(capacity.limit).toBe("unlimited");
  });
});

describe("review website limits (database)", () => {
  it("blocks the second active review website on Free and says what to do", { timeout: 90_000 }, async () => {
    const context = await createOwnerContext("freelimit");
    const projectId = await newProject(context);

    expect((await addReview(context, projectId, "One")).ok).toBe(true);
    const second = await addReview(context, projectId, "Two");
    expect(second).toMatchObject({ ok: false, error: "plan_limit" });
    if (!second.ok) {
      expect(second.message).toContain("Free plan includes 1 active review website");
      expect(second.message).toContain("Billing page");
    }
    expect(await countActiveReviewWebsites(db, context.workspaceId)).toBe(1);
  });

  it("does not let two people squeeze past the limit at the same moment", { timeout: 90_000 }, async () => {
    const context = await createOwnerContext("race");
    const projectId = await newProject(context);

    const results = await Promise.all(
      ["Alpha", "Beta", "Gamma"].map((name) => addReview(context, projectId, name)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await countActiveReviewWebsites(db, context.workspaceId)).toBe(1);
  });

  it("gives members the owner-facing next step instead of a billing link", { timeout: 90_000 }, async () => {
    const owner = await createOwnerContext("memberlimit");
    const member = await addWorkspaceMember(owner, "teammate");
    const projectId = await newProject(owner);
    await addReview(owner, projectId, "One");

    const blocked = await addReview(member, projectId, "Two");
    expect(blocked).toMatchObject({ ok: false, error: "plan_limit" });
    if (!blocked.ok) {
      expect(blocked.message).toContain("ask your workspace owner");
    }
  });

  it("frees room when a review is archived, and blocks restoring it while full", { timeout: 120_000 }, async () => {
    const context = await createOwnerContext("archiveroom");
    const projectId = await newProject(context);

    const first = await addReview(context, projectId, "First");
    if (!first.ok) throw new Error("first failed");
    const archived = await archiveReview(context, {
      projectId,
      reviewId: first.review.id,
      version: 1,
    });
    if (!archived.ok) throw new Error("archive failed");
    expect(await countActiveReviewWebsites(db, context.workspaceId)).toBe(0);

    const second = await addReview(context, projectId, "Second");
    expect(second.ok).toBe(true);

    const restored = await restoreReview(context, {
      projectId,
      reviewId: first.review.id,
      version: archived.review.version,
    });
    expect(restored).toMatchObject({ ok: false, error: "plan_limit" });
  });

  it("blocks restoring an archived project when it would exceed the limit", { timeout: 120_000 }, async () => {
    const context = await createOwnerContext("projectrestore");
    const oldProject = await createProject(context, "Old project");
    if (!oldProject.ok) throw new Error("project failed");
    const oldReview = await addReview(context, oldProject.project.id, "Old review");
    expect(oldReview.ok).toBe(true);

    const archivedProject = await archiveProject(context, {
      projectId: oldProject.project.id,
      version: 1,
    });
    if (!archivedProject.ok) throw new Error("archive project failed");
    expect(await countActiveReviewWebsites(db, context.workspaceId)).toBe(0);

    const newer = await newProject(context, "Newer project");
    expect((await addReview(context, newer, "Newer review")).ok).toBe(true);

    const restored = await restoreProject(context, {
      projectId: oldProject.project.id,
      version: archivedProject.project.version,
    });
    expect(restored).toMatchObject({ ok: false, error: "plan_limit" });
  });

  it("allows up to five on Studio and unlimited on Agency", { timeout: 180_000 }, async () => {
    const studio = await createOwnerContext("studiolimit");
    await seedWorkspacePlan(studio.workspaceId, "studio");
    const studioProject = await newProject(studio);
    const studioLimit = PLAN_ENTITLEMENTS.studio.activeReviewWebsites as number;
    for (let index = 0; index < studioLimit; index += 1) {
      expect((await addReview(studio, studioProject, `Studio ${index}`)).ok).toBe(true);
    }
    expect(await addReview(studio, studioProject, "Studio over")).toMatchObject({
      ok: false,
      error: "plan_limit",
    });
    const capacity = await getReviewWebsiteCapacity(db, studio.workspaceId);
    expect(capacity).toMatchObject({ used: studioLimit, limit: studioLimit, overLimit: false });

    const agency = await createOwnerContext("agencylimit");
    await seedWorkspacePlan(agency.workspaceId, "agency");
    const agencyProject = await newProject(agency);
    for (let index = 0; index < studioLimit + 2; index += 1) {
      expect((await addReview(agency, agencyProject, `Agency ${index}`)).ok).toBe(true);
    }
  });

  it("never blocks reading or written feedback when a workspace is over its limit", { timeout: 120_000 }, async () => {
    const context = await createOwnerContext("overread");
    await seedWorkspacePlan(context.workspaceId, "agency");
    const projectId = await newProject(context);
    const one = await addReview(context, projectId, "Over one");
    const two = await addReview(context, projectId, "Over two");
    if (!one.ok || !two.ok) throw new Error("reviews failed");

    // The plan ends: the workspace is now over the Free limit.
    await seedWorkspacePlan(context.workspaceId, "free");
    const capacity = await getReviewWebsiteCapacity(db, context.workspaceId);
    expect(capacity.overLimit).toBe(true);

    // Written feedback still works on every review.
    const issue = await createIssue(context, { reviewId: two.review.id, body: "Still able to write" });
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    const comment = await createIssueComment(context, {
      projectId,
      reviewId: two.review.id,
      issueNumber: issue.issue.number,
      body: "And reply",
    });
    expect(comment.ok).toBe(true);
  });
});
