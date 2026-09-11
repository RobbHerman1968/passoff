import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getProjectDesignIdBySourceKey } from "@/lib/figma/persistence";
import { getTenantContextForProjectKey, normalizeProjectKey } from "@/lib/tenant/context";
import { projectDesignPath, projectDesignsPath } from "@/lib/rooms/routes";

export const metadata: Metadata = {
  title: "Design file | Pass-Off",
  description: "Browse a design file in a Pass-Off room.",
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
  let tenant;
  try {
    tenant = await getTenantContextForProjectKey(key);
  } catch {
    notFound();
  }

  if (!/^[A-Za-z0-9_-]+$/.test(fileKey)) {
    redirect(projectDesignsPath(tenant.projectId));
  }

  const normalized = normalizeProjectKey(key);
  if (normalized !== tenant.projectId && normalized !== tenant.projectSlug) notFound();
  const designId = await getProjectDesignIdBySourceKey(tenant, fileKey);
  if (!designId) notFound();

  redirect(
    projectDesignPath(tenant.projectId, designId, {
      screen,
    }),
  );
}
