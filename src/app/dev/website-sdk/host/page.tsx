import type { Metadata } from "next";

import { WebsiteSdkHost } from "@/components/website-sdk-host";

export const metadata: Metadata = {
  title: "Website SDK host harness",
  robots: { index: false, follow: false },
};

export default function WebsiteSdkHostPage() {
  return <WebsiteSdkHost />;
}
