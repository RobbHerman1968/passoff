import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { projectRoomDesignsPath } from "@/lib/rooms/routes";
import { getTenantContextForRoomKey } from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Design files | Pass-Off",
  description: "Import and manage design files for a Pass-Off room.",
};

export default async function RoomDesignsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant;
  try {
    tenant = await getTenantContextForRoomKey(id);
  } catch {
    notFound();
  }

  if (!tenant.roomId) notFound();
  redirect(projectRoomDesignsPath(tenant.projectId, tenant.roomId));
}
