import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Website design approval process by Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Website design approval",
    title: "Approve designs before development begins.",
  });
}
