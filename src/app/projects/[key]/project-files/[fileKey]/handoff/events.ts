export const commentsUpdatedEvent = "passoff:figma-comments-updated";
export const focusCommentEvent = "passoff:figma-comment-focus";

export function notifyCommentsUpdated(fileKey: string, screenId: string) {
  window.dispatchEvent(new CustomEvent(commentsUpdatedEvent, { detail: { fileKey, screenId } }));
}
