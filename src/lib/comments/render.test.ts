import { describe, expect, it } from "vitest";

import { splitCommentBody } from "@/lib/comments/render";

describe("splitCommentBody", () => {
  it("returns plain text when there are no mentions", () => {
    expect(splitCommentBody("Hello team", [])).toEqual([
      { type: "text", value: "Hello team" },
    ]);
  });

  it("highlights mentioned display names", () => {
    const parts = splitCommentBody("Hi @Maya — please check.", [
      { userId: "u1", displayName: "Maya" },
    ]);
    expect(parts).toEqual([
      { type: "text", value: "Hi " },
      { type: "mention", value: "@Maya", userId: "u1" },
      { type: "text", value: " — please check." },
    ]);
  });

  it("prefers longer mention names when overlapping", () => {
    const parts = splitCommentBody("Ping @Maya Chen please", [
      { userId: "u1", displayName: "Maya" },
      { userId: "u2", displayName: "Maya Chen" },
    ]);
    expect(parts.some((part) => part.type === "mention" && part.value === "@Maya Chen")).toBe(
      true,
    );
  });
});
