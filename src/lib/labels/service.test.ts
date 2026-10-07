import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { activityEvents, issueLabels } from "@/db/schema";
import {
  attachLabelToIssue,
  createLabel,
  detachLabelFromIssue,
  listIssueLabels,
  listLabelsForIssues,
  listWorkspaceLabels,
} from "@/lib/labels/service";
import { MAX_LABELS_PER_ISSUE } from "@/lib/labels/types";
import { addWorkspaceMember, seedReviewWithIssue } from "@/test/workspace-fixtures";

describe("labels service", { timeout: 60_000 }, () => {
  it("creates a label once per name (ignoring case) and lists it for the workspace", async () => {
    const seeded = await seedReviewWithIssue("lblcreate");
    const first = await createLabel(seeded.context, { name: "  Copy  ", color: "blue" });
    expect(first.ok && first.created).toBe(true);
    const second = await createLabel(seeded.context, { name: "copy" });
    expect(second.ok && !second.created).toBe(true);
    if (first.ok && second.ok) expect(second.label.id).toBe(first.label.id);

    const listed = await listWorkspaceLabels(seeded.context);
    expect(listed.map((label) => label.name)).toEqual(["Copy"]);

    const invalid = await createLabel(seeded.context, { name: "   " });
    expect(invalid.ok).toBe(false);
  });

  it("attaches and detaches a label, writing plain-language history only on real changes", async () => {
    const seeded = await seedReviewWithIssue("lblattach");
    const created = await createLabel(seeded.context, { name: "Layout" });
    if (!created.ok) throw new Error("label");

    const attached = await attachLabelToIssue(seeded.context, {
      ...seeded.scope,
      labelId: created.label.id,
    });
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    expect(attached.labels.map((label) => label.name)).toEqual(["Layout"]);
    expect(attached.event?.summary).toMatch(/added the label “Layout”\.$/);

    const again = await attachLabelToIssue(seeded.context, {
      ...seeded.scope,
      labelId: created.label.id,
    });
    expect(again.ok && again.event).toBeNull();

    const detached = await detachLabelFromIssue(seeded.context, {
      ...seeded.scope,
      labelId: created.label.id,
    });
    expect(detached.ok && detached.labels).toEqual([]);
    if (detached.ok) expect(detached.event?.summary).toMatch(/removed the label “Layout”\.$/);

    const repeat = await detachLabelFromIssue(seeded.context, {
      ...seeded.scope,
      labelId: created.label.id,
    });
    expect(repeat.ok && repeat.event).toBeNull();

    const events = await db
      .select({ type: activityEvents.type })
      .from(activityEvents)
      .where(eq(activityEvents.issueId, seeded.issueId));
    expect(events.filter((e) => e.type === "issue.label_added")).toHaveLength(1);
    expect(events.filter((e) => e.type === "issue.label_removed")).toHaveLength(1);
  });

  it("denies cross-workspace labels, issues, and wrong project or review scope", async () => {
    const mine = await seedReviewWithIssue("lblmine");
    const other = await seedReviewWithIssue("lblother");
    const foreign = await createLabel(other.context, { name: "Foreign" });
    const own = await createLabel(mine.context, { name: "Own" });
    if (!foreign.ok || !own.ok) throw new Error("labels");

    // A label from another workspace cannot be attached to my issue.
    const crossLabel = await attachLabelToIssue(mine.context, {
      ...mine.scope,
      labelId: foreign.label.id,
    });
    expect(crossLabel.ok).toBe(false);

    // I cannot label an issue that belongs to another workspace.
    const crossIssue = await attachLabelToIssue(mine.context, {
      ...other.scope,
      labelId: own.label.id,
    });
    expect(crossIssue.ok).toBe(false);

    // Mismatched review/project scope does not resolve.
    const wrongReview = await attachLabelToIssue(mine.context, {
      ...mine.scope,
      reviewId: other.reviewId,
      labelId: own.label.id,
    });
    expect(wrongReview.ok).toBe(false);
    const wrongProject = await attachLabelToIssue(mine.context, {
      ...mine.scope,
      projectId: other.projectId,
      labelId: own.label.id,
    });
    expect(wrongProject.ok).toBe(false);

    expect(await listIssueLabels(mine.context, other.scope)).toBeNull();
    expect(await db.select().from(issueLabels).where(eq(issueLabels.issueId, other.issueId))).toEqual(
      [],
    );
  });

  it("lets other members add labels and caps labels per issue", async () => {
    const seeded = await seedReviewWithIssue("lbllimit");
    const member = await addWorkspaceMember(seeded.context, "lblmember");

    for (let index = 0; index < MAX_LABELS_PER_ISSUE; index += 1) {
      const created = await createLabel(member, { name: `Label ${index}` });
      if (!created.ok) throw new Error("label");
      const attached = await attachLabelToIssue(member, {
        ...seeded.scope,
        labelId: created.label.id,
      });
      expect(attached.ok).toBe(true);
    }
    const extra = await createLabel(member, { name: "One too many" });
    if (!extra.ok) throw new Error("label");
    const blocked = await attachLabelToIssue(member, {
      ...seeded.scope,
      labelId: extra.label.id,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe("limit");

    const map = await listLabelsForIssues(member, [seeded.issueId]);
    expect(map.get(seeded.issueId)).toHaveLength(MAX_LABELS_PER_ISSUE);
  });
});
