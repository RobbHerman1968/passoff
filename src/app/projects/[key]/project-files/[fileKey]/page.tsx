import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { getTenantContextForProjectKey, normalizeProjectKey } from "@/lib/tenant/context";

import { ProjectDesigns } from "./project-designs";

export const metadata: Metadata = {
  title: "Project designs | Pass-Off",
  description: "Browse designs for a Pass-Off project file.",
};

export default async function ProjectFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; fileKey: string }>;
  searchParams: Promise<{ screen?: string | string[] }>;
}) {
  const { key, fileKey } = await params;
  const query = await searchParams;
  const screen = typeof query.screen === "string" ? query.screen : Array.isArray(query.screen) ? query.screen[0] : undefined;
  const screenSuffix = screen ? `?screen=${encodeURIComponent(screen)}` : "";

  let tenant;
  try {
    tenant = await getTenantContextForProjectKey(key);
  } catch {
    notFound();
  }

  if (!/^[A-Za-z0-9_-]+$/.test(fileKey)) {
    redirect(`/projects/${encodeURIComponent(tenant.projectId)}`);
  }

  const normalized = normalizeProjectKey(key);
  if (normalized === tenant.projectSlug) {
    redirect(`/projects/${encodeURIComponent(tenant.projectId)}/project-files/${encodeURIComponent(fileKey)}${screenSuffix}`);
  }
  if (normalized !== tenant.projectId) {
    redirect(`/projects/${encodeURIComponent(tenant.projectId)}`);
  }

  return (
    <Suspense fallback={null}>
      <ProjectDesigns projectKey={tenant.projectId} fileKey={fileKey} initialScreen={screen} />
    </Suspense>
  );
}
