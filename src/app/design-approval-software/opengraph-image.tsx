import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Design approval software by Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Design approval software",
    title: "Record exactly what was approved.",
  });
}
