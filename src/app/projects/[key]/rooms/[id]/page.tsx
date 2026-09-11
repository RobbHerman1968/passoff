import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoomPageContent } from "@/app/rooms/[id]/room-page-content";
import { getTenantContextForRoomKey, normalizeProjectKey } from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Approval room | Pass-Off",
  description: "Manage revision, share link, feedback, approval, and handoff.",
};

export default async function ProjectRoomPage({
  params,
}: {
  params: Promise<{ key: string; id: string }>;
}) {
  const { key, id } = await params;
  let tenant;
  try {
    tenant = await getTenantContextForRoomKey(id);
  } catch {
    notFound();
  }
  if (normalizeProjectKey(key) !== tenant.projectId || !tenant.roomId) notFound();

  return <RoomPageContent projectId={tenant.projectId} roomId={tenant.roomId} />;
}
