import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Figma design approval with Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Figma design approval",
    title: "Turn a Figma review into recorded approval.",
  });
}
