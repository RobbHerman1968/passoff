import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Website SDK prototype",
  robots: { index: false, follow: false },
};

export default function WebsiteSdkIndexPage() {
  return (
    <main className="page-padding content-width mx-auto">
      <PageHeader
        title="Website SDK prototype"
        description="Development-only pages for proving isolated website review. These routes are hidden in production."
      />
      <ul className="mt-6 list-disc space-y-2 pl-5">
        <li>
          <Link className="underline" href="/dev/website-sdk/host">
            Full host harness with async SDK
          </Link>
        </li>
        <li>
          <Link className="underline" href="/dev/website-sdk/bare">
            Bare host for injecting the SDK
          </Link>
        </li>
        <li>
          <Link className="underline" href="/dev/website-sdk/app">
            Next.js client navigation fixture
          </Link>
        </li>
      </ul>
    </main>
  );
}
