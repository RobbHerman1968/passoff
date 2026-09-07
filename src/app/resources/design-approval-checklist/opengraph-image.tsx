import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Design approval checklist from Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Resource",
    title: "Design approval checklist",
  });
}
