import type { VideoNoteVideoState } from "@/lib/video/annotations/types";

/** Where a clip stands, from the notes' point of view. */
export function videoNoteVideoStateFor(
  lifecycle: string,
  removalReason: string | null,
): VideoNoteVideoState {
  if (lifecycle === "current" || lifecycle === "replacement") return "current";
  if (removalReason === "retention_expired") return "expired";
  if (removalReason === "replaced" || removalReason === "superseded") return "replaced";
  return "removed";
}
