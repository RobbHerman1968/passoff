import "server-only";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { issueLabels, labels } from "@/db/schema";
import { insertIssueActivityEvent } from "@/lib/issues/activity-record";
import {
  formatIssueHistorySummary,
  ISSUE_ACTIVITY_TYPES,
  type IssueHistoryEvent,
} from "@/lib/issues/history";
import { resolveIssueScope, type IssueScopeInput } from "@/lib/issues/scope";
import {
  MAX_LABELS_PER_ISSUE,
  normalizeLabelColor,
  normalizeLabelName,
  type LabelView,
} from "@/lib/labels/types";
import { canMutateProjects } from "@/lib/projects/permissions";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type LabelServiceError =
  | "not_found"
  | "validation"
  | "limit"
  | "unavailable";

export const LABEL_UNAVAILABLE_MESSAGE = "This issue or label isn’t available.";
export const LABEL_SAVE_FAILED_MESSAGE = "We couldn’t save that label change. Try again.";

export type LabelMutationResult =
  | {
      ok: true;
      labels: LabelView[];
      /** Present only when something actually changed. */
      event: IssueHistoryEvent | null;
    }
  | { ok: false; error: LabelServiceError; message: string };

export type CreateLabelResult =
  | { ok: true; label: LabelView; created: boolean }
  | { ok: false; error: LabelServiceError; message: string };

function toView(row: { id: string; name: string; color: string }): LabelView {
  return { id: row.id, name: row.name, color: normalizeLabelColor(row.color) };
}

export async function listWorkspaceLabels(
  context: Pick<WorkspaceContext, "workspaceId">,
): Promise<LabelView[]> {
  const rows = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.workspaceId, context.workspaceId))
    .orderBy(asc(sql`lower(${labels.name})`));
  return rows.map(toView);
}

