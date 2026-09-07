import "server-only";

import { db } from "@/db";
import { auditEvents } from "@/db/schema";

type AuditInput = {
  workspaceId: string;
  projectId?: string | null;
  actorType: "user" | "reviewer" | "system";
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditEvent(input: AuditInput, tx: typeof db = db) {
  await tx.insert(auditEvents).values({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });
}
