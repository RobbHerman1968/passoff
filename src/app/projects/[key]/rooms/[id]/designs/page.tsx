import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectFilesDashboard } from "@/app/projects/[key]/project-files-dashboard";
import { WorkspaceHeader } from "@/components/workspace-header";
import { projectRoomPath } from "@/lib/rooms/routes";
import { getTenantContextForRoomKey, normalizeProjectKey } from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Design files | Pass-Off",
  description: "Import and manage design files for a Pass-Off room.",
};

export default async function ProjectRoomDesignsPage({
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

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <WorkspaceHeader />
      <ProjectFilesDashboard
        projectKey={tenant.projectId}
        roomName={tenant.roomName ?? tenant.projectName}
        clientName={tenant.clientName}
        roomId={tenant.roomId}
        backHref={projectRoomPath(tenant.projectId, tenant.roomId)}
      />
    </main>
  );
}
