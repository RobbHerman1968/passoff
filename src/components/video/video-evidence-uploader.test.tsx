import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoEvidenceUploader } from "@/components/video/video-evidence-uploader";

type Handler = (event: { detail?: unknown }) => void;

const upchunk = vi.hoisted(() => {
  const state = {
    handlers: new Map<string, Handler>(),
    abort: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    options: null as Record<string, unknown> | null,
    emit(name: string, detail?: unknown) {
      state.handlers.get(name)?.({ detail });
    },
  };
  return state;
});

vi.mock("@mux/upchunk", () => ({
  createUpload: (options: Record<string, unknown>) => {
    upchunk.options = options;
    upchunk.handlers.clear();
    return {
      on: (name: string, handler: Handler) => upchunk.handlers.set(name, handler),
      abort: upchunk.abort,
      pause: upchunk.pause,
      resume: upchunk.resume,
    };
  },
}));

let clipSeconds = 42;

function file(name = "bug.mp4", type = "video/mp4", size = 2 * 1024 * 1024) {
  const instance = new File([new Uint8Array(8)], name, { type });
  Object.defineProperty(instance, "size", { value: size });
  return instance;
}

function mockFetch(response: { ok: boolean; status?: number; body: unknown }) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 201 : 400),
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("VideoEvidenceUploader", () => {
  beforeEach(() => {
    clipSeconds = 42;
    upchunk.abort.mockClear();
    upchunk.pause.mockClear();
    upchunk.resume.mockClear();
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get: () => "",
      set(this: HTMLVideoElement) {
        Object.defineProperty(this, "duration", { value: clipSeconds, configurable: true });
        setTimeout(() => this.onloadedmetadata?.(new Event("loadedmetadata")), 0);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains the limits in plain words with a visible label", async () => {
    const { container } = render(<VideoEvidenceUploader issueId="issue-1" />);
    expect(screen.getByLabelText("Video file")).toBeInTheDocument();
    expect(screen.getByText(/up to 3 minutes and 250 MB/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("rejects the wrong file type before anything is sent", async () => {
    const fetchSpy = mockFetch({ ok: true, body: {} });
    render(<VideoEvidenceUploader issueId="issue-1" />);
    const input = screen.getByLabelText("Video file") as HTMLInputElement;
    // applyAccept: false so the browser filter doesn't hide the invalid file from the test.
    await userEvent.setup({ applyAccept: false }).upload(input, file("notes.pdf", "application/pdf"));
    expect(await screen.findByText("Choose an MP4, MOV, or WebM video and try again.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects files over the size limit", async () => {
    const fetchSpy = mockFetch({ ok: true, body: {} });
    render(<VideoEvidenceUploader issueId="issue-1" />);
    await userEvent.upload(
      screen.getByLabelText("Video file"),
      file("big.mp4", "video/mp4", 251 * 1024 * 1024),
    );
    expect(await screen.findByText("Choose a video smaller than 250 MB.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects clips longer than the limit", async () => {
    clipSeconds = 200;
    const fetchSpy = mockFetch({ ok: true, body: {} });
    render(<VideoEvidenceUploader issueId="issue-1" />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    expect(await screen.findByText("Choose a video that is 3 minutes or shorter.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the file extension when the browser gives no type", async () => {
    render(<VideoEvidenceUploader issueId="issue-1" />);
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText("Video file"), file("clip.mov", ""));
    expect(await screen.findByRole("button", { name: "Add video" })).toBeInTheDocument();
  });

  it("uploads with the one-time link, shows progress, and finishes", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      body: { ok: true, endpoint: "https://upload.example/one-time", videoAssetId: "va-1" },
    });
    const onUploadFinished = vi.fn();
    render(<VideoEvidenceUploader issueId="issue-1" onUploadFinished={onUploadFinished} />);

    await userEvent.upload(screen.getByLabelText("Video file"), file());
    await userEvent.click(await screen.findByRole("button", { name: "Add video" }));

    await waitFor(() => expect(upchunk.options?.endpoint).toBe("https://upload.example/one-time"));
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body as string)).toMatchObject({
      issueId: "issue-1",
      mimeType: "video/mp4",
      durationSeconds: 42,
    });

    act(() => upchunk.emit("progress", 40));
    expect(document.querySelector("progress")).toHaveAttribute("value", "40");
    expect(screen.getByText("40%")).toBeInTheDocument();

    act(() => upchunk.emit("success"));
    expect(await screen.findByText("Video uploaded")).toBeInTheDocument();
    expect(onUploadFinished).toHaveBeenCalledTimes(1);
  });

  it("pauses and resumes", async () => {
    mockFetch({ ok: true, body: { ok: true, endpoint: "https://u.example/x", videoAssetId: "va-1" } });
    render(<VideoEvidenceUploader issueId="issue-1" />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    await userEvent.click(await screen.findByRole("button", { name: "Add video" }));
    await userEvent.click(await screen.findByRole("button", { name: /Pause upload/ }));
    expect(upchunk.pause).toHaveBeenCalled();
    expect(screen.getByText(/Upload paused. Choose Resume/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Resume upload/ }));
    expect(upchunk.resume).toHaveBeenCalled();
  });

  it("cancels, removes the saved upload, and says the issue is unchanged", async () => {
    mockFetch({ ok: true, body: { ok: true, endpoint: "https://u.example/x", videoAssetId: "va-1" } });
    const cancelUpload = vi.fn().mockResolvedValue(true);
    render(<VideoEvidenceUploader issueId="issue-1" cancelUpload={cancelUpload} />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    await userEvent.click(await screen.findByRole("button", { name: "Add video" }));
    await userEvent.click(await screen.findByRole("button", { name: /Cancel upload/ }));
    expect(upchunk.abort).toHaveBeenCalled();
    expect(cancelUpload).toHaveBeenCalledWith("va-1");
    expect(await screen.findByLabelText("Video file")).toBeInTheDocument();
    expect(screen.getByText(/Your issue and written feedback are unchanged/)).toBeInTheDocument();
  });

  it("keeps the chosen file and explains a failed upload, without raw errors", async () => {
    mockFetch({ ok: true, body: { ok: true, endpoint: "https://u.example/x", videoAssetId: "va-1" } });
    const cancelUpload = vi.fn().mockResolvedValue(true);
    render(<VideoEvidenceUploader issueId="issue-1" cancelUpload={cancelUpload} />);
    await userEvent.upload(screen.getByLabelText("Video file"), file("bug.mp4"));
    await userEvent.click(await screen.findByRole("button", { name: "Add video" }));
    await screen.findByRole("button", { name: /Pause upload/ });

    act(() => upchunk.emit("error", { message: "xhr 503 from mux" }));
    expect(
      await screen.findByText("The upload didn’t finish. Check your connection, then try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/503|mux/i)).not.toBeInTheDocument();
    expect(screen.getByText("bug.mp4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add video" })).toBeEnabled();
    expect(cancelUpload).toHaveBeenCalledWith("va-1");
  });

  it("shows the server's plain message when the upload can't start and keeps the file", async () => {
    mockFetch({
      ok: false,
      status: 409,
      body: { ok: false, message: "A video is already being added. Let it finish, or cancel it first." },
    });
    render(<VideoEvidenceUploader issueId="issue-1" />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    await userEvent.click(await screen.findByRole("button", { name: "Add video" }));
    expect(await screen.findByText(/already being added/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add video" })).toBeInTheDocument();
  });

  it("uses replace wording and says the current video stays until the new one is ready", async () => {
    render(<VideoEvidenceUploader issueId="issue-1" mode="replace" />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    expect(await screen.findByRole("button", { name: "Replace video" })).toBeInTheDocument();
    expect(screen.getByText(/current video stays in place/)).toBeInTheDocument();
  });

  it("asks for confirmation before replacing, and keeps the current video until then", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      body: { ok: true, endpoint: "https://u.example/x", videoAssetId: "va-1" },
    });
    render(<VideoEvidenceUploader issueId="issue-1" mode="replace" />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    await userEvent.click(await screen.findByRole("button", { name: "Replace video" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Replace this video?");
    expect(dialog).toHaveTextContent(/current video stays in place until the new one is ready/);
    expect(fetchSpy).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Keep current video" }));
    expect(fetchSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Replace video" }));
    const second = await screen.findByRole("alertdialog");
    await userEvent.click(within(second).getByRole("button", { name: "Replace video" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  });

  it("asks before leaving while an upload is running", async () => {
    mockFetch({ ok: true, body: { ok: true, endpoint: "https://u.example/x", videoAssetId: "va-1" } });
    render(<VideoEvidenceUploader issueId="issue-1" />);
    await userEvent.upload(screen.getByLabelText("Video file"), file());
    await userEvent.click(await screen.findByRole("button", { name: "Add video" }));
    await screen.findByRole("button", { name: /Pause upload/ });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("disables choosing a file while offline and explains why", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<VideoEvidenceUploader issueId="issue-1" />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/You’re offline. Reconnect to add a video/)).toBeInTheDocument();
    expect(screen.getByLabelText("Video file")).toBeDisabled();
  });
});
