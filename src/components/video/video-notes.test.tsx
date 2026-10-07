import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoNoteComposer } from "@/components/video/video-note-composer";
import { VideoNoteList } from "@/components/video/video-note-list";
import { VideoNotesPanel } from "@/components/video/video-notes-panel";
import { VideoNoteTimeline } from "@/components/video/video-note-timeline";
import {
  VIDEO_NOTE_SELECT_EVENT,
  type VideoNoteView,
} from "@/lib/video/annotations/types";

const player = vi.hoisted(() => ({
  time: 0,
  pause: vi.fn(),
  seek: vi.fn(),
  exitFullscreen: vi.fn(),
  onMoment: null as null | ((ms: number) => void),
  pointer: { x: 0.3, y: 0.6 } as { x: number; y: number } | null,
}));
const actions = vi.hoisted(() => ({ create: vi.fn() }));
const online = vi.hoisted(() => ({ value: true }));
const toasts = vi.hoisted(() => ({ success: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: router.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: toasts.success, error: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/issues/use-online-status", () => ({ useOnlineStatus: () => online.value }));
vi.mock("@/app/(app)/projects/video-note-actions", () => ({
  createVideoNoteAction: (...args: unknown[]) => actions.create(...args),
}));
vi.mock("@/components/video/video-evidence-player", async () => {
  const { useEffect } = await import("react");
  return {
    useVideoPlayerOverlay: () => ({
      content: { left: 10, top: 20, width: 400, height: 200 },
      fullscreen: false,
      clientToNormalized: () => player.pointer,
    }),
    VideoEvidencePlayer: ({
      onController,
      onDuration,
      onMoment,
      overlay,
    }: {
      onController?: (controller: unknown) => void;
      onDuration?: (ms: number) => void;
      onMoment?: (ms: number) => void;
      overlay?: React.ReactNode;
    }) => {
      useEffect(() => {
        player.onMoment = onMoment ?? null;
        onController?.({
          getCurrentTimeMs: () => player.time,
          getDurationMs: () => 40_000,
          seekToMs: (ms: number) => {
            player.time = ms;
            player.seek(ms);
          },
          pause: player.pause,
          exitFullscreen: player.exitFullscreen,
        });
        onDuration?.(40_000);
        return () => onController?.(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div data-testid="player" role="group" aria-label="Video evidence">
          {overlay}
        </div>
      );
    },
  };
});

function note(overrides: Partial<VideoNoteView> = {}): VideoNoteView {
  return {
    id: "n1",
    commentId: "c1",
    videoAssetId: "v1",
    videoState: "current",
    videoEndedAt: null,
    number: 1,
    timestampMs: 10_000,
    x: 0.5,
    y: 0.25,
    durationAtCreationMs: 40_000,
    body: "The logo is cut off",
    visibility: "public",
    authorDisplayName: "Ada",
    authorKind: "member",
    createdAt: "2026-10-07T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  player.time = 0;
  player.pointer = { x: 0.3, y: 0.6 };
  player.onMoment = null;
  player.pause.mockReset();
  player.seek.mockReset();
  player.exitFullscreen.mockReset();
  actions.create.mockReset();
  toasts.success.mockReset();
  router.refresh.mockReset();
  online.value = true;
});

describe("VideoNoteList", () => {
  it("lists notes in order with a jump button and a reply shortcut", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <VideoNoteList
        notes={[note(), note({ id: "n2", number: 2, timestampMs: 65_000, visibility: "private", x: null, y: null })]}
        onSelect={onSelect}
        canReply
      />,
    );
    expect(screen.getByRole("heading", { name: "Note 1 at 0:10" })).toBeInTheDocument();
    expect(screen.getByText("Private note")).toBeInTheDocument();
    expect(screen.getByText("Pin on the video")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to note 2 at 1 minute 5 seconds" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "n2" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("focuses the discussion reply box from Reply in discussion", async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="issue-discussion-reply">Reply</label>
        <textarea id="issue-discussion-reply" />
        <VideoNoteList notes={[note()]} canReply />
      </>,
    );
    Element.prototype.scrollIntoView = vi.fn();
    await user.click(screen.getByRole("button", { name: "Reply to note 1 in the discussion" }));
    expect(screen.getByLabelText("Reply")).toHaveFocus();
  });

  it("separates earlier-video notes, warns, and offers no jump button for them", () => {
    render(
      <VideoNoteList
        notes={[note({ id: "old", videoState: "replaced", videoAssetId: "v0" }), note()]}
        onSelect={vi.fn()}
        canReply={false}
      />,
    );
    expect(screen.getByText(/Notes from videos that are no longer here/)).toBeInTheDocument();
    expect(screen.getByText(/replaced\. The time may not match/)).toBeInTheDocument();
    expect(screen.getByText("Earlier video")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Go to note/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Reply to note/ })).toBeNull();
  });

  it("shows the empty message only when asked", () => {
    const { rerender } = render(<VideoNoteList notes={[]} canReply emptyMessage="No notes yet." />);
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
    rerender(<VideoNoteList notes={[]} canReply emptyMessage={null} />);
    expect(screen.queryByTestId("notes-empty")).toBeNull();
  });
});

describe("VideoNoteTimeline", () => {
  it("places named markers and reports selection", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <VideoNoteTimeline
        notes={[note(), note({ id: "n2", number: 2, timestampMs: 30_000, visibility: "private" })]}
        durationMs={40_000}
        selectedId="n1"
        onSelect={onSelect}
      />,
    );
    const marker = screen.getByRole("button", { name: /^Note 2 at 0:30, private note/ });
    expect(marker).toHaveStyle({ left: "75%" });
    expect(screen.getByTestId("note-marker-1")).toHaveAttribute("aria-pressed", "true");
    await user.click(marker);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "n2" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("explains itself until the video length is known, and hides when empty", () => {
    const { rerender, container } = render(
      <VideoNoteTimeline notes={[note()]} durationMs={null} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId("note-timeline-pending")).toBeInTheDocument();
    rerender(<VideoNoteTimeline notes={[]} durationMs={40_000} selectedId={null} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("VideoNoteComposer", () => {
  function setup(overrides: Partial<React.ComponentProps<typeof VideoNoteComposer>> = {}) {
    const props: React.ComponentProps<typeof VideoNoteComposer> = {
      timestampMs: 7_000,
      durationMs: 40_000,
      hasPin: false,
      placing: false,
      online: true,
      canChooseVisibility: true,
      onTimestampChange: vi.fn(),
      onUseCurrentTime: vi.fn(),
      onAddPin: vi.fn(),
      onRemovePin: vi.fn(),
      onTogglePlacing: vi.fn(),
      onWriting: vi.fn(),
      onCancel: vi.fn(),
      onSubmit: vi.fn().mockResolvedValue({ ok: true }),
      ...overrides,
    };
    return { props, ...render(<VideoNoteComposer {...props} />) };
  }

  it("has labelled fields, focuses the note, and passes accessibility checks", async () => {
    const { container } = setup();
    expect(screen.getByLabelText("Your note")).toHaveFocus();
    expect(screen.getByLabelText("Time in the video")).toHaveValue("0:07");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("asks for text before saving", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByText("Write your note before adding it.")).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the video paused while typing and submits with the chosen visibility", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.type(screen.getByLabelText("Your note"), "Hi");
    expect(props.onWriting).toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: /Private note/ }));
    await user.click(screen.getByRole("button", { name: "Add private note" }));
    expect(props.onSubmit).toHaveBeenCalledWith({
      body: "Hi",
      visibility: "private",
      timestampMs: 7_000,
    });
  });

  it("adjusts the time by buttons and by typing, and explains a bad time", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Forward 1 second" }));
    expect(props.onTimestampChange).toHaveBeenCalledWith(8_000);
    await user.click(screen.getByRole("button", { name: "Back 1 second" }));
    expect(props.onTimestampChange).toHaveBeenCalledWith(6_000);

    const time = screen.getByLabelText("Time in the video");
    await user.clear(time);
    await user.type(time, "soon");
    await user.type(screen.getByLabelText("Your note"), "Text");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByText("Enter a time in the video, like 0:42.")).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();

    await user.clear(time);
    await user.type(time, "9:00");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByText(/after the end of the video/)).toBeInTheDocument();
  });

  it("saves a time typed just before saving, not the old one", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const time = screen.getByLabelText("Time in the video");
    await user.clear(time);
    await user.type(time, "0:20");
    await user.type(screen.getByLabelText("Your note"), "Moved");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(props.onSubmit).toHaveBeenCalledWith({
      body: "Moved",
      visibility: "public",
      timestampMs: 20_000,
    });
    expect(props.onTimestampChange).toHaveBeenCalledWith(20_000);
  });

  it("switches between adding and removing a pin", async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup();
    await user.click(screen.getByRole("button", { name: "Add a pin" }));
    expect(props.onAddPin).toHaveBeenCalled();
    rerender(<VideoNoteComposer {...props} hasPin />);
    await user.click(screen.getByRole("button", { name: "Remove pin" }));
    expect(props.onRemovePin).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose a new spot" })).toBeInTheDocument();
  });

  it("keeps the text and offers a retry after a failure", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "We couldn’t save that note." })
      .mockResolvedValueOnce({ ok: true });
    setup({ onSubmit });
    await user.type(screen.getByLabelText("Your note"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save that note.");
    expect(screen.getByLabelText("Your note")).toHaveValue("Keep me");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("explains being offline instead of losing the note", async () => {
    const user = userEvent.setup();
    const { props } = setup({ online: false });
    expect(screen.getByText(/You’re offline\. You can keep writing/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your note"), "Offline words");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByRole("alert")).toHaveTextContent("You’re offline");
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your note")).toHaveValue("Offline words");
  });

  it("cancels with Escape", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.keyboard("{Escape}");
    expect(props.onCancel).toHaveBeenCalled();
  });

  it("hides the visibility choice when only public notes are allowed", () => {
    setup({ canChooseVisibility: false });
    expect(screen.queryByText("Who can see this?")).toBeNull();
  });
});

function PanelHarness({
  initial,
  canAddNotes = true,
  readOnlyReason = null,
  onChange,
}: {
  initial: VideoNoteView[];
  canAddNotes?: boolean;
  readOnlyReason?: string | null;
  onChange?: (notes: VideoNoteView[]) => void;
}) {
  const [notes, setNotes] = useState(initial);
  return (
    <VideoNotesPanel
      projectId="p1"
      reviewId="r1"
      issueNumber={3}
      videoAssetId="v1"
      durationSeconds={40}
      notes={notes}
      onNotesChange={(next) => {
        setNotes(next);
        onChange?.(next);
      }}
      canAddNotes={canAddNotes}
      readOnlyReason={readOnlyReason}
    />
  );
}

describe("VideoNotesPanel", () => {
  it("pauses, uses the current time, and saves a note with a pin the keyboard moved", async () => {
    const user = userEvent.setup();
    player.time = 7_400;
    const saved = note({ id: "new", number: 1, timestampMs: 7_000, x: 0.51, y: 0.5, body: "Fresh note" });
    actions.create.mockResolvedValue({ ok: true, note: saved, notes: [saved] });
    const onChange = vi.fn();
    render(<PanelHarness initial={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add note at this time" }));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByLabelText("Time in the video")).toHaveValue("0:07");

    await user.click(screen.getByRole("button", { name: "Add a pin" }));
    const draft = await screen.findByTestId("draft-pin");
    await waitFor(() => expect(draft).toHaveFocus());
    await user.keyboard("{ArrowRight}");

    await user.type(screen.getByLabelText("Your note"), "Fresh note");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(actions.create).toHaveBeenCalledTimes(1));
    const sent = actions.create.mock.calls[0][0];
    expect(sent).toMatchObject({
      projectId: "p1",
      reviewId: "r1",
      issueNumber: 3,
      videoAssetId: "v1",
      timestampMs: 7_400,
      body: "Fresh note",
      visibility: "public",
    });
    expect(sent.x).toBeCloseTo(0.51, 5);
    expect(sent.y).toBeCloseTo(0.5, 5);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([saved]));
    expect(toasts.success).toHaveBeenCalledWith("Note added at 0:07.");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByTestId("note-composer")).toBeNull();
    expect(screen.getByTestId("video-notes-status")).toHaveTextContent("Note added at 0:07.");
  });

  it("lets the person remove the pin before saving, and saves without one", async () => {
    const user = userEvent.setup();
    const saved = note({ x: null, y: null });
    actions.create.mockResolvedValue({ ok: true, note: saved, notes: [saved] });
    render(<PanelHarness initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add note at this time" }));
    await user.click(screen.getByRole("button", { name: "Add a pin" }));
    expect(await screen.findByTestId("draft-pin")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove pin" }));
    expect(screen.queryByTestId("draft-pin")).toBeNull();
    await user.type(screen.getByLabelText("Your note"), "No pin");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(actions.create).toHaveBeenCalled());
    expect(actions.create.mock.calls[0][0]).toMatchObject({ x: null, y: null });
  });

  it("places a pin where the person clicks on the picture", async () => {
    const user = userEvent.setup();
    render(<PanelHarness initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add note at this time" }));
    await user.click(screen.getByRole("button", { name: "Add a pin" }));
    await user.click(screen.getByRole("button", { name: "Choose a new spot" }));
    const surface = await screen.findByTestId("pin-placement-surface");
    surface.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
    await waitFor(() => expect(screen.queryByTestId("pin-placement-surface")).toBeNull());
    expect(screen.getByTestId("draft-pin").getAttribute("aria-label")).toMatch(
      /30 percent from the left and 60 percent from the top/,
    );
  });

  it("shows the server's message when saving fails and keeps the form open", async () => {
    const user = userEvent.setup();
    actions.create.mockResolvedValue({
      ok: false,
      message: "This video was replaced or removed, so notes can’t be added to it.",
    });
    render(<PanelHarness initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add note at this time" }));
    await user.type(screen.getByLabelText("Your note"), "Will not save");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("replaced or removed");
    expect(screen.getByLabelText("Your note")).toHaveValue("Will not save");
  });

  it("cancels the form and returns focus to the add button", async () => {
    const user = userEvent.setup();
    render(<PanelHarness initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add note at this time" }));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add note at this time" })).toHaveFocus(),
    );
  });

  it("draws pins only for the moment on screen, with names and numbers", async () => {
    render(
      <PanelHarness
        initial={[
          note(),
          note({ id: "n2", number: 2, timestampMs: 30_000, x: 0.1, y: 0.1, visibility: "private" }),
        ]}
      />,
    );
    expect(screen.queryByTestId("note-pin-1")).toBeNull();

    act(() => player.onMoment?.(10_200));
    const pin = await screen.findByTestId("note-pin-1");
    expect(pin).toHaveAccessibleName("Note 1 at 0:10: The logo is cut off");
    expect(pin).toHaveStyle({ left: "50%", top: "25%" });
    expect(screen.queryByTestId("note-pin-2")).toBeNull();

    act(() => player.onMoment?.(30_100));
    expect(await screen.findByTestId("note-pin-2")).toBeInTheDocument();
    expect(screen.queryByTestId("note-pin-1")).toBeNull();

    act(() => player.onMoment?.(36_000));
    await waitFor(() => expect(screen.queryByTestId("note-pin-2")).toBeNull());
  });

  it("goes to a note from the timeline, the list, and the discussion link", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    render(<PanelHarness initial={[note()]} />);

    await user.click(screen.getByTestId("note-marker-1"));
    expect(player.pause).toHaveBeenCalled();
    expect(player.seek).toHaveBeenLastCalledWith(10_000);
    expect(screen.getByTestId("selected-note")).toHaveTextContent("The logo is cut off");
    expect(screen.getByTestId("video-notes-status")).toHaveTextContent(
      "The video is paused at 10 seconds. The pin is shown on the video.",
    );
    expect(await screen.findByTestId("note-pin-1")).toHaveAttribute("aria-pressed", "true");

    player.seek.mockReset();
    await user.click(screen.getByRole("button", { name: "Go to note 1 at 10 seconds" }));
    expect(player.seek).toHaveBeenCalledWith(10_000);

    player.seek.mockReset();
    act(() => {
      window.dispatchEvent(new CustomEvent(VIDEO_NOTE_SELECT_EVENT, { detail: { annotationId: "n1" } }));
    });
    expect(player.seek).toHaveBeenCalledWith(10_000);
  });

  it("never draws or jumps to notes from an earlier video", async () => {
    render(
      <PanelHarness
        initial={[note({ id: "old", videoAssetId: "v0", videoState: "replaced" })]}
      />,
    );
    act(() => player.onMoment?.(10_000));
    expect(screen.queryByTestId("note-pin-1")).toBeNull();
    expect(screen.queryByTestId("note-timeline")).toBeNull();
    expect(screen.getByText(/replaced\. The time may not match/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Go to note/ })).toBeNull();
  });

  it("explains why notes can't be added when the review is read-only", () => {
    render(
      <PanelHarness
        initial={[]}
        canAddNotes={false}
        readOnlyReason="This review is archived, so notes can’t be added."
      />,
    );
    expect(screen.queryByRole("button", { name: "Add note at this time" })).toBeNull();
    expect(screen.getByText("This review is archived, so notes can’t be added.")).toBeInTheDocument();
  });

  it("passes accessibility checks with notes and the form open", async () => {
    const user = userEvent.setup();
    const { container } = render(<PanelHarness initial={[note()]} />);
    act(() => player.onMoment?.(10_000));
    await user.click(screen.getByRole("button", { name: "Add note at this time" }));
    expect(await axe(container)).toHaveNoViolations();
    const status = within(container).getByTestId("video-notes-status");
    expect(status).toHaveAttribute("role", "status");
  });
});
