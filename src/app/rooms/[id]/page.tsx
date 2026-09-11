import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { projectRoomPath } from "@/lib/rooms/routes";
import { getTenantContextForRoomKey } from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Approval room | Pass-Off",
  description: "Manage revision, share link, feedback, approval, and handoff.",
};

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  try {
    tenant = await getTenantContextForRoomKey(id);
  } catch {
    notFound();
  }
  if (!tenant.roomId) notFound();
  redirect(projectRoomPath(tenant.projectId, tenant.roomId));
}
