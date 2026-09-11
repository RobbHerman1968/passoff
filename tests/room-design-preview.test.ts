// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RoomDesignPreview } from "@/app/rooms/[id]/room-design-preview";

let container: HTMLDivElement;
let root: Root;

const screens = [
  { id: "home", name: "Home", width: 1440, height: 900, imageUrl: "/home.png" },
  { id: "checkout", name: "Checkout", width: 390, height: 844, imageUrl: "/checkout.png" },
];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("room design preview", () => {
  it("shows compact screen thumbnails and one large selected preview", async () => {
    await act(async () => {
      root.render(React.createElement(RoomDesignPreview, { screens }));
    });

    expect(container.querySelector('[aria-label="Design screen thumbnails"]')).toBeTruthy();
    expect(container.querySelectorAll('button[aria-label^="View "]')).toHaveLength(2);
    expect(container.querySelector('img[alt="Home"]')).toBeTruthy();
    expect(container.querySelector('img[alt="Checkout"]')).toBeFalsy();

    await act(async () => {
      (container.querySelector('button[aria-label="View Checkout"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('img[alt="Home"]')).toBeFalsy();
    expect(container.querySelector('img[alt="Checkout"]')).toBeTruthy();
    expect(container.textContent).toContain("390 × 844");
  });

  it("does not render a redundant thumbnail strip for one screen", async () => {
    await act(async () => {
      root.render(React.createElement(RoomDesignPreview, { screens: [screens[0]] }));
    });

    expect(container.querySelector('[aria-label="Design screen thumbnails"]')).toBeFalsy();
    expect(container.querySelector('img[alt="Home"]')).toBeTruthy();
  });
});
