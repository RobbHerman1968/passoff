import { viewportGroupFromWidth } from "../analytics/contract";

export type ViewportSnapshot = {
  width: number;
  height: number;
  devicePixelRatio: number;
  orientation: "portrait" | "landscape";
  group: "mobile" | "tablet" | "desktop";
};

export function captureViewport(): ViewportSnapshot {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    devicePixelRatio: window.devicePixelRatio || 1,
    orientation: width >= height ? "landscape" : "portrait",
    group: viewportGroupFromWidth(width),
  };
}
