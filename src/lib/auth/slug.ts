import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { workspaces } from "@/db/schema";

function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return base || "workspace";
}

type SlugExecutor = {
  select: typeof db.select;
};

export async function createUniqueWorkspaceSlug(
  workspaceName: string,
  executor: SlugExecutor = db,
): Promise<string> {
  const base = slugify(workspaceName);
  let candidate = base;
  let attempt = 0;

  while (attempt < 25) {
    const [existing] = await executor
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }

    attempt += 1;
    candidate = `${base}-${attempt + 1}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
