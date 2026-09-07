import type { Metadata } from "next";

import { ClientShareRoom } from "./client-share-room";

export const metadata: Metadata = {
  title: "Client review | Pass-Off",
  description: "Review the published revision, leave feedback, and approve.",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientShareRoom token={token} />;
}
