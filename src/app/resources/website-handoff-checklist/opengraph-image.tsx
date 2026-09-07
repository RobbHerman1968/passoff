import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Website handoff checklist from Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Resource",
    title: "Website handoff checklist",
  });
}
