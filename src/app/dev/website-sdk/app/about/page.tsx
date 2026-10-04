import type { Metadata } from "next";

import { WebsiteSdkHost } from "@/components/website-sdk-host";

export const metadata: Metadata = {
  title: "Website SDK Next.js about",
  robots: { index: false, follow: false },
};

export default function WebsiteSdkSpaAboutPage() {
  return <WebsiteSdkHost variant="spa-about" />;
}
