import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Pass-Off solutions for design approval";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Solutions",
    title: "Revision-specific design approval",
  });
}
