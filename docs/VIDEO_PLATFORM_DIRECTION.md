# Passoff video platform direction

Status: Provisional Phase 7 recommendation; decision checkpoint required before implementation
Last updated: October 4, 2026

## Decision

Use Mux Video as the system of record for short video evidence inside a website
review: upload, processing, adaptive playback, posters, thumbnails, and
delivery. Video is not a standalone project or review type in the recommended
Phase 7 model.

A person may enter the video workflow from either an existing issue or the
website review. Adding a clip from the review creates a draft issue for that
clip rather than a reusable media-library item. All video feedback therefore
uses the same issue number, status, priority, assignee, discussion,
verification, and activity history as website feedback.

Use `next-video` only when it improves the review-player implementation. It is
a presentation-layer option, not the upload pipeline, authorization boundary,
metadata store, billing meter, or provider source of truth. Prefer Mux Player
directly if it gives Passoff better control over accessible playback,
timestamped feedback, frame positions, or delivery behavior.

This is a recommendation, not a locked Phase 7 specification. Complete the
decision checkpoint below when Phase 7 begins, update this document with the
decisions, and only then create the implementation story.

## Phase 7 decision checkpoint

Revisit these decisions using current customer evidence, Mux pricing, measured
usage, and the product state at the start of Phase 7:

- Whether video can be added from both a review and an existing issue, or only
  as evidence on an existing issue.
- Whether Free receives no video or one temporary trial clip.
- The Studio and Agency new-minute and retained-minute allowances.
- Whether standard playback is capped at 720p or 1080p.
- The individual clip duration and file-size limits.
- Retention after issue closure and the warning window before deletion.
- Whether an overall website-review approval includes its video evidence.
- Whether point-in-time pins are sufficient or a validated need exists for
  shapes, drawing, or time ranges.
- Whether real guest usage requires any change to signed-token lifetime,
  revocation, or playback authorization.

Do not expand Phase 7 into standalone video projects, a reusable video library,
cut/version management, or professional editing tools without a separate
product decision.

## Recommended Phase 7 experience

Phase 7 should deliver a lightweight hybrid workflow:

1. Attach a short clip to an existing website issue, or start "Add video
   feedback" from a website review and create a draft issue for the clip.
2. Upload directly to Mux and preserve the draft issue through upload,
   processing, failure, retry, or cancellation.
3. Pause the ready video, choose "Add feedback," and place a numbered pin on
   the relevant frame.
4. Save the exact timestamp, normalized frame coordinates, written feedback,
   author, and an authorized poster-frame reference on the issue.
5. Show video issues in the same issue list as website issues. Opening one seeks
   to its timestamp, pauses playback, and displays its pin.
6. Show issue markers on the timeline and provide an equivalent ordered list
   for keyboard and screen-reader users.
7. Keep replies, assignment, status, verification, and review approval in the
   existing Passoff workflow rather than creating a second video workflow.

An overall review approval may include its attached video evidence, subject to
the Phase 7 checkpoint. It must not be presented as approval of a standalone
video cut.

## Provisional customer-facing limits

Measure new and retained video by running time. Duration maps to Mux billing and
is easier for a customer to understand than renditions or encoded bytes.

The current recommendation to evaluate at the Phase 7 checkpoint is:

| Plan | New video each calendar month | Retained at once | Reviewer playback |
| --- | ---: | ---: | ---: |
| Free | None, or one temporary trial clip | Trial only | No automatic overage |
| Studio | 60 minutes | 120 minutes | No automatic overage |
| Agency | 300 minutes | 600 minutes | No automatic overage |

The working clip limit remains 3 minutes and 250 MB. The cost-first
recommendation is Mux Basic quality with playback capped at 720p. Revalidate
these values before implementation; do not publish or enforce the proposed plan
allowances until that decision is recorded.

