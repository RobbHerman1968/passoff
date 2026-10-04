import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoEvidencePlayer } from "@/components/video/video-evidence-player";

vi.mock("@mux/mux-player-react", () => ({
  default: (props: {
    playbackId: string;
    tokens: { playback: string; thumbnail: string; storyboard: string };
    title?: string;
    autoPlay?: boolean;
    preload?: string;
    maxResolution?: string;
  }) => (
    <div
      data-testid="mux-player"
      data-playback-id={props.playbackId}
      data-autoplay={String(props.autoPlay ?? false)}
      data-preload={props.preload}
      data-max-resolution={props.maxResolution}
      aria-label={props.title ?? "Video evidence"}
      role="region"
    >
      tokens:{props.tokens.playback}/{props.tokens.thumbnail}/{props.tokens.storyboard}
    </div>
  ),
}));

describe("VideoEvidencePlayer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows loading then ready state with signed tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          playbackId: "pb_123",
          tokens: {
            playback: "play-token",
            thumbnail: "thumb-token",
            storyboard: "story-token",
          },
        }),
      }),
    );

    const { container } = render(<VideoEvidencePlayer videoAssetId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByText("Preparing video…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("mux-player")).toBeInTheDocument();
    });

    const player = screen.getByTestId("mux-player");
    expect(player).toHaveAttribute("data-playback-id", "pb_123");
    expect(player).toHaveAttribute("data-autoplay", "false");
    expect(player).toHaveAttribute("data-preload", "metadata");
    expect(player).toHaveAttribute("data-max-resolution", "1080p");
    expect(player).toHaveTextContent("tokens:play-token/thumb-token/story-token");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows permission, processing, and retryable error states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          code: "permission_denied",
          message: "You don’t have access to play this video.",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          code: "processing",
          message: "We’re still preparing this video. It will appear here when it’s ready.",
        }),
      })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          playbackId: "pb_retry",
          tokens: {
            playback: "a",
            thumbnail: "b",
            storyboard: "c",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <VideoEvidencePlayer videoAssetId="22222222-2222-4222-8222-222222222222" />,
    );
    await waitFor(() => {
      expect(screen.getByText("You don’t have access to play this video.")).toBeInTheDocument();
    });

    rerender(<VideoEvidencePlayer videoAssetId="33333333-3333-4333-8333-333333333333" />);
    await waitFor(() => {
      expect(
        screen.getByText("We’re still preparing this video. It will appear here when it’s ready."),
      ).toBeInTheDocument();
    });

    rerender(<VideoEvidencePlayer videoAssetId="44444444-4444-4444-8444-444444444444" />);
    await waitFor(() => {
      expect(
        screen.getByText("We couldn’t play this video. Check your connection and try again."),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByTestId("mux-player")).toHaveAttribute("data-playback-id", "pb_retry");
    });
  });

  it("supports keyboard focus on the retry control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          ok: false,
          code: "failed",
          message: "We couldn’t prepare this video. Choose another file and try again.",
        }),
      }),
    );

    render(<VideoEvidencePlayer videoAssetId="55555555-5555-4555-8555-555555555555" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
  });
});
