import "server-only";

import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { assets, issueAttachments, issueEvidence, issues } from "@/db/schema";
import {
  MAX_ATTACHMENTS_PER_ISSUE,
  sanitizeAttachmentFileName,
  validateAttachmentFile,
  type AttachableAssetView,
  type AttachmentView,
} from "@/lib/attachments/types";
import { resolveIssueScope, type IssueScopeInput } from "@/lib/issues/scope";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type AttachmentServiceError =
  | "not_found"
  | "validation"
  | "limit"
  | "unavailable";

export const ATTACHMENT_UNAVAILABLE_MESSAGE = "This issue or file isn’t available.";
export const ATTACHMENT_SAVE_FAILED_MESSAGE =
  "We couldn’t save that attachment change. Try again.";

export type AttachmentMutationResult =
  | { ok: true; attachments: AttachmentView[] }
  | { ok: false; error: AttachmentServiceError; message: string };

/** Asset kinds a person may attach. Video and playback assets are managed elsewhere. */
const ATTACHABLE_KINDS = ["screenshot", "attachment"] as const;

type AttachmentRow = {
  assetId: string;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  isPrivate: boolean;
  createdAt: Date;
};

function toView(row: AttachmentRow): AttachmentView {
  return {
    assetId: row.assetId,
    fileName: sanitizeAttachmentFileName(row.fileName),
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    isPrivate: row.isPrivate,
    attachedAt: row.createdAt.toISOString(),
  };
}

async function selectAttachments(
  executor: Pick<typeof db, "select">,
  scope: { issueId: string; workspaceId: string },
  options: { includePrivate: boolean },
): Promise<AttachmentView[]> {
  const conditions = [
    eq(issueAttachments.issueId, scope.issueId),
    eq(assets.workspaceId, scope.workspaceId),
    eq(assets.status, "ready"),
  ];
  if (!options.includePrivate) {
    conditions.push(eq(issueAttachments.isPrivate, false));
  }

  const rows = await executor
    .select({
      assetId: issueAttachments.assetId,
      fileName: assets.originalFileName,
      mimeType: assets.mimeType,
      byteSize: assets.byteSize,
      isPrivate: issueAttachments.isPrivate,
      createdAt: issueAttachments.createdAt,
    })
    .from(issueAttachments)
    .innerJoin(assets, eq(assets.id, issueAttachments.assetId))
    .where(and(...conditions))
    .orderBy(asc(issueAttachments.createdAt));
  return rows.map(toView);
}

/** Every attachment on the issue, including private ones. Members only. */
export async function listIssueAttachments(
  context: WorkspaceContext,
  input: IssueScopeInput,
): Promise<AttachmentView[] | null> {
  const scope = await resolveIssueScope(db, context.workspaceId, input);
  if (!scope) return null;
  return selectAttachments(
    db,
    { issueId: scope.id, workspaceId: scope.workspaceId },
    { includePrivate: true },
  );
}

/**
 * Attachments a guest reviewer may see. Private attachments are never returned.
 * Callers pass the guest session's workspace and review, not a member context.
 */
export async function listGuestVisibleIssueAttachments(input: {
  workspaceId: string;
  reviewId: string;
  issueId: string;
}): Promise<AttachmentView[]> {
  const [issue] = await db
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        eq(issues.id, input.issueId),
        eq(issues.workspaceId, input.workspaceId),
        eq(issues.reviewId, input.reviewId),
        isNull(issues.deletedAt),
      ),
    )
    .limit(1);
  if (!issue) return [];
  return selectAttachments(
    db,
    { issueId: issue.id, workspaceId: input.workspaceId },
    { includePrivate: false },
  );
}

/**
 * Ready files uploaded to this issue's review that are not attached anywhere yet.
 * Pictures captured as an issue's own evidence are excluded; they already live there.
 */
export async function listAttachableAssets(
  context: WorkspaceContext,
  input: IssueScopeInput,
): Promise<AttachableAssetView[] | null> {
  const scope = await resolveIssueScope(db, context.workspaceId, input);
  if (!scope) return null;

  const rows = await db
    .select({
      assetId: assets.id,
      fileName: assets.originalFileName,
      mimeType: assets.mimeType,
      byteSize: assets.byteSize,
    })
    .from(assets)
    .leftJoin(issueAttachments, eq(issueAttachments.assetId, assets.id))
    .leftJoin(issueEvidence, eq(issueEvidence.assetId, assets.id))
    .where(
      and(
        eq(assets.workspaceId, scope.workspaceId),
        eq(assets.reviewId, scope.reviewId),
        eq(assets.status, "ready"),
        sql`${assets.kind}::text in (${sql.join(
          ATTACHABLE_KINDS.map((kind) => sql`${kind}`),
          sql`, `,
        )})`,
        isNull(issueAttachments.assetId),
        isNull(issueEvidence.assetId),
      ),
    )
    .orderBy(desc(assets.createdAt))
    .limit(50);

  return rows
    .filter(
      (row) =>
        validateAttachmentFile({ mimeType: row.mimeType, byteSize: row.byteSize }).ok,
    )
    .map((row) => ({
      assetId: row.assetId,
      fileName: sanitizeAttachmentFileName(row.fileName),
      mimeType: row.mimeType,
      byteSize: row.byteSize,
    }));
}

