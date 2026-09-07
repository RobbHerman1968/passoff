import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Client approval workflow for agencies by Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Agency approval workflow",
    title: "A client approval workflow built for agencies.",
  });
}
