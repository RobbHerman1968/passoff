import { describe, expect, it } from "vitest";

import {
  PROJECT_DESIGN_VERSION_SCHEMA,
  projectDesignContentSha256,
  type ProjectDesignVersionPayload,
} from "@/lib/projects/design-version";

function payload(sourceVersion: string, name = "Home"): ProjectDesignVersionPayload {
  return {
    schemaVersion: PROJECT_DESIGN_VERSION_SCHEMA,
    file: {
      key: "file-key",
      name: "Website",
      sourceVersion,
      sourceLastModified: "2026-09-07T12:00:00.000Z",
      mainScreenId: "1:2",
      thumbnailScreenId: null,
    },
    screens: [{
      id: "1:2",
      name,
      type: "FRAME",
      width: 1440,
      height: 900,
      x: 0,
      y: 0,
      interactionCount: 0,
      sortOrder: 0,
      breakpointGroupId: null,
      preview: null,
    }],
    interactions: [],
    breakpointGroups: [],
    inspectTrees: [],
    warnings: [],
  };
}

describe("project design version digest", () => {
  it("ignores source labels but changes with normalized design content", () => {
    expect(projectDesignContentSha256(payload("1"))).toBe(
      projectDesignContentSha256(payload("2")),
    );
    expect(projectDesignContentSha256(payload("1"))).not.toBe(
      projectDesignContentSha256(payload("1", "Updated home")),
    );
  });
});
