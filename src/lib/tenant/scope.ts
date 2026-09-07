import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";

export type WorkspaceScope = {
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  userEmail: string;
};

/** Kebab-case slug from a display name; falls back to `project` when empty. */
export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "project";
}

export async function allocateUniqueProjectSlug(workspaceId: string, name: string): Promise<string> {
  const base = slugifyProjectName(name).slice(0, 72);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = (
      await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, candidate)))
        .limit(1)
    )[0];
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a unique project slug.");
}
