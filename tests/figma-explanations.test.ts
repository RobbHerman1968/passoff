import { describe, expect, it } from "vitest";

import {
  buildFigmaExplanationsUrl,
  FIGMA_EXPLANATION_CATEGORIES,
  isValidFigmaCoordinate,
  parseCreateFigmaExplanation,
  parseUpdateFigmaExplanation,
  toggleFigmaAuthoringMode,
} from "@/lib/figma/explanation-contract";
import { serializeFigmaExplanation } from "@/lib/figma/explanations";

const validCreate = {
  projectKey: "123e4567-e89b-42d3-a456-426614174000",
  fileKey: "Figma_file-1",
  fileName: "Website",
  screenId: "1:2",
  screenName: "Home",
  figmaNodeId: "2:3",
  figmaNodeName: "Statistics",
  x: 25.25,
  y: 75.5,
  category: "data",
  title: "Approved case-study data",
  body: "Statistics come from approved CMS case studies.",
  status: "published",
};

describe("Figma explanation contracts", () => {
  it("accepts every supported category and rejects unsupported categories", () => {
    for (const category of FIGMA_EXPLANATION_CATEGORIES) {
      expect(parseCreateFigmaExplanation({ ...validCreate, category })?.category).toBe(category);
    }
    expect(parseCreateFigmaExplanation({ ...validCreate, category: "review_comment" })).toBeNull();
  });

  it("validates finite coordinates from zero through one hundred", () => {
    expect(isValidFigmaCoordinate(0)).toBe(true);
    expect(isValidFigmaCoordinate(100)).toBe(true);
    for (const value of [-0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY, "50"]) {
      expect(isValidFigmaCoordinate(value)).toBe(false);
    }
    expect(parseCreateFigmaExplanation({ ...validCreate, x: Number.NaN })).toBeNull();
    expect(parseUpdateFigmaExplanation({ projectKey: validCreate.projectKey, id: "one", x: 2 })).toBeNull();
  });

  it("enforces title, body, status, and editable-field limits", () => {
    expect(parseCreateFigmaExplanation(validCreate)).toMatchObject({
      title: validCreate.title,
      body: validCreate.body,
      status: "published",
    });
    expect(parseCreateFigmaExplanation({ ...validCreate, title: "x".repeat(121) })).toBeNull();
    expect(parseCreateFigmaExplanation({ ...validCreate, body: "x".repeat(4001) })).toBeNull();
    expect(parseCreateFigmaExplanation({ ...validCreate, status: "archived" })).toBeNull();
    expect(parseUpdateFigmaExplanation({ projectKey: validCreate.projectKey, id: "one" })).toBeNull();
    expect(parseUpdateFigmaExplanation({
      projectKey: validCreate.projectKey,
      id: "one",
      x: 10,
      y: 20,
      status: "draft",
    })).toMatchObject({ x: 10, y: 20, status: "draft" });
  });

  it("serializes normalized positions, publication state, and authorship", () => {
    const createdAt = new Date("2026-09-07T12:00:00.000Z");
    const updatedAt = new Date("2026-09-07T13:00:00.000Z");
    const base = {
      id: "explanation-1",
      organizationId: "organization-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      authorUserId: "user-1",
      figmaFileKey: "file-1",
      figmaFileName: "Website",
      screenId: "1:2",
      screenName: "Home",
      figmaNodeId: null,
      figmaNodeName: null,
      xBasisPoints: 2525,
      yBasisPoints: 7550,
      category: "data",
      title: validCreate.title,
      body: validCreate.body,
      status: "published",
      createdAt,
      updatedAt,
    };
    expect(serializeFigmaExplanation(base, "Designer", "user-1")).toMatchObject({
      x: 25.25,
      y: 75.5,
      status: "published",
      authorName: "Designer",
      authorUserId: "user-1",
      canEdit: true,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
    expect(serializeFigmaExplanation({ ...base, status: "draft" }, "Designer", "user-2")).toMatchObject({
      status: "draft",
      canEdit: false,
    });
    expect(serializeFigmaExplanation(
      { ...base, authorUserId: null },
      "Former member",
      "user-2",
    )).toMatchObject({
      authorName: "Former member",
      authorUserId: null,
      canEdit: false,
    });
  });

  it("threads the explicit project key and keeps authoring modes exclusive", () => {
    const url = new URL(buildFigmaExplanationsUrl("project id", "file/key", "1:2"), "https://passoff.test");
    expect(url.searchParams.get("projectKey")).toBe("project id");
    expect(url.searchParams.get("fileKey")).toBe("file/key");
    expect(url.searchParams.get("screenId")).toBe("1:2");

    expect(toggleFigmaAuthoringMode(null, "comment")).toBe("comment");
    expect(toggleFigmaAuthoringMode("comment", "explain")).toBe("explain");
    expect(toggleFigmaAuthoringMode("explain", "comment")).toBe("comment");
    expect(toggleFigmaAuthoringMode("explain", "explain")).toBeNull();
  });
});
