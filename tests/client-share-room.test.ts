// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientShareRoom } from "@/app/share/[token]/client-share-room";

let container: HTMLDivElement;
let root: Root;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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

describe("ClientShareRoom design feedback", () => {
  it("navigates a design-only payload and posts a design-screen target", async () => {
    const payload = {
      project: {
        id: "project-1",
        name: "Checkout project",
        clientName: "Acme",
      },
      room: {
        id: "room-1",
        name: "Checkout review",
        status: "SENT",
        handoffReleasedAt: null,
      },
      revision: { id: "revision-1", number: 1, contentDigest: "abcdef1234567890" },
      assets: [],
      designs: [{
        id: "pin-1",
        designVersionId: "version-1",
        name: "Checkout",
        versionNumber: 3,
        screens: [{
          id: "screen:checkout",
          name: "Checkout desktop",
          width: 1440,
          height: 900,
          url: "/preview.png",
        }],
      }],
      targets: [{
        type: "design_screen",
        revisionDesignVersionId: "pin-1",
        designId: "design-1",
        designVersionId: "version-1",
        designName: "Checkout",
        versionNumber: 3,
        screenId: "screen:checkout",
        screenName: "Checkout desktop",
        width: 1440,
        height: 900,
        previewUrl: "/preview.png",
      }],
      comments: [{
        id: "comment-1",
        revisionAssetId: null,
        revisionDesignVersionId: "pin-1",
        screenId: "screen:checkout",
        reviewerId: "someone-else",
        xPercent: 0.2,
        yPercent: 0.3,
        body: "Existing design feedback",
        status: "OPEN",
      }],
      designerNotes: [{
        id: "note-1",
        revisionDesignVersionId: "pin-1",
        screenId: "screen:checkout",
        category: "intent",
        title: "Keep payment compact",
        body: "This area should stay above the fold.",
        authorDisplayName: "Dana Designer",
        figmaNodeName: "Payment form",
        x: 50,
        y: 40,
        selectionWidth: 20,
        selectionHeight: 10,
      }],
      handoff: [],
      approvalStatement: "I approve this revision.",
      approvalReceipt: null,
    };

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (!init?.method) return jsonResponse(payload);
      const body = JSON.parse(String(init.body || "{}")) as { action?: string };
      if (body.action === "identify") {
        return jsonResponse({
          reviewer: { id: "reviewer-1", name: "Alex", email: "alex@example.com" },
        });
      }
      if (body.action === "comment") return jsonResponse({ comment: { id: "new-comment" } }, 201);
      if (body.action === "view") return jsonResponse({ ok: true });
      throw new Error(`Unexpected request: ${body.action}`);
    }));

    await act(async () => {
      root.render(React.createElement(ClientShareRoom, { token: "share-token" }));
      await flush();
    });

    const inputs = container.querySelectorAll("input");
    await act(async () => {
      setValue(inputs[0] as HTMLInputElement, "Alex");
      setValue(inputs[1] as HTMLInputElement, "alex@example.com");
    });
    const continueButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue to Review"));
    await act(async () => {
      continueButton?.click();
      await flush();
    });

    expect(container.textContent).toContain("Checkout desktop");
    expect(container.textContent).toContain("Checkout review");
    expect(container.textContent).toContain("Checkout project · Acme");
    expect(container.textContent).toContain("Existing design feedback");
    expect(container.textContent).toContain("Keep payment compact");
    expect(container.textContent).toContain("Designer note by Dana Designer · Payment form");

    const imageButton = container.querySelector('button[aria-label="Add Feedback Pin"]') as HTMLButtonElement;
    vi.spyOn(imageButton, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 100,
      right: 210,
      bottom: 120,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    await act(async () => {
      imageButton.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        clientX: 110,
        clientY: 45,
      }));
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      setValue(textarea, "Increase contrast here.");
    });
    const submit = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Submit Comment"));
    await act(async () => {
      submit?.click();
      await flush();
    });

    const commentRequest = requests
      .map((request) => ({
        ...request,
        body: request.init?.body ? JSON.parse(String(request.init.body)) as Record<string, unknown> : null,
      }))
      .find((request) => request.body?.action === "comment");
    expect(commentRequest?.body).toEqual({
      action: "comment",
      target: {
        type: "design_screen",
        revisionDesignVersionId: "pin-1",
        screenId: "screen:checkout",
      },
      xPercent: 0.5,
      yPercent: 0.25,
      body: "Increase contrast here.",
    });
  });

  it("renders video timeline markers and seeks to timestamped feedback", async () => {
    const payload = {
      project: { id: "project-1", name: "Film", clientName: "Acme" },
      room: {
        id: "room-1",
        name: "Film review",
        status: "APPROVED",
        handoffReleasedAt: null,
      },
      revision: { id: "revision-1", number: 1, contentDigest: "abcdef1234567890" },
      assets: [],
      designs: [],
      targets: [{
        type: "video",
        revisionDesignVersionId: "pin-video",
        designId: "design-video",
        designVersionId: "version-video",
        designName: "Launch film",
        versionNumber: 2,
        durationMs: 10_000,
        width: 1920,
        height: 1080,
        mimeType: "video/mp4",
        playbackUrl: "/api/public/token/videos/version-video",
      }],
      comments: [{
        id: "comment-video",
        revisionAssetId: null,
        revisionDesignVersionId: "pin-video",
        screenId: null,
        videoTimeMs: 5000,
        reviewerId: "reviewer-1",
        xPercent: null,
        yPercent: null,
        body: "Client feedback at five seconds",
        status: "OPEN",
      }],
      designerNotes: [{
        id: "note-video",
        revisionDesignVersionId: "pin-video",
        targetType: "video",
        screenId: null,
        videoTimeMs: 3000,
        category: "intent",
        title: "Designer pause",
        body: "This pause is intentional.",
        authorDisplayName: "Dana",
        figmaNodeName: null,
        x: null,
        y: null,
        selectionWidth: null,
        selectionHeight: null,
      }],
      handoff: [],
      approvalStatement: "Approved.",
      approvalReceipt: null,
    };
    localStorage.setItem("passoff:reviewer:token", JSON.stringify({
      name: "Client",
      email: "client@example.com",
    }));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const requestBody = JSON.parse(String(init.body || "{}")) as { action?: string };
        if (requestBody.action === "identify") {
          return jsonResponse({
            reviewer: { id: "reviewer-1", name: "Client", email: "client@example.com" },
          });
        }
        if (requestBody.action === "view") return jsonResponse({ ok: true });
      }
      return jsonResponse(payload);
    }));

    await act(async () => {
      root.render(React.createElement(ClientShareRoom, { token: "token" }));
      await flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flush();
    });

    const video = container.querySelector("video") as HTMLVideoElement;
    const commentMarker = container.querySelector(
      'button[aria-label="Client feedback at 0:05"]',
    ) as HTMLButtonElement;
    expect(video).toBeTruthy();
    expect(commentMarker).toBeTruthy();
    await act(async () => commentMarker.click());
    expect(video.currentTime).toBe(5);
    expect(container.textContent).toContain("Designer note · 0:03 · intent");
    expect(container.textContent).toContain("Client feedback · 0:05");
  });
});
