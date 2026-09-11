// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/projects/room-1/project-files/file-1",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  EmptyRoomDesignsCallToAction,
  RoomSectionNavigation,
} from "@/app/rooms/[id]/room-design-navigation";
import { RoomsDashboard } from "@/app/dashboard/rooms-dashboard";
import { ProjectFilesDashboard } from "@/app/projects/[key]/project-files-dashboard";
import { ProjectDesigns } from "@/app/projects/[key]/project-files/[fileKey]/project-designs";
import { ProjectWorkspace } from "@/app/projects/[key]/project-workspace";

let container: HTMLDivElement;
let root: Root;

function buttonNamed(name: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith(name));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("room design navigation", () => {
  it("keeps project-level Design files inside the project journey", async () => {
    await act(async () => {
      root.render(
        React.createElement(ProjectWorkspace, {
          project: { id: "project-1", name: "Launch", clientName: "Acme" },
          stats: {
            designFileCount: 2,
            designVersionCount: 4,
            screenCount: 12,
            roomCount: 1,
            publishedRevisionCount: 1,
            approvedRoomCount: 0,
            designStorageBytes: 12_000_000,
            attachmentStorageBytes: 3_000_000,
            storageBytes: 15_000_000,
          },
          initialRooms: [{ id: "room-1", name: "Review", status: "DRAFT" }],
          canCreateRooms: true,
          maxActiveRooms: 5,
          activeRoomCount: 1,
          maxStorageBytes: 100_000_000,
        }),
      );
    });

    expect(container.querySelector('a[href="/projects/project-1/designs"]')?.textContent).toContain(
      "Design files",
    );
  });

  it("keeps normal room opening on the room workspace route", async () => {
    await act(async () => {
      root.render(
        React.createElement(RoomsDashboard, {
          workspaceName: "Main",
          rooms: [
            { id: "room / one", name: "Launch", clientName: "Acme", slug: "launch", status: "DRAFT" },
          ],
          planId: "solo",
          maxActiveRooms: 10,
          canCreateRooms: true,
          isExpired: false,
        }),
      );
    });

    expect(container.querySelector('a[href="/rooms/room%20%2F%20one"]')?.textContent).toContain("Open Room");
  });

  it("exposes the canonical Designs destination and active state", async () => {
    await act(async () => {
      root.render(React.createElement(RoomSectionNavigation, {
        projectId: "project / one",
        roomId: "room / one",
        active: "designs",
      }));
    });

    const designs = [...container.querySelectorAll("a")].find((link) => link.textContent === "Designs");
    expect(designs?.getAttribute("href")).toBe(
      "/projects/project%20%2F%20one/rooms/room%20%2F%20one/designs",
    );
    expect(designs?.getAttribute("aria-current")).toBe("page");
  });

  it("gives an empty room a visible Add designs call to action", async () => {
    await act(async () => {
      root.render(
        React.createElement(EmptyRoomDesignsCallToAction, {
          busy: false,
          archived: false,
          onUpload: vi.fn(),
          onAddFromDesigns: vi.fn(),
        }),
      );
    });

    expect(container.textContent).toContain("Add designs to this room");
    expect(container.textContent?.toLowerCase()).toContain("import a figma file or upload screen images");
    expect(buttonNamed("Add from Designs")).toBeTruthy();
  });

  it("reuses the Figma, image, and blank-file add-designs workflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/integrations/figma/status")) {
          return new Response(JSON.stringify({ configured: false, connected: false, pluginConfigured: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/api/integrations/figma/plugin-key")) {
          const payload = init?.method === "POST"
            ? { key: `pofig_${"a".repeat(43)}`, createdAt: "2026-09-08T00:00:00.000Z" }
            : { configured: false, createdAt: null };
          return new Response(JSON.stringify(payload), {
            status: init?.method === "POST" ? 201 : 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ imports: [], designs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await act(async () => {
      root.render(
        React.createElement(ProjectFilesDashboard, {
          projectKey: "room-1",
          roomName: "Launch room",
          clientName: "Acme",
        }),
      );
      await Promise.resolve();
    });

    await act(async () => buttonNamed("Add designs")?.click());
    expect(container.textContent).toContain("Import from Figma");
    expect(container.textContent).toContain("Import Images");
    expect(container.textContent).toContain("Create blank file");

    await act(async () => buttonNamed("Import from Figma")?.click());
    expect(container.textContent).toContain("Figma REST API");
    expect(container.textContent).toContain("Local Figma plugin");

    await act(async () => {
      buttonNamed("Local Figma plugin")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("figma-plugin/manifest.json");
    expect((container.querySelector('input[aria-label="Project ID"]') as HTMLInputElement)?.value).toBe("room-1");
    expect(buttonNamed("Copy")).toBeTruthy();
    expect(container.textContent).toContain("Generate project key");

    await act(async () => {
      buttonNamed("Generate project key")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((container.querySelector('input[aria-label="Project plugin key"]') as HTMLInputElement)?.value).toBe(`pofig_${"a".repeat(43)}`);
    expect(container.textContent).toContain("shown once");

    await act(async () => buttonNamed("Back")?.click());
    await act(async () => buttonNamed("Figma REST API")?.click());
    expect(container.textContent).toContain("Figma integration must be configured");
  });

  it("keeps imported file detail on its working route with a canonical back link", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    await act(async () => {
      root.render(
        React.createElement(ProjectDesigns, {
          projectKey: "room-1",
          fileKey: "file-1",
          backHref: "/projects/project-1/rooms/room-1/designs",
        }),
      );
    });

    const back = container.querySelector('a[href="/projects/project-1/rooms/room-1/designs"]');
    expect(back?.textContent).toContain("Back to room designs");
  });
});
