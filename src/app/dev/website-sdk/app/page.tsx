import type { Metadata } from "next";

import { WebsiteSdkHost } from "@/components/website-sdk-host";

export const metadata: Metadata = {
  title: "Website SDK Next.js home",
  robots: { index: false, follow: false },
};

export default function WebsiteSdkSpaHomePage() {
  return <WebsiteSdkHost variant="spa-home" />;
}
