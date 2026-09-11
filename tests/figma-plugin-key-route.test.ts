import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  project: {
    id: "project-1",
    keyHash: null as string | null,
    keyCreatedAt: null as Date | null,
  },
  updateSet: null as Record<string, unknown> | null,
  updatedRows: [{ id: "project-1" }],
}));

const update = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [state.project],
        }),
      }),
    }),
    update,
  },
}));

vi.mock("@/db/schema", () => ({
  clientProjects: {
    id: "id",
    organizationId: "organizationId",
    workspaceId: "workspaceId",
    figmaPluginKeyHash: "figmaPluginKeyHash",
    figmaPluginKeyCreatedAt: "figmaPluginKeyCreatedAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("@/lib/auth/authorization", () => ({ authzResponse: () => null }));
vi.mock("@/lib/tenant/context", () => ({
  getTenantContextForProjectKey: async () => ({
    organizationId: "org-1",
    workspaceId: "workspace-1",
    projectId: "room-1",
    clientProjectId: "project-1",
  }),
}));

import { GET, POST } from "@/app/api/integrations/figma/plugin-key/route";
import { verifyProjectPluginKey } from "@/lib/figma/plugin-key";

describe("project Figma plugin key route", () => {
  beforeEach(() => {
    state.project.keyHash = null;
    state.project.keyCreatedAt = null;
    state.updateSet = null;
    state.updatedRows = [{ id: "project-1" }];
    update.mockReset();
    update.mockImplementation(() => ({
      set: (values: Record<string, unknown>) => {
        state.updateSet = values;
        return {
          where: () => ({
            returning: async () => state.updatedRows,
          }),
        };
      },
    }));
  });

  it("reports whether the project already has a key", async () => {
    state.project.keyHash = "a".repeat(64);
    state.project.keyCreatedAt = new Date("2026-09-08T00:00:00.000Z");
    const response = await GET(new Request("http://localhost/api/integrations/figma/plugin-key?projectKey=room-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      configured: true,
      createdAt: "2026-09-08T00:00:00.000Z",
    });
  });

  it("generates a plaintext key once and stores only its hash", async () => {
    const response = await POST(new Request("http://localhost/api/integrations/figma/plugin-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey: "room-1" }),
    }));
    const payload = await response.json() as { key: string; rotated: boolean };

    expect(response.status).toBe(201);
    expect(payload.key).toMatch(/^pofig_[A-Za-z0-9_-]{43}$/);
    expect(payload.rotated).toBe(false);
    expect(state.updateSet).not.toHaveProperty("key");
    expect(verifyProjectPluginKey(payload.key, state.updateSet?.figmaPluginKeyHash as string)).toBe(true);
  });

  it("requires explicit rotation and replaces the existing project hash", async () => {
    state.project.keyHash = "b".repeat(64);
    const duplicate = await POST(new Request("http://localhost/api/integrations/figma/plugin-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey: "room-1" }),
    }));
    expect(duplicate.status).toBe(409);
    expect(update).not.toHaveBeenCalled();

    const rotated = await POST(new Request("http://localhost/api/integrations/figma/plugin-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey: "room-1", rotate: true }),
    }));
    const payload = await rotated.json() as { key: string; rotated: boolean };

    expect(rotated.status).toBe(201);
    expect(payload.rotated).toBe(true);
    expect(verifyProjectPluginKey(payload.key, state.updateSet?.figmaPluginKeyHash as string)).toBe(true);
  });
});
