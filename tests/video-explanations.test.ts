import { describe, expect, it } from "vitest";

import { serializeVideoExplanation } from "@/lib/projects/video";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  workspaceId: "00000000-0000-4000-8000-000000000003",
  projectId: "00000000-0000-4000-8000-000000000004",
  designId: "00000000-0000-4000-8000-000000000005",
  designVersionId: "00000000-0000-4000-8000-000000000006",
  authorUserId: "00000000-0000-4000-8000-000000000007",
  authorDisplayName: "Designer",
  targetType: "video",
  videoTimeMs: 1250,
  category: "intent",
  title: "Pause",
  body: "Hold this frame.",
  status: "draft",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("video explanation responses", () => {
  it("exposes edit capability without tenant or author identifiers", () => {
    const serialized = serializeVideoExplanation(base, base.authorUserId);
    expect(serialized).toMatchObject({ canEdit: true, canMoveToDraft: false, status: "draft" });
    expect(serialized).not.toHaveProperty("authorUserId");
    expect(serialized).not.toHaveProperty("organizationId");
    expect(serialized).not.toHaveProperty("workspaceId");
    expect(serialized).not.toHaveProperty("projectId");
  });

  it("does not permit other users or published rows to edit", () => {
    expect(serializeVideoExplanation(base, "other-user").canEdit).toBe(false);
    expect(serializeVideoExplanation({ ...base, status: "published" }, base.authorUserId).canEdit).toBe(false);
    expect(serializeVideoExplanation({ ...base, status: "published" }, base.authorUserId).canMoveToDraft).toBe(true);
    expect(serializeVideoExplanation({ ...base, status: "published" }, "other-user").canMoveToDraft).toBe(false);
  });
});
