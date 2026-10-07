import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isWorkspaceId,
  readActiveWorkspace,
  signActiveWorkspace,
} from "@/lib/workspaces/active-cookie";

const SECRET = "test-secret-for-active-workspace-cookie";

describe("active workspace cookie", () => {
  const userId = randomUUID();
  const workspaceId = randomUUID();

  it("round-trips for the person it was signed for", () => {
    const value = signActiveWorkspace(userId, workspaceId, SECRET);
    expect(readActiveWorkspace(userId, value, SECRET)).toBe(workspaceId);
  });

  it("is ignored for a different person", () => {
    const value = signActiveWorkspace(userId, workspaceId, SECRET);
    expect(readActiveWorkspace(randomUUID(), value, SECRET)).toBeNull();
  });

  it("is ignored when the workspace was swapped", () => {
    const value = signActiveWorkspace(userId, workspaceId, SECRET);
    const forged = `${randomUUID()}.${value.split(".")[1]}`;
    expect(readActiveWorkspace(userId, forged, SECRET)).toBeNull();
  });

  it("is ignored when the signature is changed or the secret differs", () => {
    const value = signActiveWorkspace(userId, workspaceId, SECRET);
    expect(readActiveWorkspace(userId, `${value}x`, SECRET)).toBeNull();
    expect(readActiveWorkspace(userId, value, "another-secret-entirely")).toBeNull();
  });

  it("rejects missing, unsigned, malformed, and oversized values", () => {
    expect(readActiveWorkspace(userId, undefined, SECRET)).toBeNull();
    expect(readActiveWorkspace(userId, "", SECRET)).toBeNull();
    expect(readActiveWorkspace(userId, workspaceId, SECRET)).toBeNull();
    expect(readActiveWorkspace(userId, `${workspaceId}.`, SECRET)).toBeNull();
    expect(readActiveWorkspace(userId, "not-an-id.abc", SECRET)).toBeNull();
    expect(readActiveWorkspace(userId, "a".repeat(500), SECRET)).toBeNull();
  });

  it("recognises workspace ids", () => {
    expect(isWorkspaceId(workspaceId)).toBe(true);
    expect(isWorkspaceId("nope")).toBe(false);
    expect(isWorkspaceId(42)).toBe(false);
  });
});
