"use client";

import { Clock, Lock, MessageSquare, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { createIssueCommentAction } from "@/app/(app)/projects/comment-actions";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DISCUSSION_REPLY_FIELD_ID } from "@/components/video/video-note-list";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import {
  applyMention,
  filterMentionCandidates,
  findMentionQuery,
  resolveMentionedUserIds,
  type MentionQuery,
} from "@/lib/comments/mention-input";
import { splitCommentBody } from "@/lib/comments/render";
import type {
  CommentVisibility,
  IssueCommentMention,
  IssueCommentView,
} from "@/lib/comments/types";
import { formatRelativeActivity } from "@/lib/projects/format";
import {
  formatVideoTimestamp,
  spokenVideoTimestamp,
  videoNoteHistoricalWarning,
  VIDEO_NOTE_SELECT_EVENT,
  type VideoNoteLink,
} from "@/lib/video/annotations/types";

type SendState = "idle" | "sending" | "error";

function commentCountLabel(count: number): string {
  return count === 1 ? "1 comment" : `${count} comments`;
}

export function IssueCommentBody({ comment }: { comment: IssueCommentView }) {
  const parts = splitCommentBody(comment.body, comment.mentions);
  return (
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((part, index) =>
        part.type === "mention" ? (
          <span
            key={`${index}-${part.userId}`}
            className="rounded-sm bg-muted px-1 font-medium"
          >
            {part.value}
          </span>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </p>
  );
}

function VideoNoteChip({ link }: { link: VideoNoteLink }) {
  const time = formatVideoTimestamp(link.timestampMs);
  if (link.videoState !== "current") {
    return (
      <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Note at {time} on an earlier video. {videoNoteHistoricalWarning(link.videoState)}
        </span>
      </p>
    );
  }
  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Go to ${spokenVideoTimestamp(link.timestampMs)} in the video`}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent(VIDEO_NOTE_SELECT_EVENT, {
              detail: { annotationId: link.annotationId },
            }),
          )
        }
      >
        <Clock data-icon="inline-start" aria-hidden="true" />
        Go to {time} in the video
      </Button>
    </div>
  );
}

function CommentItem({ comment }: { comment: IssueCommentView }) {
  const headingId = useId();
  const isPrivate = comment.visibility === "private";
  const designation = comment.authorKind === "guest" ? "Guest reviewer" : "Team member";

  return (
    <li>
      <article
        aria-labelledby={headingId}
        id={`comment-${comment.id}`}
        data-comment-id={comment.id}
        data-visibility={comment.visibility}
        className="rounded-lg border border-border bg-background p-3 sm:p-4"
      >
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span id={headingId} className="font-medium">
            {comment.authorDisplayName}
          </span>
          <Badge variant="outline">{designation}</Badge>
          {isPrivate ? (
            <Badge variant="secondary">
              <Lock data-icon="inline-start" aria-hidden="true" />
              Private note
            </Badge>
          ) : null}
          <time
            dateTime={comment.createdAt}
            className="text-muted-foreground"
            suppressHydrationWarning
          >
            {formatRelativeActivity(comment.createdAt)}
          </time>
        </header>
        {isPrivate ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Only your team can see this note.
          </p>
        ) : null}
        <IssueCommentBody comment={comment} />
        {comment.videoNote ? <VideoNoteChip link={comment.videoNote} /> : null}
      </article>
    </li>
  );
}

export function IssueDiscussion({
  projectId,
  reviewId,
  issueNumber,
  initialComments,
  members,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  initialComments: IssueCommentView[];
  members: IssueCommentMention[];
}) {
  const baseId = useId();
  // One discussion per page, so the reply box has a fixed id that video notes can link to.
  const textareaId = DISCUSSION_REPLY_FIELD_ID;
  const listboxId = `${baseId}-mentions`;
  const online = useOnlineStatus();

  const [added, setAdded] = useState<IssueCommentView[]>([]);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<CommentVisibility>("public");
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [picked, setPicked] = useState<IssueCommentMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sendingRef = useRef(false);

  const comments = useMemo(() => {
    const known = new Set(initialComments.map((comment) => comment.id));
    return [...initialComments, ...added.filter((comment) => !known.has(comment.id))];
  }, [initialComments, added]);

  const candidates = useMemo(
    () => (mentionQuery ? filterMentionCandidates(members, mentionQuery.query) : []),
    [members, mentionQuery],
  );
  const listOpen = Boolean(mentionQuery) && candidates.length > 0;
  const activeCandidate = listOpen ? candidates[Math.min(activeIndex, candidates.length - 1)] : null;
  const optionId = (userId: string) => `${listboxId}-${userId}`;

  const updateMentionQuery = useCallback((text: string, caret: number) => {
    setMentionQuery(findMentionQuery(text, caret));
    setActiveIndex(0);
  }, []);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setBody(event.target.value);
    setAnnouncement("");
    if (error && state !== "sending") {
      setError(null);
      setState("idle");
    }
    updateMentionQuery(event.target.value, event.target.selectionStart);
  }

  function chooseMention(member: IssueCommentMention) {
    if (!mentionQuery) return;
    const caret = textareaRef.current?.selectionStart ?? body.length;
    const next = applyMention(body, mentionQuery, caret, member);
    setBody(next.text);
    setPicked((current) =>
      current.some((item) => item.userId === member.userId)
        ? current
        : [...current, member],
    );
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(next.caret, next.caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!listOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % candidates.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      if (activeCandidate) {
        event.preventDefault();
        chooseMention(activeCandidate);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMentionQuery(null);
    }
  }

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (sendingRef.current) return;

    const trimmed = body.trim();
    if (!trimmed) {
      setError("Enter a reply.");
      setState("error");
      textareaRef.current?.focus();
      return;
    }
    if (trimmed.length > ISSUE_COMMENT_MAX_LENGTH) {
      setError(
        `Keep this reply under ${ISSUE_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
      );
      setState("error");
      textareaRef.current?.focus();
      return;
    }
    if (!online) {
      setError("You’re offline. Your reply is still here. Reconnect, then try again.");
      setState("error");
      textareaRef.current?.focus();
      return;
    }

    sendingRef.current = true;
    setState("sending");
    setError(null);
    setAnnouncement("Adding your reply.");
    setMentionQuery(null);

    try {
      const result = await createIssueCommentAction({
        projectId,
        reviewId,
        issueNumber,
        body: trimmed,
        visibility,
        mentionedUserIds: resolveMentionedUserIds(trimmed, picked),
      });
      if (!result.ok) {
        setError(result.message);
        setState("error");
        setAnnouncement("");
        return;
      }
      setAdded((current) => [...current, result.comment]);
      setBody("");
      setPicked([]);
      setState("idle");
      setAnnouncement(
        result.comment.visibility === "private"
          ? "Private note added."
          : "Reply added.",
      );
    } catch {
      setError(
        "We couldn’t add your reply. Your text is still here. Check your connection and try again.",
      );
      setState("error");
      setAnnouncement("");
    } finally {
      sendingRef.current = false;
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  const sending = state === "sending";
  const isPrivate = visibility === "private";
  const submitLabel = sending
    ? "Adding reply…"
    : state === "error" && error && body.trim()
      ? "Try again"
      : isPrivate
        ? "Add private note"
        : "Add reply";

  return (
    <section
      aria-labelledby="issue-discussion-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="issue-discussion-heading" className="type-section-title">
          Discussion
        </h2>
        <p className="type-supporting" data-testid="comment-count">
          {commentCountLabel(comments.length)}
        </p>
      </div>

      <div className="mt-4">
        {comments.length === 0 ? (
          <EmptyState
            headingLevel={3}
            icon={<MessageSquare />}
            title="No replies yet"
            description="Ask a question, share an update, or leave a private note for your team."
            className="px-4 py-8"
          />
        ) : (
          <ol aria-label="Comments, oldest first" className="grid gap-3">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
        <div className="relative">
          <FormField
            id={textareaId}
            label="Reply"
            description="Type @ to mention a teammate."
            error={error ?? undefined}
          >
            <Textarea
              ref={textareaRef}
              name="reply"
              value={body}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onClick={(event) =>
                updateMentionQuery(
                  event.currentTarget.value,
                  event.currentTarget.selectionStart,
                )
              }
              onBlur={() => setMentionQuery(null)}
              readOnly={sending}
              aria-busy={sending || undefined}
              aria-controls={listOpen ? listboxId : undefined}
              aria-activedescendant={
                listOpen && activeCandidate
                  ? optionId(activeCandidate.userId)
                  : undefined
              }
              autoComplete="off"
              rows={4}
            />
          </FormField>
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Mention a teammate"
            hidden={!listOpen}
            className="absolute inset-x-0 z-10 mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {listOpen
              ? candidates.map((member, index) => (
                  <li
                    key={member.userId}
                    id={optionId(member.userId)}
                    role="option"
                    aria-selected={member.userId === activeCandidate?.userId}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseMention(member);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm aria-selected:bg-muted aria-selected:font-medium"
                  >
                    {member.displayName}
                  </li>
                ))
              : null}
          </ul>
        </div>

        <div className="grid gap-2">
          <p id={`${baseId}-visibility-label`} className="text-sm font-medium">
            Who can see this?
          </p>
          <RadioGroup
            aria-labelledby={`${baseId}-visibility-label`}
            value={visibility}
            onValueChange={(value) => setVisibility(value as CommentVisibility)}
            disabled={sending}
            className="gap-1"
          >
            <div className="flex min-h-11 items-start gap-3 py-2">
              <RadioGroupItem value="public" id={`${baseId}-public`} className="mt-0.5" />
              <Label htmlFor={`${baseId}-public`} className="grid gap-0.5 font-normal">
                <span className="font-medium">Public reply</span>
                <span className="type-supporting">
                  Reviewers on the page and your team can see it.
                </span>
              </Label>
            </div>
            <div className="flex min-h-11 items-start gap-3 py-2">
              <RadioGroupItem value="private" id={`${baseId}-private`} className="mt-0.5" />
              <Label htmlFor={`${baseId}-private`} className="grid gap-0.5 font-normal">
                <span className="font-medium">Private note</span>
                <span className="type-supporting">Only your team can see it.</span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {!online ? (
          <p className="type-supporting" role="status">
            You’re offline. You can keep writing. Add your reply once you’re back online.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={sending}>
            {submitLabel}
          </Button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={announcement ? "text-sm text-muted-foreground" : "sr-only"}
          data-testid="discussion-status"
        >
          {announcement}
        </p>
      </form>
    </section>
  );
}
