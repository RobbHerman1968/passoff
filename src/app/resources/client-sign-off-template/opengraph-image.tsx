import { createSeoOgImage, seoOgSize } from "@/lib/seo/og";

export const alt = "Client design sign-off template from Pass-Off";
export const size = seoOgSize;
export const contentType = "image/png";

export default function Image() {
  return createSeoOgImage({
    eyebrow: "Resource",
    title: "Client design sign-off template",
  });
}
