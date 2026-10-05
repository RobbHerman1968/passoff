import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebsiteSetupPanel } from "@/components/reviews/website-setup-panel";
import { ContextualHelpProvider } from "@/components/help/help-context";
import { HelpDrawer } from "@/components/help/help-drawer";

const checkWebsiteInstallationAction = vi.fn();
const setWebsiteInstallationEnabledAction = vi.fn();
const analyzeWebsiteAction = vi.fn();
const loadWebsiteAnalysisAction = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastMessage = vi.fn();

vi.mock("@/app/(app)/projects/actions", () => ({
  checkWebsiteInstallationAction: (...args: unknown[]) =>
    checkWebsiteInstallationAction(...args),
  setWebsiteInstallationEnabledAction: (...args: unknown[]) =>
    setWebsiteInstallationEnabledAction(...args),
  analyzeWebsiteAction: (...args: unknown[]) => analyzeWebsiteAction(...args),
  loadWebsiteAnalysisAction: (...args: unknown[]) =>
    loadWebsiteAnalysisAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    message: (...args: unknown[]) => toastMessage(...args),
  },
}));

const KEY = "pk_0123456789abcdef0123456789abcdef";
const SNIPPET = `<script async src="https://app.example.com/sdk/v1/passoff.js" data-passoff-key="${KEY}"></script>`;

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof WebsiteSetupPanel>> = {},
) {
  return render(
    <ContextualHelpProvider pageContext="website-review-detail">
      <WebsiteSetupPanel
        projectId="project-1"
        reviewId="review-1"
        startingUrl="https://example.com/start"
        allowedOrigins={["https://example.com"]}
        publicKey={KEY}
        isEnabled
        verifiedAt={null}
        lastSeenAt={null}
        installSnippet={SNIPPET}
        embedConfigured
        {...overrides}
      />
      <HelpDrawer />
    </ContextualHelpProvider>,
  );
}

