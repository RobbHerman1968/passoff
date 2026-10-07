# Video evidence on issues

How a short video becomes evidence on an issue, and how it is played, replaced, and removed.
Product direction lives in [`VIDEO_PLATFORM_DIRECTION.md`](./VIDEO_PLATFORM_DIRECTION.md); allowances
live in `src/lib/billing/plans.ts`. Nothing here restates those numbers in user copy.

## Limits

3 minutes, 250 MB, 1080p, one active video per issue. New video per calendar month and retained
video come from the workspace plan. Every limit is read from `plans.ts` or `src/lib/video/states.ts`.

## State model

`video_assets.lifecycle` says what role a clip plays on its issue:

| Lifecycle | Meaning |
| --- | --- |
| `current` | The clip people see. At most one per issue (partial unique index). |
| `replacement` | A newer clip on its way. At most one per issue. The `current` clip keeps playing. |
| `retired` | Replaced or superseded. Never shown or played. |
| `removed` | Removed by a person, retention, or project deletion. May leave a note. |

`processing_status` is the pipeline state: `pending`, `uploading`, `processing`, `ready`,
`needs_attention`, `failed`. People see one combined state from `displayStateFor`
(`uploading`, `processing`, `ready`, `needs_attention`, `failed`, `removed`). An upload that is
still `pending` or `uploading` after 70 minutes is treated as failed and swept by the cron job.

A removal note is shown only when no current clip exists and the removal reason is
`deleted_by_member`, `retention_expired`, or `project_deleted`. Cancelling an upload or dismissing
a failed attempt leaves no note.

## Upload and allowance

1. `POST /api/video/uploads` checks the origin and signs-in member (`canMutateProjects`).
2. `reserveVideoUpload` runs in one transaction: advisory lock per workspace, `FOR UPDATE` on the
   issue, then archived, closed, busy, and allowance checks. Only after those pass does it save the
   rows (`pending`) and retire stale or failed earlier attempts. A unique-index violation means busy.
3. The Mux direct upload is created. Only its one-time URL and our own `videoAssetId` go back to
   the browser. If Mux fails, the reservation is discarded.
4. The browser uploads with UpChunk directly to Mux. Nothing is stored in the browser.
5. Mux's webhook is the source of truth. Duration over 3 minutes or a track taller than 1080p goes
   to `needs_attention`, is never playable, and its stored copy is queued for deletion. If Mux
   measures a clip clearly longer than the browser said, the allowance is checked again.

Mux does not report file size, so bytes are enforced from the declared size at reservation and
the browser's own check. That is a known gap.

## Playback

`GET /api/video/[videoAssetId]/playback` returns short-lived signed tokens (`private, no-store`)
only when the clip is `current`, `ready`, has a playback id, and its issue is live. Members need
workspace access. Guests need a live (not revoked, not expired) review session for that review and
the review must not be archived. A revoked guest receives no token. The player uses
`preload="none"` and never autoplays; the poster comes from a signed thumbnail token.

## Replace and remove

- Replace: the browser asks for confirmation before the upload starts. The new clip is a
  `replacement`. Archived reviews are read-only: no add, replace, cancel, or remove controls show. When Mux reports it ready, it becomes `current` and the
  old clip is retired in the same transaction. Failure leaves the old clip untouched.
- Remove: the clip becomes `removed`, the issue and its history stay, and deletion at Mux is
  requested. The first attempt happens immediately. Failures retry with backoff (1m, 5m, 15m, 1h,
  3h, then every 6h) from `/api/cron/video`. A 404 from Mux counts as deleted.
- Cancelling an upload asks Mux to cancel it. If Mux refuses because bytes are arriving, the
  later `asset_created` event binds the asset id and the stored copy is deleted.
- Project deletion requests deletion for every clip in the project.

## Webhooks

Events are claimed in `provider_events` for idempotency; the claim is released if processing
throws so Mux's retry works. Passthrough ids must be UUIDs. Events for `retired` or `removed`
clips only bind provider ids and delete the stored copy. A late error never damages a ready clip.

## Time-based notes

