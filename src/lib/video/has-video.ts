import { sql, type SQL } from "drizzle-orm";

import { issues } from "@/db/schema";

/**
 * True when an issue has a video people can actually watch: the current clip is ready.
 * Uploads in progress, failed or too-large clips, replaced clips, and removed clips do not
 * count. Use this wherever a list, filter, or export says an issue "has video".
 */
export function playableVideoExistsSql(workspaceId: string): SQL<boolean> {
  return sql<boolean>`exists (
    select 1
    from video_assets va
    inner join issue_evidence ie
      on ie.id = va.evidence_id and ie.workspace_id = va.workspace_id
    where ie.issue_id = ${issues.id}
      and ie.workspace_id = ${workspaceId}
      and ie.kind = 'video'
      and va.lifecycle = 'current'
      and va.processing_status = 'ready'
  )`;
}
