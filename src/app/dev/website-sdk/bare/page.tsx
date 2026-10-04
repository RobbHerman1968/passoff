import type { Metadata } from "next";

import { WebsiteSdkHost } from "@/components/website-sdk-host";

export const metadata: Metadata = {
  title: "Website SDK bare host",
  robots: { index: false, follow: false },
};

export default function WebsiteSdkBareHostPage() {
  return <WebsiteSdkHost loadSdk={false} />;
}
