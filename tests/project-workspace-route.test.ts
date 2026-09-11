import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
const context = vi.hoisted(() => ({
  getDefaultWorkspaceScope: vi.fn(),
}));
const projects = vi.hoisted(() => ({
  getClientProjectBundle: vi.fn(),
}));
const entitlements = vi.hoisted(() => ({
  getOrganizationEntitlements: vi.fn(),
  getWorkspaceUsageSummary: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/tenant/context", () => context);
vi.mock("@/lib/projects/service", () => projects);
vi.mock("@/lib/rooms/entitlements", () => entitlements);
vi.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

describe("project workspace route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.getDefaultWorkspaceScope.mockResolvedValue({
      organizationId: "org-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      userName: "Owner",
      userEmail: "owner@example.com",
    });
    projects.getClientProjectBundle.mockResolvedValue({
      project: { id: "project-1", name: "Website", clientName: "Acme" },
      rooms: [{ id: "room-1", name: "Client review", status: "DRAFT" }],
      stats: {
        designFileCount: 2,
        designVersionCount: 4,
        screenCount: 12,
        roomCount: 1,
        publishedRevisionCount: 1,
        approvedRoomCount: 0,
        designStorageBytes: 1024,
        attachmentStorageBytes: 1024,
        storageBytes: 2048,
      },
    });
    entitlements.getOrganizationEntitlements.mockResolvedValue({ canCreateRooms: true, planId: "solo" });
    entitlements.getWorkspaceUsageSummary.mockResolvedValue({
      maxActiveRooms: 5,
      roomCount: 1,
      usedBytes: 0,
      maxStorageBytes: 1_000,
    });
  });

  it("renders a durable project with its approval rooms", async () => {
    const { default: ProjectPage } = await import("@/app/projects/[key]/page");
    const element = await ProjectPage({ params: Promise.resolve({ key: "project-1" }) });
    const workspace = element.props.children[1].props.children;
    expect(projects.getClientProjectBundle).toHaveBeenCalledWith("workspace-1", "project-1");
    expect(workspace.props.project).toMatchObject({ id: "project-1", name: "Website" });
    expect(workspace.props.initialRooms).toEqual([{ id: "room-1", name: "Client review", status: "DRAFT" }]);
    expect(workspace.props.stats).toMatchObject({ designFileCount: 2, screenCount: 12, storageBytes: 2048 });
    expect(workspace.props.maxStorageBytes).toBe(1_000);
  });

  it("renders the project workspace when it has zero rooms", async () => {
    projects.getClientProjectBundle.mockResolvedValueOnce({
      project: { id: "project-1", name: "Website", clientName: "Acme" },
      rooms: [],
      stats: {
        designFileCount: 0,
        designVersionCount: 0,
        screenCount: 0,
        roomCount: 0,
        publishedRevisionCount: 0,
        approvedRoomCount: 0,
        designStorageBytes: 0,
        attachmentStorageBytes: 0,
        storageBytes: 0,
      },
    });
    const { default: ProjectPage } = await import("@/app/projects/[key]/page");
    const element = await ProjectPage({ params: Promise.resolve({ key: "project-1" }) });
    const workspace = element.props.children[1].props.children;
    expect(workspace.props.project.id).toBe("project-1");
    expect(workspace.props.initialRooms).toEqual([]);
  });

  it("returns not found when the project is outside the active workspace", async () => {
    projects.getClientProjectBundle.mockRejectedValueOnce(new Error("Project not found."));
    const { default: ProjectPage } = await import("@/app/projects/[key]/page");
    await expect(ProjectPage({ params: Promise.resolve({ key: "other" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
