import type { VideoNoteLink } from "@/lib/video/annotations/types";

export type CommentVisibility = "public" | "private";

export type CommentAuthorKind = "member" | "guest";

export type IssueCommentMention = {
  userId: string;
  displayName: string;
};

export type IssueCommentView = {
  id: string;
  body: string;
  visibility: CommentVisibility;
  authorDisplayName: string;
  authorKind: CommentAuthorKind;
  createdAt: string;
  mentions: IssueCommentMention[];
  /** Set when this comment is a note written at one moment of a video. */
  videoNote?: VideoNoteLink | null;
};
