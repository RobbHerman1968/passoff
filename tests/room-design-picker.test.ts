// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoomDesignPicker } from "@/app/rooms/[id]/room-design-picker";

let container: HTMLDivElement;
let root: Root;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buttonNamed(name: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith(name));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("room design picker", () => {
  it("adds selected project screens and videos to the room without copying library files", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.startsWith("/api/integrations/figma/import")) {
        return json({
          designs: [{
            key: "home-group",
            designId: "design-1",
            designVersionId: "version-1",
            versionNumber: 4,
            name: "Home",
            fileKey: "website",
            fileName: "Website",
            imageUrl: null,
            width: 1440,
            height: 900,
            isMain: true,
            isCombined: true,
            groupId: "home-group",
            breakpoints: [
              { id: "home-desktop", name: "Home desktop", imageUrl: null, width: 1440, height: 900, breakpointLabel: "Desktop", isPrimary: true },
              { id: "home-mobile", name: "Home mobile", imageUrl: null, width: 390, height: 844, breakpointLabel: "Mobile", isPrimary: false },
            ],
            sortOrder: 0,
          }],
        });
      }
      if (url === "/api/client-projects/project-1/videos") {
        return json({ videos: [{
          designId: "video-design-1",
          designName: "Checkout prototype",
          designVersionId: "video-version-1",
          versionNumber: 2,
          originalFilename: "checkout.mp4",
          durationMs: 65_000,
        }] });
      }
      if (url === "/api/projects/room-1/design-versions" && init?.method === "POST") {
        return json({ membership: { id: "pin-1" } }, 201);
      }
      return json({ error: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const onAdded = vi.fn(async () => undefined);

    await act(async () => {
      root.render(React.createElement(RoomDesignPicker, {
        open: true,
        projectId: "project-1",
        roomId: "room-1",
        existingDesigns: [],
        onClose,
        onAdded,
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Add from Designs");
    expect(container.textContent).toContain("Website");
    expect(container.textContent).toContain("Checkout prototype");

    await act(async () => {
      (container.querySelector('button[aria-label="Select Home"]') as HTMLButtonElement).click();
      buttonNamed("Checkout prototype")?.click();
    });
    await act(async () => {
      buttonNamed("Add selected (2)")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const posts = requests.filter((request) => request.url === "/api/projects/room-1/design-versions");
    expect(posts.map((request) => JSON.parse(String(request.init?.body)))).toEqual([
      {
        designId: "design-1",
        designVersionId: "version-1",
        selectedScreenIds: ["home-desktop", "home-mobile"],
      },
      {
        designId: "video-design-1",
        designVersionId: "video-version-1",
      },
    ]);
    expect(onAdded).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("marks designs already included in the room and prevents duplicate selection", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/integrations/figma/import")) {
        return json({ designs: [{
          key: "home",
          designId: "design-1",
          designVersionId: "version-2",
          versionNumber: 2,
          name: "Home",
          fileKey: "website",
          fileName: "Website",
          imageUrl: null,
          width: 1440,
          height: 900,
          isMain: true,
          isCombined: false,
          groupId: null,
          breakpoints: [{ id: "home", name: "Home", imageUrl: null, width: 1440, height: 900, breakpointLabel: "Desktop", isPrimary: true }],
          sortOrder: 0,
        }] });
      }
      return json({ videos: [] });
    }));

    await act(async () => {
      root.render(React.createElement(RoomDesignPicker, {
        open: true,
        projectId: "project-1",
        roomId: "room-1",
        existingDesigns: [{ designId: "design-1", designVersionId: "version-1", versionNumber: 1 }],
        onClose: vi.fn(),
        onAdded: vi.fn(),
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Included as v1");
    expect((container.querySelector('button[aria-label="Select Home"]') as HTMLButtonElement).disabled).toBe(true);
    expect(buttonNamed("Add selected (0)")?.disabled).toBe(true);
  });
});
