import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { issueComments, videoAnnotations } from "@/db/schema";
import { seedReviewWithIssue, seedVideoEvidence } from "@/test/workspace-fixtures";

// These tests need TEST_DATABASE_URL. They never use DATABASE_URL.

const statements = readFileSync(
  join(process.cwd(), "drizzle", "0025_video_annotations.sql"),
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((part) => part.trim())
  .filter(Boolean);

class Rollback extends Error {}

describe("migration 0025 (video annotations)", { timeout: 120_000 }, () => {
  it("can be applied again without errors", async () => {
    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
    const [table] = (await db.execute(sql`select to_regclass('public.video_annotations') as name`))
      .rows as Array<{ name: string | null }>;
    expect(table.name).toBe("video_annotations");
  });

  it("carries useful legacy anchors over as notes, and skips the unusable ones", async () => {
    const seeded = await seedReviewWithIssue("MigLegacy");
    const clip = await seedVideoEvidence({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
      status: "ready",
      durationMs: 30_000,
      uploadedByUserId: seeded.context.userId,
    });

    let carried: Array<{ timestampMs: number; x: string | null; y: string | null; comment: string }> = [];
    let total = 0;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          create table legacy_video_anchors (
            id uuid primary key default gen_random_uuid(),
            issue_id uuid not null,
            video_asset_id uuid,
            timestamp_ms integer not null,
            normalized_x numeric,
            normalized_y numeric,
            created_at timestamptz not null default now()
          )
        `);
        await tx.execute(sql`
          insert into legacy_video_anchors (issue_id, video_asset_id, timestamp_ms, normalized_x, normalized_y)
          values
            (${seeded.issueId}, ${clip.videoAssetId}, 4000, 0.25, 0.5),
            (${seeded.issueId}, null, 9000, 1.7, 0.5),
            (${seeded.issueId}, ${clip.videoAssetId}, -5, null, null)
        `);

        // Run it twice: the second run must not duplicate anything.
        for (let run = 0; run < 2; run += 1) {
          for (const statement of statements) await tx.execute(sql.raw(statement));
        }

        const rows = await tx
          .select({
            timestampMs: videoAnnotations.timestampMs,
            x: videoAnnotations.normalizedX,
            y: videoAnnotations.normalizedY,
            body: issueComments.body,
            isPrivate: issueComments.isPrivate,
          })
          .from(videoAnnotations)
          .innerJoin(issueComments, eq(issueComments.id, videoAnnotations.commentId))
          .where(eq(videoAnnotations.issueId, seeded.issueId))
          .orderBy(videoAnnotations.timestampMs);
        total = rows.length;
        carried = rows.map((row) => ({
          timestampMs: row.timestampMs,
          x: row.x,
          y: row.y,
          comment: row.body,
        }));
        expect(rows.every((row) => row.isPrivate === false)).toBe(true);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    expect(total).toBe(2);
    expect(carried[0]).toMatchObject({ timestampMs: 4_000, comment: "Note carried over from earlier video feedback." });
    expect(Number(carried[0].x)).toBeCloseTo(0.25, 5);
    expect(Number(carried[0].y)).toBeCloseTo(0.5, 5);
    // An out-of-range pin is dropped but the moment is kept, tied to the current clip.
    expect(carried[1]).toMatchObject({ timestampMs: 9_000, x: null, y: null });

    // The rolled-back run left nothing behind.
    expect(
      await db.select().from(videoAnnotations).where(eq(videoAnnotations.issueId, seeded.issueId)),
    ).toHaveLength(0);
  });
});
