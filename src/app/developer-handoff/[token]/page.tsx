import type { Metadata } from "next";

import { DeveloperHandoffViewer } from "./developer-handoff-viewer";

export const metadata: Metadata = {
  title: "Developer handoff | Pass-Off",
  description: "Read-only developer handoff snapshot.",
  robots: { index: false, follow: false },
};

export default async function DeveloperHandoffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <DeveloperHandoffViewer token={token} />;
}