export async function attachAssetToIssue(
  context: WorkspaceContext,
  input: IssueScopeInput & { assetId: string; isPrivate: boolean },
): Promise<AttachmentMutationResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
  }

  try {
    return await db.transaction(async (tx): Promise<AttachmentMutationResult> => {
      const scope = await resolveIssueScope(tx, context.workspaceId, input);
      if (!scope) {
        return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
      }

      // The file must live in this workspace and this issue's review.
      const [asset] = await tx
        .select({
          id: assets.id,
          kind: assets.kind,
          status: assets.status,
          mimeType: assets.mimeType,
          byteSize: assets.byteSize,
        })
        .from(assets)
        .where(
          and(
            eq(assets.id, input.assetId),
            eq(assets.workspaceId, scope.workspaceId),
            eq(assets.reviewId, scope.reviewId),
          ),
        )
        .limit(1);
      if (
        !asset ||
        !(ATTACHABLE_KINDS as readonly string[]).includes(asset.kind)
      ) {
        return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
      }
      // Evidence captured for an issue stays with that evidence; it is not a loose file.
      const [evidence] = await tx
        .select({ id: issueEvidence.id })
        .from(issueEvidence)
        .where(eq(issueEvidence.assetId, asset.id))
        .limit(1);
      if (evidence) {
        return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
      }
      if (asset.status !== "ready") {
        return {
          ok: false,
          error: "validation",
          message: "This file isn’t ready yet. Try again once it finishes uploading.",
        };
      }

      const valid = validateAttachmentFile({
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
      });
      if (!valid.ok) {
        return { ok: false, error: "validation", message: valid.message };
      }

      const [current] = await tx
        .select({ total: count() })
        .from(issueAttachments)
        .where(eq(issueAttachments.issueId, scope.id));
      if (Number(current?.total ?? 0) >= MAX_ATTACHMENTS_PER_ISSUE) {
        return {
          ok: false,
          error: "limit",
          message: `An issue can have up to ${MAX_ATTACHMENTS_PER_ISSUE} attachments. Remove one to add another.`,
        };
      }

      const inserted = await tx
        .insert(issueAttachments)
        .values({
          assetId: asset.id,
          issueId: scope.id,
          isPrivate: input.isPrivate,
          attachedByUserId: context.userId,
        })
        .onConflictDoNothing()
        .returning({ assetId: issueAttachments.assetId });

      if (inserted.length === 0) {
        // Attached already (here or to another issue). Only report success for this issue.
        const [existing] = await tx
          .select({ issueId: issueAttachments.issueId })
          .from(issueAttachments)
          .where(eq(issueAttachments.assetId, asset.id))
          .limit(1);
        if (existing?.issueId !== scope.id) {
          return {
            ok: false,
            error: "validation",
            message: "This file is already attached somewhere else.",
          };
        }
      }

      return {
        ok: true,
        attachments: await selectAttachments(
          tx,
          { issueId: scope.id, workspaceId: scope.workspaceId },
          { includePrivate: true },
        ),
      };
    });
  } catch {
    return { ok: false, error: "unavailable", message: ATTACHMENT_SAVE_FAILED_MESSAGE };
  }
}

export async function setAttachmentVisibility(
  context: WorkspaceContext,
  input: IssueScopeInput & { assetId: string; isPrivate: boolean },
): Promise<AttachmentMutationResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
  }
  try {
    return await db.transaction(async (tx): Promise<AttachmentMutationResult> => {
      const scope = await resolveIssueScope(tx, context.workspaceId, input);
      if (!scope) {
        return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
      }
      const updated = await tx
        .update(issueAttachments)
        .set({ isPrivate: input.isPrivate })
        .where(
          and(
            eq(issueAttachments.assetId, input.assetId),
            eq(issueAttachments.issueId, scope.id),
          ),
        )
        .returning({ assetId: issueAttachments.assetId });
      if (updated.length === 0) {
        return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
      }
      return {
        ok: true,
        attachments: await selectAttachments(
          tx,
          { issueId: scope.id, workspaceId: scope.workspaceId },
          { includePrivate: true },
        ),
      };
    });
  } catch {
    return { ok: false, error: "unavailable", message: ATTACHMENT_SAVE_FAILED_MESSAGE };
  }
}

/** Removes the link only. The file itself stays in the review's storage. */
export async function detachAttachmentFromIssue(
  context: WorkspaceContext,
  input: IssueScopeInput & { assetId: string },
): Promise<AttachmentMutationResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
  }
  try {
    return await db.transaction(async (tx): Promise<AttachmentMutationResult> => {
      const scope = await resolveIssueScope(tx, context.workspaceId, input);
      if (!scope) {
        return { ok: false, error: "not_found", message: ATTACHMENT_UNAVAILABLE_MESSAGE };
      }
      await tx
        .delete(issueAttachments)
        .where(
          and(
            eq(issueAttachments.assetId, input.assetId),
            eq(issueAttachments.issueId, scope.id),
          ),
        );
      return {
        ok: true,
        attachments: await selectAttachments(
          tx,
          { issueId: scope.id, workspaceId: scope.workspaceId },
          { includePrivate: true },
        ),
      };
    });
  } catch {
    return { ok: false, error: "unavailable", message: ATTACHMENT_SAVE_FAILED_MESSAGE };
  }
}
