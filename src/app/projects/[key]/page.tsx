import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getTenantContextForProjectKey, normalizeProjectKey } from "@/lib/tenant/context";

import { ProjectFilesDashboard } from "./project-files-dashboard";

export const metadata: Metadata = {
  title: "Project | Pass-Off",
  description: "Manage Figma project files for a Pass-Off project.",
};

export default async function ProjectPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let tenant;
  try {
    tenant = await getTenantContextForProjectKey(key);
  } catch {
    notFound();
  }

  const normalized = normalizeProjectKey(key);
  // Prefer GUID URLs; keep slug working as a redirect for old links.
  if (normalized === tenant.projectSlug) {
    redirect(`/projects/${encodeURIComponent(tenant.projectId)}`);
  }
  if (normalized !== tenant.projectId) notFound();

  return (
    <ProjectFilesDashboard
      projectKey={tenant.projectId}
      projectName={tenant.projectName}
    />
  );
}