describe("WebsiteSetupPanel", () => {
  beforeEach(() => {
    checkWebsiteInstallationAction.mockReset();
    setWebsiteInstallationEnabledAction.mockReset();
    analyzeWebsiteAction.mockReset();
    loadWebsiteAnalysisAction.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    toastMessage.mockReset();
    loadWebsiteAnalysisAction.mockResolvedValue({ status: "success" });
  });

  it("copies install code and announces success", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });
    await user.click(
      within(dialog).getByRole("button", { name: "Copy install code" }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByText("Install code copied."),
      ).toBeInTheDocument();
    });
    await expect(navigator.clipboard.readText()).resolves.toBe(SNIPPET);
    expect(SNIPPET).not.toMatch(/passoff-prototype-m0/);
  });

  it("falls back when clipboard access is unavailable", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });

    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: execCommand,
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      get() {
        return undefined;
      },
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Copy install code" }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByText("Install code copied."),
      ).toBeInTheDocument();
    });
    expect(
      within(dialog).getByText(/select the install code above/i),
    ).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("checks installation and announces not detected guidance", async () => {
    checkWebsiteInstallationAction.mockResolvedValue({
      status: "success",
      installation: {
        id: "inst-1",
        reviewId: "review-1",
        publicKey: KEY,
        startingUrl: "https://example.com/start",
        allowedOrigins: ["https://example.com"],
        isEnabled: true,
        verifiedAt: null,
        lastSeenAt: null,
        status: "not_detected",
        installSnippet: SNIPPET,
        embedConfigured: true,
      },
    });
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });
    await user.click(
      within(dialog).getByRole("button", { name: "Check installation" }),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "We haven’t detected Passoff on this website yet. Open the live site, then check again.",
      );
    });
    expect(checkWebsiteInstallationAction).toHaveBeenCalled();
  });

  it("calls out installed status on the review card", () => {
    const detectedAt = new Date("2026-10-04T18:00:00.000Z");
    renderPanel({
      verifiedAt: detectedAt.toISOString(),
      lastSeenAt: detectedAt.toISOString(),
    });

    expect(
      screen.getByRole("heading", { name: "Website setup" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(
      screen.queryByText(/Passoff is live on this website/i),
    ).not.toBeInTheDocument();
  });

  it("toasts success when installation is detected", async () => {
    const detectedAt = new Date("2026-10-04T18:00:00.000Z");
    checkWebsiteInstallationAction.mockResolvedValue({
      status: "success",
      installation: {
        id: "inst-1",
        reviewId: "review-1",
        publicKey: KEY,
        startingUrl: "https://example.com/start",
        allowedOrigins: ["https://example.com"],
        isEnabled: true,
        verifiedAt: detectedAt,
        lastSeenAt: detectedAt,
        status: "installed",
        installSnippet: SNIPPET,
        embedConfigured: true,
      },
    });
    const user = userEvent.setup();
    renderPanel({
      verifiedAt: detectedAt.toISOString(),
      lastSeenAt: detectedAt.toISOString(),
    });

    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });
    await user.click(
      within(dialog).getByRole("button", { name: "Check installation" }),
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/^Passoff is installed on this website\./),
      );
    });
  });

  it("analyzes the website and keeps the trusted install snippet", async () => {
    analyzeWebsiteAction.mockResolvedValue({
      status: "success",
      analysis: {
        id: "analysis-1",
        status: "succeeded",
        source: "openai",
        cached: false,
        tailoredAvailable: true,
        modelId: "test-model",
        message: null,
        completedAt: new Date().toISOString(),
        evidenceSummary: null,
        result: {
          detectedPlatform: "nextjs",
          confidence: "high",
          evidence: ["Next.js markers were present."],
          recommendedMethod: "nextjs_script",
          steps: ["Open the root layout file for the Next.js app."],
          placement: "Add Passoff in the root layout with next/script.",
          verificationSteps: ["Return to Passoff and choose Check installation."],
          cautions: ["Passoff may need to be added to your Content Security Policy."],
          requiresDeveloper: true,
          alternateMethods: ["generic_html_body"],
          existingInstallationDetected: false,
          needsClarification: false,
          clarificationQuestion: null,
        },
      },
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });
    await user.click(
      within(dialog).getByRole("button", { name: "Analyze website" }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getAllByText(/signs that this site uses Next\.js/i)
          .length,
      ).toBeGreaterThan(0);
    });
    expect(within(dialog).getByText(/Strong match/i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("status", {
        name: /Update your content security policy/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByText(
        /Passoff may need to be added to your Content Security Policy/i,
      ).length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByText(SNIPPET)).toBeInTheDocument();
    expect(analyzeWebsiteAction).toHaveBeenCalledWith({
      projectId: "project-1",
      reviewId: "review-1",
      force: false,
      manualPlatform: undefined,
    });
  });

  it("supports keyboard operation of analyze and copy actions", async () => {
    analyzeWebsiteAction.mockResolvedValue({
      status: "success",
      analysis: {
        id: "analysis-2",
        status: "fallback",
        source: "deterministic",
        cached: false,
        tailoredAvailable: false,
        modelId: null,
        message: "Tailored guidance is temporarily unavailable.",
        completedAt: new Date().toISOString(),
        evidenceSummary: null,
        result: {
          detectedPlatform: "generic_html",
          confidence: "low",
          evidence: ["This looks like a custom site."],
          recommendedMethod: "generic_html_body",
          steps: ["Paste the install code before the closing body tag."],
          placement: "Before closing body tag",
          verificationSteps: ["Check installation."],
          cautions: [],
          requiresDeveloper: false,
          alternateMethods: ["gtm_custom_html"],
          existingInstallationDetected: false,
          needsClarification: true,
          clarificationQuestion: "Which platform do you use?",
        },
      },
    });

    const user = userEvent.setup();
    renderPanel();

    const open = screen.getByRole("button", { name: "Website setup" });
    open.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Website setup" });

    const analyze = within(dialog).getByRole("button", {
      name: "Analyze website",
    });
    analyze.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        within(dialog).getAllByText(/custom site/i).length,
      ).toBeGreaterThan(0);
    });

    const copy = within(dialog).getByRole("button", {
      name: "Copy install code",
    });
    copy.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        within(dialog).getByText("Install code copied."),
      ).toBeInTheDocument();
    });
  });

  it("confirms disable and can re-enable", async () => {
    setWebsiteInstallationEnabledAction
      .mockResolvedValueOnce({
        status: "success",
        message: "Passoff is disabled for this website.",
        installation: {
          id: "inst-1",
          reviewId: "review-1",
          publicKey: KEY,
          startingUrl: "https://example.com/start",
          allowedOrigins: ["https://example.com"],
          isEnabled: false,
          verifiedAt: null,
          lastSeenAt: null,
          status: "disabled",
          installSnippet: SNIPPET,
          embedConfigured: true,
        },
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "Passoff is enabled for this website.",
        installation: {
          id: "inst-1",
          reviewId: "review-1",
          publicKey: KEY,
          startingUrl: "https://example.com/start",
          allowedOrigins: ["https://example.com"],
          isEnabled: true,
          verifiedAt: null,
          lastSeenAt: null,
          status: "not_detected",
          installSnippet: SNIPPET,
          embedConfigured: true,
        },
      });

    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });
    await user.click(
      within(dialog).getByRole("button", { name: "Disable Passoff" }),
    );
    const confirm = screen.getByRole("alertdialog");
    await user.click(
      within(confirm).getByRole("button", { name: "Disable Passoff" }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Enable Passoff" }),
      ).toBeInTheDocument();
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Enable Passoff" }),
    );
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Disable Passoff" }),
      ).toBeInTheDocument();
    });
  });

  it("opens installation help from the setup dialog", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const dialog = screen.getByRole("dialog", { name: "Website setup" });
    await user.click(
      within(dialog).getByRole("button", { name: "Open installation help" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Installing Passoff on a website" }),
    ).toBeInTheDocument();
  });

  it("has no serious automated accessibility violations", async () => {
    const { container } = renderPanel({
      verifiedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Website setup" }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
