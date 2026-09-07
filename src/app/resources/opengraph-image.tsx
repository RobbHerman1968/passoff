import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Pass-Off resources for design approval";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Resources",
    title: "Checklists and templates for design approval",
  });
}
