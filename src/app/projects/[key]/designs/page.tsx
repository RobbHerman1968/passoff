import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectFilesDashboard } from "@/app/projects/[key]/project-files-dashboard";
import { WorkspaceHeader } from "@/components/workspace-header";
import { getTenantContextForClientProjectKey, normalizeProjectKey } from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Design files | Pass-Off",
  description: "Import and manage design files for a Pass-Off project.",
};

export default async function ProjectDesignsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key: projectId } = await params;
  let tenant;
  try {
    tenant = await getTenantContextForClientProjectKey(projectId);
  } catch {
    notFound();
  }
  if (normalizeProjectKey(projectId) !== tenant.projectId && normalizeProjectKey(projectId) !== tenant.projectSlug) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <WorkspaceHeader />
      <ProjectFilesDashboard
        projectKey={tenant.projectId}
        roomName={tenant.projectName}
        clientName={tenant.clientName}
        backHref={`/projects/${encodeURIComponent(tenant.projectId)}`}
        backLabel="Back to project"
      />
    </main>
  );
}
