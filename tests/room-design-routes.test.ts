import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const tenantContext = vi.hoisted(() => ({
  getTenantContextForRoomKey: vi.fn(),
  getTenantContextForClientProjectKey: vi.fn(),
  getTenantContextForProjectKey: vi.fn(),
  normalizeProjectKey: vi.fn((value: unknown) => String(value ?? "").trim()),
}));
const projects = vi.hoisted(() => ({
  getClientProjectBundle: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/tenant/context", () => tenantContext);
vi.mock("@/lib/projects/service", () => projects);
vi.mock("@/components/workspace-header", () => ({ WorkspaceHeader: () => null }));

const roomId = "11111111-2222-4333-8444-555555555555";
const projectId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const tenant = {
  organizationId: "org-1",
  workspaceId: "workspace-1",
  projectId,
  roomId,
  roomName: "Launch room",
  projectSlug: "launch-project",
  projectName: "Launch project",
  clientName: "Acme",
  userId: "user-1",
  organizationName: "Studio",
  workspaceName: "Main",
  userName: "Owner",
  userEmail: "owner@example.com",
};

describe("room design routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantContext.normalizeProjectKey.mockImplementation((value: unknown) => String(value ?? "").trim());
    tenantContext.getTenantContextForRoomKey.mockResolvedValue(tenant);
    projects.getClientProjectBundle.mockResolvedValue({
      project: { id: projectId },
      rooms: [{ id: roomId, name: "Launch room", status: "DRAFT" }],
      stats: {},
    });
  });

  it("builds room and canonical designs destinations safely", async () => {
    const {
      projectDesignPath,
      projectRoomDesignsPath,
      projectRoomPath,
      roomPath,
      roomDesignsPath,
    } = await import("@/lib/rooms/routes");
    expect(roomPath("room / one")).toBe("/rooms/room%20%2F%20one");
    expect(roomDesignsPath(roomId)).toBe(`/rooms/${roomId}/designs`);
    expect(projectRoomPath(projectId, roomId)).toBe(`/projects/${projectId}/rooms/${roomId}`);
    expect(projectRoomDesignsPath(projectId, roomId)).toBe(
      `/projects/${projectId}/rooms/${roomId}/designs`,
    );
    expect(projectDesignPath(projectId, "file / one", { roomId, screen: "Home" })).toBe(
      `/projects/${projectId}/designs/file%20%2F%20one?room=${roomId}&screen=Home`,
    );
  });

  it("scopes stored preview URLs to the durable project", async () => {
    const { previewPublicUrl } = await import("@/lib/figma/preview-storage");
    expect(previewPublicUrl("file-1", "12:34", projectId)).toBe(
      `/api/integrations/figma/previews?fileKey=file-1&nodeId=12%3A34&projectKey=${projectId}`,
    );
  });

  it("renders the reused design-file dashboard for an authorized room", async () => {
    const { default: RoomDesignsPage } = await import("@/app/projects/[key]/rooms/[id]/designs/page");
    const element = await RoomDesignsPage({
      params: Promise.resolve({ key: projectId, id: roomId }),
    });

    expect(tenantContext.getTenantContextForRoomKey).toHaveBeenCalledWith(roomId);
    expect(element.props.children[1].props).toMatchObject({
      projectKey: projectId,
      roomName: "Launch room",
      clientName: "Acme",
      roomId,
      backHref: `/projects/${projectId}/rooms/${roomId}`,
    });
  });

  it("redirects the legacy room designs URL to its nested project URL", async () => {
    const { default: LegacyRoomDesignsPage } = await import("@/app/rooms/[id]/designs/page");
    await expect(
      LegacyRoomDesignsPage({ params: Promise.resolve({ id: roomId }) }),
    ).rejects.toThrow(`NEXT_REDIRECT:/projects/${projectId}/rooms/${roomId}/designs`);
  });

  it.each([
    ["unauthenticated", new Error("Unauthorized")],
    ["cross-tenant", new Error("Not found")],
  ])("returns not found for %s room design access", async (_label, failure) => {
    tenantContext.getTenantContextForRoomKey.mockRejectedValueOnce(failure);
    const { default: RoomDesignsPage } = await import("@/app/projects/[key]/rooms/[id]/designs/page");

    await expect(
      RoomDesignsPage({ params: Promise.resolve({ key: projectId, id: roomId }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });

});
