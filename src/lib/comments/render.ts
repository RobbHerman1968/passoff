import type { IssueCommentMention } from "@/lib/comments/types";

/**
 * Split comment body into plain text and mention segments for safe rendering.
 * Mentions are matched by display name after an @ — never by injecting HTML.
 */
export function splitCommentBody(
  body: string,
  mentions: IssueCommentMention[],
): Array<{ type: "text"; value: string } | { type: "mention"; value: string; userId: string }> {
  if (!body) return [{ type: "text", value: "" }];
  if (mentions.length === 0) return [{ type: "text", value: body }];

  const names = [...mentions]
    .map((mention) => ({
      userId: mention.userId,
      displayName: mention.displayName.trim(),
    }))
    .filter((mention) => mention.displayName.length > 0)
    .sort((a, b) => b.displayName.length - a.displayName.length);

  if (names.length === 0) return [{ type: "text", value: body }];

  const escaped = names.map((mention) =>
    mention.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`@(${escaped.join("|")})(?=$|\\s|[.,!?;:])`, "g");

  const parts: Array<
    { type: "text"; value: string } | { type: "mention"; value: string; userId: string }
  > = [];
  let lastIndex = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: body.slice(lastIndex, index) });
    }
    const name = match[1] ?? "";
    const mentioned = names.find(
      (item) => item.displayName.toLowerCase() === name.toLowerCase(),
    );
    if (mentioned) {
      parts.push({
        type: "mention",
        value: `@${mentioned.displayName}`,
        userId: mentioned.userId,
      });
    } else {
      parts.push({ type: "text", value: match[0] ?? "" });
    }
    lastIndex = index + (match[0]?.length ?? 0);
  }
  if (lastIndex < body.length) {
    parts.push({ type: "text", value: body.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: body }];
}