A note is a comment written for one moment of the issue's current video. One system holds them:
`video_annotations` (workspace, issue, comment, video asset, `timestamp_ms`, optional normalized
`x`/`y`, the clip length when the note was written, `created_at`). The text, author, visibility,
and discussion position live in `issue_comments`; each annotation has exactly
one comment (unique `comment_id`), so notes show in the discussion like any reply.

- **Who can add:** members with project edit rights (public or private, their choice) and guests
  on a link that allows replies (public only, through the SDK route `video-notes`). Server code
  locks the current ready clip, checks the time against the server's own clip length (500 ms of
  slack), checks the pin is both-or-neither and inside 0..1, and refuses archived reviews and
  clips that are no longer current.
- **Pins:** stored as fractions of the picture, not the player box. The player measures the
  picture rectangle (`object-fit: contain`) from the video's own size, so letterbox bars, full
  screen, zoom, and screen sharpness do not move a pin. Pure geometry lives in
  `src/lib/video/annotations/geometry.ts`.
- **Numbers:** per clip, in time order, counted only among notes the viewer may see, so a hidden
  private note never leaves a gap for guests.
- **Playback sync:** the player reports the time a few times a second; React re-renders only when
  the set of visible notes changes (from 0.5 s before a note until 2.5 s after).
- **Timeline and list:** a marker strip under the player (the player's own timeline is in a shadow
  root) and an ordered list. Both can go to a note by keyboard.
- **Replacement:** a replaced, removed, or expired clip keeps its notes. They are labeled "Earlier
  video" / "Removed video" / "Expired video" with a plain warning, get no jump button, and are
  never drawn on the new clip or copied to it. Guests only learn that the note's video is
  unavailable.
- **Events:** history `issue.video_note_added` (guest-safe) and `issue.private_video_note_added`
  (members only) carry the time, whether there is a pin, and visibility, never the text. Webhook
  `issue.video_note_added` is sent for public notes only, with the time in seconds and a pin flag.
  Comment notifications are the same as for any reply.

## Retention

- A clip is kept while its issue is open.
- Closing an issue sets `retention_ends_at` to 30 days later (from `VIDEO_EVIDENCE_COMMON_LIMITS`)
  on the clips in use, in the same transaction as the status change. Reopening clears it. A clip
  that becomes ready on an already closed issue gets the date when it is promoted.
- `/api/cron/video` (every 10 minutes) runs, in order: stale-upload sweep, retention expiry,
  retention warnings, provider deletion retries. Expiry locks the issue row first, so a reopen at
  the same moment either wins or loses cleanly; a stale date on a non-closed issue is cleared and
  the clip kept. Each clip is its own transaction; the stored copy is deleted right away and
  retried with backoff if Mux fails. The clip row stays as the tombstone. Comments, notes,
  screenshots, and history are never deleted.
- Seven days before removal, the uploader, the assignee, and workspace owners get one in-app
  notice per removal date (`video_assets.retention_warned_for`). Closing, reopening, and closing
  again earns a new notice.
- Members see "Kept while this issue is open", the removal date, or a warning (icon plus text)
  within seven days. Guests see nothing about retention.
- Allowances: only `current`/`replacement` clips that are pending/uploading (and not stale),
  processing, or ready, and not provider-deleted or past their date, count as retained minutes.
  Failed, cancelled, needs-attention, retired, removed, and expired clips do not.

## Events leaving Passoff

History: `issue.video_added`, `issue.video_replaced`, `issue.video_removed`,
`issue.video_expired` (guest-safe) and `issue.video_needs_attention` (members only). Webhooks:
`issue.video_ready`, `issue.video_replaced`, `issue.video_removed` (also sent on expiry),
`issue.video_failed`, `issue.video_expiring`. Payloads carry only a kind, a
rounded length in seconds, and a short failure code. Notifications go to the uploader and assignee
in the app only.

## Known limits

- No video player or upload in the guest page or website SDK. The guest playback API exists.
- No job reconciles Mux assets that have no Passoff record.
- Notes have no mentions, time ranges, drawing, or transcription. Guests can create notes through
  the SDK route, but there is no guest video player yet, so no guest note screen.
- On phones without the element Fullscreen API, native full screen hides pins.
