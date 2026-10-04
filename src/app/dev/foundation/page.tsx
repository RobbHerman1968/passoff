import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FoundationShowcase } from "@/components/foundation-showcase";

export const metadata: Metadata = {
  title: "Foundation showcase",
  robots: {
    index: false,
    follow: false,
  },
};

export default function FoundationShowcasePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <FoundationShowcase />;
}
