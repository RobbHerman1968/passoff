import type { IssueCommentMention } from "@/lib/comments/types";

export type MentionQuery = {
  /** Index of the "@" that opened the suggestion list. */
  start: number;
  /** Text typed after the "@" up to the caret. */
  query: string;
};

const MAX_QUERY_LENGTH = 40;

/**
 * Find an in-progress mention at the caret. The "@" must start the text or
 * follow whitespace so email addresses never open the list.
 */
export function findMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1] ?? "")) return null;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY_LENGTH || query.includes("\n")) return null;
  return { start, query };
}

export function filterMentionCandidates(
  members: IssueCommentMention[],
  query: string,
  limit = 6,
): IssueCommentMention[] {
  const needle = query.trim().toLowerCase();
  const matches = members.filter((member) =>
    needle ? member.displayName.toLowerCase().includes(needle) : true,
  );
  return matches
    .sort((a, b) => {
      const aStarts = a.displayName.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.displayName.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.displayName.localeCompare(b.displayName);
    })
    .slice(0, limit);
}

/** Replace the in-progress "@query" with the chosen member's name. */
export function applyMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  member: IssueCommentMention,
): { text: string; caret: number } {
  const inserted = `@${member.displayName} `;
  const next = text.slice(0, mention.start) + inserted + text.slice(caret);
  return { text: next, caret: mention.start + inserted.length };
}

/**
 * Only members the author picked from the list, and whose name is still in
 * the text, are sent as mentions. Browsers never supply arbitrary IDs.
 */
export function resolveMentionedUserIds(
  body: string,
  picked: IssueCommentMention[],
): string[] {
  const ids = new Set<string>();
  for (const member of picked) {
    const name = member.displayName.trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\s)@${escaped}(?=$|\\s|[.,!?;:])`, "i").test(body)) {
      ids.add(member.userId);
    }
  }
  return [...ids];
}