/** Labels for many issues at once (used by exports and lists). Workspace-scoped. */
export async function listLabelsForIssues(
  context: Pick<WorkspaceContext, "workspaceId">,
  issueIds: string[],
  executor: Pick<typeof db, "select"> = db,
): Promise<Map<string, LabelView[]>> {
  const result = new Map<string, LabelView[]>();
  if (issueIds.length === 0) return result;

  const rows = await executor
    .select({
      issueId: issueLabels.issueId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(
      and(
        inArray(issueLabels.issueId, issueIds),
        eq(labels.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(asc(sql`lower(${labels.name})`));

  for (const row of rows) {
    const list = result.get(row.issueId) ?? [];
    list.push(toView(row));
    result.set(row.issueId, list);
  }
  return result;
}

export async function listIssueLabels(
  context: WorkspaceContext,
  input: IssueScopeInput,
): Promise<LabelView[] | null> {
  const scope = await resolveIssueScope(db, context.workspaceId, input);
  if (!scope) return null;
  const map = await listLabelsForIssues(context, [scope.id]);
  return map.get(scope.id) ?? [];
}

export async function createLabel(
  context: WorkspaceContext,
  input: { name: string; color?: string },
): Promise<CreateLabelResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "not_found", message: LABEL_UNAVAILABLE_MESSAGE };
  }
  const name = normalizeLabelName(input.name);
  if (!name.ok) {
    return { ok: false, error: "validation", message: name.message };
  }
  const color = normalizeLabelColor(input.color);

  try {
    const inserted = await db
      .insert(labels)
      .values({ workspaceId: context.workspaceId, name: name.name, color })
      .onConflictDoNothing()
      .returning({ id: labels.id, name: labels.name, color: labels.color });
    if (inserted[0]) {
      return { ok: true, label: toView(inserted[0]), created: true };
    }

    // Same name (ignoring case) already exists in this workspace: reuse it.
    const [existing] = await db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(
        and(
          eq(labels.workspaceId, context.workspaceId),
          sql`lower(${labels.name}) = lower(${name.name})`,
        ),
      )
      .limit(1);
    if (!existing) {
      return { ok: false, error: "unavailable", message: LABEL_SAVE_FAILED_MESSAGE };
    }
    return { ok: true, label: toView(existing), created: false };
  } catch {
    return { ok: false, error: "unavailable", message: LABEL_SAVE_FAILED_MESSAGE };
  }
}

async function mutateIssueLabel(
  context: WorkspaceContext,
  input: IssueScopeInput & { labelId: string },
  mode: "attach" | "detach",
): Promise<LabelMutationResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "not_found", message: LABEL_UNAVAILABLE_MESSAGE };
  }

  try {
    return await db.transaction(async (tx): Promise<LabelMutationResult> => {
      const scope = await resolveIssueScope(tx, context.workspaceId, input);
      if (!scope) {
        return { ok: false, error: "not_found", message: LABEL_UNAVAILABLE_MESSAGE };
      }

      // The label must belong to the same workspace as the issue.
      const [label] = await tx
        .select({ id: labels.id, name: labels.name, color: labels.color })
        .from(labels)
        .where(
          and(eq(labels.id, input.labelId), eq(labels.workspaceId, scope.workspaceId)),
        )
        .limit(1);
      if (!label) {
        return { ok: false, error: "not_found", message: LABEL_UNAVAILABLE_MESSAGE };
      }

      let changed = false;
      if (mode === "attach") {
        const [current] = await tx
          .select({ total: count() })
          .from(issueLabels)
          .where(eq(issueLabels.issueId, scope.id));
        const already = await tx
          .select({ labelId: issueLabels.labelId })
          .from(issueLabels)
          .where(
            and(eq(issueLabels.issueId, scope.id), eq(issueLabels.labelId, label.id)),
          )
          .limit(1);
        if (already.length === 0) {
          if (Number(current?.total ?? 0) >= MAX_LABELS_PER_ISSUE) {
            return {
              ok: false,
              error: "limit",
              message: `An issue can have up to ${MAX_LABELS_PER_ISSUE} labels. Remove one to add another.`,
            };
          }
          const rows = await tx
            .insert(issueLabels)
            .values({ issueId: scope.id, labelId: label.id })
            .onConflictDoNothing()
            .returning({ labelId: issueLabels.labelId });
          changed = rows.length > 0;
        }
      } else {
        const rows = await tx
          .delete(issueLabels)
          .where(
            and(eq(issueLabels.issueId, scope.id), eq(issueLabels.labelId, label.id)),
          )
          .returning({ labelId: issueLabels.labelId });
        changed = rows.length > 0;
      }

      let event: IssueHistoryEvent | null = null;
      if (changed) {
        const type =
          mode === "attach"
            ? ISSUE_ACTIVITY_TYPES.LABEL_ADDED
            : ISSUE_ACTIVITY_TYPES.LABEL_REMOVED;
        const data = { labelId: label.id, labelName: label.name };
        const row = await insertIssueActivityEvent(tx, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          reviewId: scope.reviewId,
          issueId: scope.id,
          actorUserId: context.userId,
          type,
          data,
          createdAt: new Date(),
        });
        const actorDisplayName = personDisplayName(context.userName, context.userEmail);
        const summary = row
          ? formatIssueHistorySummary({ type, actorDisplayName, data })
          : null;
        if (!row || !summary) throw new Error("history_write_failed");
        event = {
          id: row.id,
          type,
          createdAt: row.createdAt.toISOString(),
          actorDisplayName,
          summary,
        };
      }

      const map = await listLabelsForIssues(
        { workspaceId: context.workspaceId },
        [scope.id],
        tx,
      );
      return { ok: true, labels: map.get(scope.id) ?? [], event };
    });
  } catch {
    return { ok: false, error: "unavailable", message: LABEL_SAVE_FAILED_MESSAGE };
  }
}

export function attachLabelToIssue(
  context: WorkspaceContext,
  input: IssueScopeInput & { labelId: string },
): Promise<LabelMutationResult> {
  return mutateIssueLabel(context, input, "attach");
}

export function detachLabelFromIssue(
  context: WorkspaceContext,
  input: IssueScopeInput & { labelId: string },
): Promise<LabelMutationResult> {
  return mutateIssueLabel(context, input, "detach");
}
