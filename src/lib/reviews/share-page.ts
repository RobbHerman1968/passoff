import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { reviews } from "@/db/schema";

export async function getReviewForSharePage(
  reviewId: string,
  workspaceId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: reviews.id, name: reviews.name })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}
