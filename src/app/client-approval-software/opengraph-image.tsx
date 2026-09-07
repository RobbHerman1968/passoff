import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Client approval software by Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Client approval software",
    title: "A simpler client approval workflow.",
  });
}
