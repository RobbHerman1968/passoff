import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ProjectDesigns } from "@/app/projects/[key]/project-files/[fileKey]/project-designs";
import { WorkspaceHeader } from "@/components/workspace-header";
import {
  projectDesignPath,
  projectDesignsPath,
  projectRoomDesignsPath,
} from "@/lib/rooms/routes";
import {
  getTenantContextForProjectKey,
  getTenantContextForRoomKey,
  normalizeProjectKey,
} from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Design file | Pass-Off",
  description: "Browse a design file in Pass-Off.",
};

export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; designId: string }>;
  searchParams: Promise<{ room?: string | string[]; screen?: string | string[] }>;
}) {
  const { key: projectId, designId } = await params;
  const query = await searchParams;
  const roomId = typeof query.room === "string" ? query.room : query.room?.[0];
  const screen = typeof query.screen === "string" ? query.screen : query.screen?.[0];

  let tenant;
  try {
    tenant = await getTenantContextForProjectKey(projectId);
  } catch {
    notFound();
  }
  if (normalizeProjectKey(projectId) !== tenant.projectId && normalizeProjectKey(projectId) !== tenant.projectSlug) {
    notFound();
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(designId)) {
    redirect(projectDesignsPath(tenant.projectId));
  }

  if (roomId) {
    try {
      const roomTenant = await getTenantContextForRoomKey(roomId);
      if (roomTenant.projectId !== tenant.projectId) notFound();
    } catch {
      notFound();
    }
  }

  if (normalizeProjectKey(projectId) !== tenant.projectId) {
    redirect(projectDesignPath(tenant.projectId, designId, { roomId, screen }));
  }

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <WorkspaceHeader />
      <Suspense fallback={null}>
        <ProjectDesigns
          projectKey={tenant.projectId}
          designId={designId}
          initialScreen={screen}
          backLabel={roomId ? "Back to room designs" : "Back to project designs"}
          backHref={
            roomId
              ? projectRoomDesignsPath(tenant.projectId, roomId)
              : projectDesignsPath(tenant.projectId)
          }
        />
      </Suspense>
    </main>
  );
}
