import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalSnapshotJson,
  publicDeveloperHandoffSnapshot,
  snapshotSha256,
  type DeveloperHandoffSnapshotDto,
} from "@/lib/developer-handoff/snapshot";
import {
  generateDeveloperHandoffToken,
  hashDeveloperHandoffToken,
  isDeveloperHandoffToken,
} from "@/lib/developer-handoff/token";
import { generateShareToken } from "@/lib/rooms/crypto";

function fixture(): DeveloperHandoffSnapshotDto {
  return {
    schemaVersion: 1,
    snapshotId: "snapshot-id",
    version: 3,
    project: { id: "project-id", name: "Website", clientName: "Acme" },
    approvedRevision: {
      id: "revision-id",
      number: 2,
      contentDigest: "revision-digest",
      approvalId: "approval-id",
      approvedAt: "2026-09-07T12:00:00.000Z",
      approverDisplayName: "Client Approver",
    },
    publishedByDisplayName: "Designer",
    publishedAt: "2026-09-07T13:00:00.000Z",
    file: {
      key: "file-key",
      name: "Website",
      figmaVersion: "1",
      figmaLastModified: "2026-09-07T12:00:00.000Z",
      mainScreenId: null,
      breakpointGroups: [],
      screens: [],
      interactions: [],
    },
  };
}

describe("developer handoff snapshot integrity", () => {
  it("canonicalizes object keys and produces a stable SHA-256 digest", () => {
    const snapshot = fixture();
    const reordered = {
      ...snapshot,
      project: {
        clientName: snapshot.project.clientName,
        name: snapshot.project.name,
        id: snapshot.project.id,
      },
    };
    const canonical = canonicalSnapshotJson(snapshot);
    expect(canonicalSnapshotJson(reordered)).toBe(canonical);
    expect(snapshotSha256(snapshot)).toBe(
      createHash("sha256").update(canonical, "utf8").digest("hex"),
    );
  });

  it("retains array order and rejects non-canonical values", () => {
    const first = fixture();
    const second = fixture();
    first.file.screens = [
      {
        id: "b",
        name: "B",
        type: "FRAME",
        width: null,
        height: null,
        x: null,
        y: null,
        sortOrder: 0,
        breakpointGroupId: null,
        preview: null,
        explanations: [],
      },
      {
        id: "a",
        name: "A",
        type: "FRAME",
        width: null,
        height: null,
        x: null,
        y: null,
        sortOrder: 1,
        breakpointGroupId: null,
        preview: null,
        explanations: [],
      },
    ];
    second.file.screens = [...first.file.screens].reverse();
    expect(snapshotSha256(first)).not.toBe(snapshotSha256(second));
    expect(() =>
      canonicalSnapshotJson({ ...fixture(), version: Number.NaN }),
    ).toThrow(/non-finite/i);
  });

  it("converts private media handles to token-authorized public URLs", () => {
    const snapshot = fixture();
    snapshot.file.screens = [{
      id: "1:2",
      name: "Home",
      type: "FRAME",
      width: 100,
      height: 200,
      x: 0,
      y: 0,
      sortOrder: 0,
      breakpointGroupId: null,
      preview: {
        mediaId: "private-media-id",
        contentType: "image/png",
        bytes: 123,
        sha256: "abc",
      },
      explanations: [],
    }];
    const publicSnapshot = publicDeveloperHandoffSnapshot("dev_token", snapshot);
    expect(publicSnapshot.file.screens[0].preview).toMatchObject({
      url: "/api/developer-handoff/dev_token/screens/private-media-id",
      contentType: "image/png",
    });
    expect(publicSnapshot).not.toHaveProperty("snapshotId");
    expect(publicSnapshot.project).not.toHaveProperty("id");
    expect(publicSnapshot.approvedRevision).not.toHaveProperty("id");
    expect(publicSnapshot.approvedRevision).not.toHaveProperty("approvalId");
    expect(publicSnapshot.approvedRevision).not.toHaveProperty("contentDigest");
    expect(publicSnapshot.file.screens[0].preview).not.toHaveProperty("mediaId");
    expect(publicSnapshot.file.screens[0]).not.toHaveProperty("inspectTree");
  });
});

describe("developer handoff token namespace", () => {
  it("uses a dedicated prefix and never accepts a client share token", () => {
    const developer = generateDeveloperHandoffToken();
    expect(isDeveloperHandoffToken(developer)).toBe(true);
    expect(isDeveloperHandoffToken(generateShareToken())).toBe(false);
    expect(hashDeveloperHandoffToken(developer)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeveloperHandoffToken(developer)).not.toContain(developer);
  });
});
