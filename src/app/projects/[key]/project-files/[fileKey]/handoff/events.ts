export const commentsUpdatedEvent = "passoff:figma-comments-updated";
export const focusCommentEvent = "passoff:figma-comment-focus";
export const explanationsUpdatedEvent = "passoff:figma-explanations-updated";
export const focusExplanationEvent = "passoff:figma-explanation-focus";

export function notifyCommentsUpdated(fileKey: string, screenId: string) {
  window.dispatchEvent(new CustomEvent(commentsUpdatedEvent, { detail: { fileKey, screenId } }));
}

export function notifyExplanationsUpdated(fileKey: string, screenId: string) {
  window.dispatchEvent(new CustomEvent(explanationsUpdatedEvent, { detail: { fileKey, screenId } }));
}
