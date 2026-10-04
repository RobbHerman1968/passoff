# Passoff video platform direction

Status: Approved implementation direction  
Last updated: October 4, 2026

## Decision

Use Mux Video as the system of record for short video evidence attached to
website issues: upload, processing, high-quality master storage, adaptive
playback, posters, thumbnails, and delivery. Video is not a standalone review
type in the active product model.

Use `next-video` only when it improves the review-player implementation. It is
a presentation-layer option, not the upload pipeline, authorization boundary,
metadata store, billing meter, or provider source of truth. Prefer Mux Player
directly if it gives Passoff better control over accessible playback,
timestamped feedback, frame positions, or delivery behavior.

This direction applies when the video MVP is implemented unless measured cost,
security, accessibility, or reliability evidence supports a deliberate change.
Record any change here before changing providers or architecture.

## Customer-facing limits

Measure new and retained video by running time. Duration maps to Mux billing and
is easier for a customer to understand than renditions or encoded bytes.

| Plan | New video each calendar month | Retained at once | Reviewer playback |
| --- | ---: | ---: | ---: |
| Free | 10 minutes | 15 minutes | Unlimited |
| Studio | 30 minutes | 60 minutes | Unlimited |
| Agency | 60 minutes | 120 minutes | Unlimited |

Every plan limits an individual clip to 3 minutes and 250 MB, with quality up
to 1080p. Playback has no customer-facing hour limit and never creates an
automatic overage charge.

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
- Limit standard MVP assets to 1080p at ingest. Do not store 2K or 4K variants
  unless Passoff deliberately adds a higher-resolution product option.
- Allow adaptive playback up to 1080p on every plan.
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