Count each source clip once. Do not count Mux renditions, posters, thumbnails,
or other provider-generated derivatives against the customer. Monitor delivered
minutes internally for abuse and cost anomalies without interrupting ordinary
client review.

Warn at 75% and 90% of the new-video and retained-video allowances. Before an
upload would exceed either allowance, preserve the person's issue and entered
information, then offer a clear choice to remove expired evidence or change
plans. Do not bill an automatic overage.

## Upload and processing flow

1. An authenticated, workspace-scoped Passoff endpoint validates plan allowance,
   file metadata, intended issue, and origin.
2. That endpoint creates a short-lived Mux Direct Upload configured for the
   issue and returns only the signed upload URL and Passoff upload identifier.
3. The browser uploads directly to Mux with visible progress, pause/resume where
   supported, cancellation, and a retry path. The file must not pass through a
   Vercel Function or Vercel Blob first.
4. Passoff stores its own pending upload record before the browser begins the
   transfer. Associate the Mux upload by a non-secret provider identifier and a
   stable Passoff correlation value.
5. Signature-verified Mux webhooks move the asset through Uploading, Preparing,
   Ready, and Needs attention. Webhook processing must be idempotent and safe
   when events arrive late, twice, or out of order.
6. Only the Ready event makes the video available for review. Notify the owner
   when processing finishes or when a recoverable action is required.

The interface may use Mux Uploader, UpChunk, or an equivalent accessible upload
surface. The product requirements—clear progress, keyboard support, recovery,
and preserved context—take precedence over the choice of upload component.

## Mux asset defaults

- Use the Basic video quality level for MVP on-demand review assets.
- Prefer a 720p maximum for evidence clips to control storage and delivery cost.
  Revisit 720p versus 1080p at the Phase 7 checkpoint using representative UI,
  text, and screen-recording samples.
- Do not store or deliver 2K or 4K variants unless Passoff deliberately adds a
  higher-resolution product option.
- Create signed playback IDs. Do not use public playback IDs for customer work.
- Do not enable DRM for MVP. Short-lived signed playback is the appropriate
  control for revocable guest review links.
- Do not create static MP4 renditions by default. Request temporary master
  access only when an authorized export or migration needs it.
- Attach a stable Passoff evidence identifier as provider metadata or passthrough
  data, never a guest email address or another unnecessary personal identifier.

## Playback and review

Issue a short-lived Mux playback token only after Passoff authorizes the current
workspace member or guest review session. Scope access to the intended issue and
make link revocation prevent new playback tokens.

The review player must:

- Lazy-mount after clear viewing intent so a poster view does not start video
  delivery.
- Avoid autoplay and excessive buffering.
- Pause when the page becomes hidden and when feedback entry begins.
- Expose the precise current time needed for feedback anchors.
- Support normalized frame positions without coupling stored feedback to player
  dimensions.
- Calculate positions against the rendered video content rectangle, excluding
  controls and letterbox or pillarbox space, so pins remain aligned in inline,
  responsive, and full-screen layouts.
- Seek to the saved timestamp, pause, and reveal the correct numbered pin when
  a video issue or timeline marker is selected.
- Offer the issue markers as an ordered, keyboard-operable, screen-reader
  accessible list; spatial placement must not be the only way to find or
  understand feedback.
- Provide keyboard-accessible play, pause, seek, mute, volume, speed, loop, and
  full-screen controls with visible focus and understandable labels.
- Respect reduced motion and work at 320 CSS pixels and 200% zoom.

`next-video` is acceptable if it satisfies these requirements and accepts the
Passoff-issued signed playback token. Do not use its default unauthenticated
request handler or generated JSON files as the production customer-video data
model.

## Posters and evidence thumbnails

Use Mux image and storyboard capabilities for posters, timeline previews, and
evidence thumbnails where they meet privacy and signed-access requirements.
Store the requested timestamp and provider parameters rather than copying every
generated image into Passoff storage by default. If a durable approval record
requires an immutable thumbnail, copy only that evidence image through the
approved non-video object-storage path.

## Phase 7 boundaries

Included in the recommendation:

- Short clips associated with website issues.
- Direct Mux upload, preparation, signed playback, posters, and thumbnails.
- Point-in-time feedback and replies.
- One numbered position pin per issue, with multiple issues allowed at the same
  timestamp.
- Accessible timeline markers and an equivalent feedback list.
- Existing issue assignment, status, discussion, verification, and activity
  history.
- Allowance enforcement, retention, deletion, and recovery states.

Deferred unless the Phase 7 checkpoint deliberately changes scope:

- Standalone video projects or a top-level video review type.
- A "latest cut" or sequence of video versions.
- Separate approval of a video cut.
- Freehand drawing, arrows, rectangles, moving annotations, or tracked objects.
- Time-range annotations.
- Transcripts, transcript-linked feedback, or AI video summaries.
- Side-by-side or frame-by-frame professional comparison.
- A reusable customer video library.

## Retention and cost control

- Enable and retain Mux Automatic Cold Storage.
- Keep inactive assets eligible for infrequent and cold pricing.
- Do not duplicate every uploaded source in Vercel Blob. Mux retains a
  high-quality master suitable for authorized temporary export.
- Keep video while its issue remains active, subject to the plan's retained-video
  allowance. When the issue closes, set `retentionEndsAt` to 30 days after its
  closure time. Reopening the issue before deletion clears that deadline.
- Let an owner remove stored video while preserving the issue text, comments,
  evidence metadata, version-specific approvals, and activity history.
- Permanently deleting an issue or completing an expired retention window must
  enqueue deletion of the associated Mux asset. Retry provider deletion safely
  and record completion.
- Reconcile Passoff records with Mux assets and usage on a schedule so abandoned
  uploads and orphaned assets do not continue generating cost.
- Track new minutes, retained minutes, delivered minutes, asset count,
  processing failures, and deletion lag by workspace and plan. Alert internally
  before provider usage becomes
  surprising.

## Provider boundary

Keep Mux API calls behind a small video-provider service. Product workflows
should use Passoff concepts such as create evidence upload, read processing
state, issue playback access, request poster, request master export, and delete
evidence. They
must not assemble Mux URLs or call the Mux SDK throughout route components.

Persist durable provider identifiers, state, duration, resolution, and failure
information in PostgreSQL. Never persist a short-lived signed upload URL,
playback token, temporary master URL, or raw Mux secret.

## Acceptance checks before launch

- Direct uploads resume or safely retry without routing bytes through Passoff.
- Webhook signatures, replay resistance, duplicate events, and out-of-order
  events are tested.
- Revoked guest links cannot obtain fresh playback tokens.
- One workspace cannot read, play, delete, or inspect another workspace's video.
- Video duration enforcement cannot be bypassed by client-supplied metadata.
- A closed issue schedules video deletion 30 days later; reopening it before
  deletion removes that deadline.
- The player supports the full keyboard, touch, mouse, and screen-reader review
  workflow at required responsive sizes.
- Deleting video removes the Mux asset and stops future storage charges while
  preserving the promised issue history.
- Usage dashboards reconcile closely enough with Mux billing data to warn before
  a plan limit or abnormal cost blocks work.

## Primary references

- Mux Direct Uploads: <https://www.mux.com/docs/guides/upload-files-directly>
- Mux Uploader: <https://www.mux.com/docs/guides/mux-uploader>
- Mux secure playback: <https://www.mux.com/docs/guides/secure-video-playback>
- Mux pricing: <https://www.mux.com/docs/pricing/overview>
- Mux cost optimization: <https://www.mux.com/docs/pricing/optimizing-video-costs>
- Mux master export: <https://www.mux.com/docs/guides/download-for-offline-editing>
- `next-video`: <https://next-video.dev/docs>
