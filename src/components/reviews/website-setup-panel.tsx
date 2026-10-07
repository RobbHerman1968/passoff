"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  analyzeWebsiteAction,
  checkWebsiteInstallationAction,
  loadWebsiteAnalysisAction,
  setWebsiteInstallationEnabledAction,
} from "@/app/(app)/projects/actions";
import { saveVerificationHooksAction } from "@/app/(app)/projects/verification-actions";
import { HelpTopicButton } from "@/components/help/help-topic-button";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/status-badge";
import {
  formatDetectedAt,
  installationStatusLabel,
  installationStatusTone,
  resolveInstallationStatus,
  type InstallationStatus,
} from "@/lib/installations/status";
import {
  analysisHeadline,
  confidenceLabel,
  recommendedMethodLabel,
} from "@/lib/website-analysis/copy";
import { isCspCaution } from "@/lib/website-analysis/cautions";
import { MANUAL_PLATFORM_OPTIONS } from "@/lib/website-analysis/templates";
import type { WebsiteAnalysisPublic } from "@/lib/website-analysis/types";
import type { WebsiteAnalysisResult } from "@/lib/website-analysis/schema";

function cspUpdateGuidance(
  analysis: WebsiteAnalysisPublic | null,
  result: WebsiteAnalysisResult | null,
): string | null {
  if (!result && !analysis?.evidenceSummary) return null;

  const fromStep = result?.steps.find((step) => isCspCaution(step));
  if (fromStep) return fromStep;

  const fromCaution = result?.cautions.find((item) => isCspCaution(item));
  if (fromCaution) return fromCaution;

  const fromWarning = analysis?.evidenceSummary?.warnings.find((item) =>
    isCspCaution(item),
  );
  if (fromWarning) return fromWarning;

  if (analysis?.evidenceSummary?.restrictsThirdPartyScripts) {
    return "Update your website’s content security policy (CSP): add the Passoff script host to the script-src directive so the browser can load Passoff.";
  }

  return null;
}

export type WebsiteSetupPanelProps = {
  projectId: string;
  reviewId: string;
  startingUrl: string;
  allowedOrigins: string[];
  publicKey: string;
  isEnabled: boolean;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  installSnippet: string | null;
  embedConfigured: boolean;
  verificationHookAllowlist?: string[];
  disabled?: boolean;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function copyText(value: string): Promise<"copied" | "fallback" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return "copied";
    } catch {
      // fall through to selection fallback
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok ? "fallback" : "failed";
  } catch {
    return "failed";
  }
}

export function WebsiteSetupPanel({
  projectId,
  reviewId,
  startingUrl,
  allowedOrigins,
  publicKey,
  isEnabled,
  verifiedAt,
  lastSeenAt,
  installSnippet,
  embedConfigured,
  verificationHookAllowlist = [],
  disabled = false,
}: WebsiteSetupPanelProps) {
  const router = useRouter();
  const codeId = useId();
  const statusId = useId();
  const liveId = useId();
  const analysisLiveId = useId();
  const platformSelectId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const analyzeButtonRef = useRef<HTMLButtonElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hookNames, setHookNames] = useState(verificationHookAllowlist.join("\n"));
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<WebsiteAnalysisPublic | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [manualPlatform, setManualPlatform] = useState<string>("");
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [announcement, setAnnouncement] = useState("");
  const [analysisAnnouncement, setAnalysisAnnouncement] = useState("");
  const [copyFallbackVisible, setCopyFallbackVisible] = useState(false);
  const serverSnapshot = `${isEnabled}|${verifiedAt}|${lastSeenAt}|${installSnippet ?? ""}`;
  const [syncedSnapshot, setSyncedSnapshot] = useState(serverSnapshot);
  const [localEnabled, setLocalEnabled] = useState(isEnabled);
  const [localVerifiedAt, setLocalVerifiedAt] = useState(verifiedAt);
  const [localLastSeenAt, setLocalLastSeenAt] = useState(lastSeenAt);
  const [localSnippet, setLocalSnippet] = useState(installSnippet);

  if (serverSnapshot !== syncedSnapshot) {
    setSyncedSnapshot(serverSnapshot);
    setLocalEnabled(isEnabled);
    setLocalVerifiedAt(verifiedAt);
    setLocalLastSeenAt(lastSeenAt);
    setLocalSnippet(installSnippet);
  }

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    let cancelled = false;
    void (async () => {
      const result = await loadWebsiteAnalysisAction({ projectId, reviewId });
      if (cancelled) return;
      if (result.status === "success" && result.analysis) {
        setAnalysis(result.analysis);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, projectId, reviewId]);

  const status: InstallationStatus = resolveInstallationStatus({
    isEnabled: localEnabled,
    verifiedAt: toDate(localVerifiedAt),
    lastSeenAt: toDate(localLastSeenAt),
    allowedOrigins,
    checking,
  });
  const statusLabel = installationStatusLabel(status);
  const detectedLabel = formatDetectedAt(toDate(localLastSeenAt ?? localVerifiedAt));
  const allowedOrigin = allowedOrigins[0] ?? "Not set";
  const result = analysis?.result ?? null;
  const cspGuidance = cspUpdateGuidance(analysis, result);

  const applyInstallation = (installation: {
    isEnabled: boolean;
    verifiedAt: Date | string | null;
    lastSeenAt: Date | string | null;
    installSnippet: string | null;
  }) => {
    setLocalEnabled(installation.isEnabled);
    setLocalVerifiedAt(
      installation.verifiedAt
        ? new Date(installation.verifiedAt).toISOString()
        : null,
    );
    setLocalLastSeenAt(
      installation.lastSeenAt
        ? new Date(installation.lastSeenAt).toISOString()
        : null,
    );
    setLocalSnippet(installation.installSnippet);
  };

  const handleCopy = async () => {
    if (!localSnippet) {
      setAnnouncement("Install code isn’t available yet.");
      return;
    }
    const copyResult = await copyText(localSnippet);
    if (copyResult === "copied" || copyResult === "fallback") {
      setAnnouncement("Install code copied.");
      setCopyFallbackVisible(copyResult === "fallback");
    } else {
      setAnnouncement(
        "We couldn’t copy automatically. Select the install code and copy it manually.",
      );
      setCopyFallbackVisible(true);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setAnnouncement("Checking installation.");
    try {
      const checkResult = await checkWebsiteInstallationAction({
        projectId,
        reviewId,
      });
      if (checkResult.installation) {
        applyInstallation(checkResult.installation);
        const next = resolveInstallationStatus({
          isEnabled: checkResult.installation.isEnabled,
          verifiedAt: checkResult.installation.verifiedAt,
          lastSeenAt: checkResult.installation.lastSeenAt,
          allowedOrigins: checkResult.installation.allowedOrigins,
        });
        if (next === "installed") {
          const when = formatDetectedAt(
            checkResult.installation.lastSeenAt ??
              checkResult.installation.verifiedAt,
          );
          const message = when
            ? `Passoff is installed on this website. Last detected ${when}.`
            : "Passoff is installed on this website.";
          setAnnouncement(message);
          toast.success(message);
        } else if (next === "disabled") {
          const message =
            "Passoff is installed, but it’s currently disabled for this website.";
          setAnnouncement(message);
          toast.message(message);
        } else if (next === "needs_attention") {
          const message =
            "Passoff may be partially set up. Open the website, then check again.";
          setAnnouncement(message);
          toast.error(message);
        } else {
          const message =
            "We haven’t detected Passoff on this website yet. Open the live site, then check again.";
          setAnnouncement(message);
          toast.error(message);
        }
      } else {
        const message =
          checkResult.message ??
          "We couldn’t check the installation right now. Try again.";
        setAnnouncement(message);
        toast.error(message);
      }
      router.refresh();
    } catch {
      const message =
        "We couldn’t check the installation right now. Try again.";
      setAnnouncement(message);
      toast.error(message);
    } finally {
      setChecking(false);
    }
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      const enableResult = await setWebsiteInstallationEnabledAction({
        projectId,
        reviewId,
        enabled: true,
      });
      if (enableResult.installation) {
        applyInstallation(enableResult.installation);
      }
      setAnnouncement(enableResult.message ?? "Passoff is enabled for this website.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDisableConfirm = async () => {
    setBusy(true);
    try {
      const disableResult = await setWebsiteInstallationEnabledAction({
        projectId,
        reviewId,
        enabled: false,
      });
      if (disableResult.installation) {
        applyInstallation(disableResult.installation);
      }
      setAnnouncement(disableResult.message ?? "Passoff is disabled for this website.");
      setDisableOpen(false);
      router.refresh();
      queueMicrotask(() => openButtonRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const runAnalysis = async (options?: {
    force?: boolean;
    manualPlatform?: string;
  }) => {
    if (offline) {
      setAnalysisError(
        "You’re offline. Reconnect to analyze this website, or choose a platform manually.",
      );
      setAnalysisAnnouncement("Website analysis unavailable while offline.");
      setShowPlatformPicker(true);
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisAnnouncement("Analyzing website.");
    try {
      const analysisResult = await analyzeWebsiteAction({
        projectId,
        reviewId,
        force: options?.force,
        manualPlatform: options?.manualPlatform,
      });

      if (analysisResult.status !== "success" || !analysisResult.analysis) {
        if (analysisResult.status === "forbidden") {
          setAnalysisError(
            analysisResult.message ??
              "You don’t have permission to analyze this website.",
          );
          setAnalysisAnnouncement("Permission denied for website analysis.");
        } else if (analysisResult.status === "rate_limited") {
          setAnalysisError(
            analysisResult.message ??
              "You’ve analyzed websites enough times for now. Try again later.",
          );
          setAnalysisAnnouncement("Website analysis rate limited.");
        } else if (analysisResult.status === "in_progress") {
          setAnalysisError(
            analysisResult.message ??
              "An analysis is already running. Wait a moment, then try again.",
          );
          setAnalysisAnnouncement("Website analysis already in progress.");
        } else {
          setAnalysisError(
            analysisResult.message ??
              "We couldn’t analyze this website right now. Try again.",
          );
          setAnalysisAnnouncement("Website analysis failed.");
          setShowPlatformPicker(true);
        }
        return;
      }

      setAnalysis(analysisResult.analysis);
      const next = analysisResult.analysis.result;
      if (next) {
        setAnalysisAnnouncement(analysisHeadline(next));
        if (
          next.needsClarification ||
          next.confidence === "low" ||
          analysisResult.analysis.status === "unreachable"
        ) {
          setShowPlatformPicker(true);
        }
      } else {
        setAnalysisAnnouncement(
          analysisResult.message ?? "Website analysis finished.",
        );
      }
      if (analysisResult.message) {
        setAnnouncement(analysisResult.message);
      }
    } finally {
      setAnalyzing(false);
      queueMicrotask(() => analyzeButtonRef.current?.focus());
    }
  };

  const handleManualPlatform = async () => {
    if (!manualPlatform) {
      setAnalysisError("Choose a platform from the list.");
      return;
    }
    await runAnalysis({ manualPlatform, force: true });
    setShowPlatformPicker(false);
  };

  return (
    <section
      id="website-setup"
      aria-labelledby="website-setup-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="grid gap-4">
        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="website-setup-heading" className="type-section-title">
              Website setup
            </h2>
            <StatusPill tone={installationStatusTone(status)}>
              {statusLabel}
            </StatusPill>
          </div>
          <p className="text-sm text-muted-foreground break-all">
            {startingUrl || "Website address unavailable"}
          </p>
        </div>
        <div className="grid gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                ref={openButtonRef}
                type="button"
                variant="default"
                className="min-h-11"
                disabled={disabled}
              >
                Website setup
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Website setup</DialogTitle>
                <DialogDescription>
                  Install Passoff on this website, confirm it was detected, and
                  turn it off if needed.
                </DialogDescription>
              </DialogHeader>

              <div className="grid min-w-0 gap-4">
                <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Website address</dt>
                    <dd className="break-all">{startingUrl || "Unavailable"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Allowed origin</dt>
                    <dd className="break-all">{allowedOrigin}</dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-muted-foreground">Installation status</dt>
                    <dd id={statusId} className="break-words">
                      <span className="font-medium">{statusLabel}</span>
                      {detectedLabel && status === "installed" ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · Last detected {detectedLabel}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>

                <section
                  aria-labelledby="install-guidance-heading"
                  className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="grid gap-1">
                    <h3
                      id="install-guidance-heading"
                      className="text-sm font-medium text-foreground"
                    >
                      Installation guidance
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Analyze the website for placement tips. The install code
                      below always comes from Passoff and is not rewritten by
                      analysis.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      ref={analyzeButtonRef}
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() =>
                        void runAnalysis({ force: Boolean(analysis) })
                      }
                      disabled={analyzing || busy || disabled}
                    >
                      {analyzing
                        ? "Analyzing…"
                        : analysis
                          ? "Analyze again"
                          : "Analyze website"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setShowPlatformPicker((value) => !value)}
                      disabled={analyzing || disabled}
                    >
                      Choose a different platform
                    </Button>
                  </div>

                  <p
                    id={analysisLiveId}
                    className="sr-only"
                    aria-live="polite"
                    role="status"
                  >
                    {analysisAnnouncement}
                  </p>

                  {analyzing ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Looking at the website for platform and installation
                      clues…
                    </p>
                  ) : null}

                  {offline ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      You’re offline. Reconnect to analyze, or choose a platform
                      manually.
                    </p>
                  ) : null}

                  {analysisError ? (
                    <div
                      className="rounded-lg border border-border bg-card p-3 text-sm"
                      role="alert"
                    >
                      <p className="font-medium text-foreground">
                        Analysis unavailable
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {analysisError}
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          className="min-h-11"
                          onClick={() => void runAnalysis({ force: true })}
                          disabled={analyzing || offline}
                        >
                          Try again
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {result ? (
                    <div className="grid min-w-0 gap-3 text-sm">
                      <div>
                        <p className="font-medium text-foreground">
                          {analysisHeadline(result)}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Confidence: {confidenceLabel(result.confidence)} (
                          {result.confidence})
                        </p>
                      </div>

                      {result.evidence.length ? (
                        <div>
                          <p className="font-medium text-foreground">
                            What we noticed
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                            {result.evidence.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div>
                        <p className="font-medium text-foreground">
                          Recommended method
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {recommendedMethodLabel(result)}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {result.placement}
                        </p>
                      </div>

                      {cspGuidance ? (
                        <div
                          className="rounded-lg border border-border bg-card p-3"
                          role="status"
                          aria-labelledby="csp-update-heading"
                        >
                          <p
                            id="csp-update-heading"
                            className="font-medium text-foreground"
                          >
                            Update your content security policy
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {cspGuidance}
                          </p>
                        </div>
                      ) : null}

                      <div>
                        <p className="font-medium text-foreground">
                          Installation steps
                        </p>
                        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                          {result.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      <div>
                        <p className="font-medium text-foreground">
                          After you install
                        </p>
                        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                          {result.verificationSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      {result.cautions.length ? (
                        <div>
                          <p className="font-medium text-foreground">
                            Things to watch for
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                            {result.cautions.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {result.existingInstallationDetected ? (
                        <p className="text-muted-foreground" role="status">
                          Passoff may already be present on this website.
                        </p>
                      ) : null}

                      {result.requiresDeveloper ? (
                        <p className="text-muted-foreground">
                          This method usually needs someone who can change the
                          site’s code or theme.
                        </p>
                      ) : null}

                      {analysis?.message ? (
                        <p className="text-muted-foreground" role="status">
                          {analysis.message}
                        </p>
                      ) : null}

                      {analysis?.cached ? (
                        <p className="text-muted-foreground" role="status">
                          Showing a recent analysis for this website. Choose
                          Analyze again for a fresh look.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {showPlatformPicker ? (
                    <div className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3">
                      <Label htmlFor={platformSelectId}>
                        Choose your platform
                      </Label>
                      <Select
                        value={manualPlatform || undefined}
                        onValueChange={setManualPlatform}
                      >
                        <SelectTrigger
                          id={platformSelectId}
                          className="min-h-11 w-full"
                          aria-label="Choose your platform"
                        >
                          <SelectValue placeholder="Select a platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {MANUAL_PLATFORM_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="min-h-11"
                        onClick={() => void handleManualPlatform()}
                        disabled={analyzing || !manualPlatform}
                      >
                        Use these installation steps
                      </Button>
                    </div>
                  ) : null}
                </section>

                {!embedConfigured || !localSnippet ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    Install code isn’t available because the embed host isn’t
                    configured yet. Ask your Passoff admin to set
                    PASSOFF_EMBED_BASE_URL.
                  </p>
                ) : (
                  <div className="grid min-w-0 gap-2">
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label
                        htmlFor={codeId}
                        className="text-sm font-medium text-foreground"
                      >
                        Install code
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => void handleCopy()}
                      >
                        Copy install code
                      </Button>
                    </div>
                    <pre
                      id={codeId}
                      tabIndex={0}
                      role="region"
                      aria-label="Passoff install JavaScript"
                      className="max-w-full min-w-0 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground"
                    >
                      <code className="block w-max max-w-none whitespace-pre">
                        {localSnippet}
                      </code>
                    </pre>
                    {copyFallbackVisible ? (
                      <p className="text-sm text-muted-foreground">
                        You can also select the install code above and copy it
                        manually.
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      This public installation key identifies this review only:{" "}
                      <span className="break-all font-medium text-foreground">
                        {publicKey}
                      </span>
                      . It is not a password or reusable secret.
                    </p>
                  </div>
                )}

                {status === "not_detected" || status === "needs_attention" ? (
                  <div
                    className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
                    role="status"
                  >
                    <p>
                      We haven’t detected Passoff on this website yet.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                      <li>Copy the install code and add it to the website.</li>
                      <li>Open installation help if you need placement tips.</li>
                      <li>Check again after the page is deployed.</li>
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="verification-hooks">Named checks this website may run</Label>
                  <Textarea
                    id="verification-hooks"
                    value={hookNames}
                    onChange={(event) => setHookNames(event.target.value)}
                    disabled={disabled || busy}
                    rows={3}
                    placeholder="checkout-ready"
                  />
                  <p className="text-sm text-muted-foreground">
                    List lowercase names your website registers, one per line. Passoff never runs
                    code you type here.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-fit"
                    disabled={disabled || busy}
                    onClick={async () => {
                      setBusy(true);
                      const result = await saveVerificationHooksAction({
                        projectId,
                        reviewId,
                        namesText: hookNames,
                      });
                      setBusy(false);
                      if (!result.ok) {
                        toast.error(result.message);
                        return;
                      }
                      setHookNames(result.names.join("\n"));
                      toast.success("Named checks saved.");
                      router.refresh();
                    }}
                  >
                    Save named checks
                  </Button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => void handleCheck()}
                    disabled={checking || busy || disabled}
                  >
                    {checking ? "Checking…" : "Check installation"}
                  </Button>
                  {localEnabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setDisableOpen(true)}
                      disabled={busy || disabled}
                    >
                      Disable Passoff
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => void handleEnable()}
                      disabled={busy || disabled}
                    >
                      Enable Passoff
                    </Button>
                  )}
                  <HelpTopicButton topicId="website-setup">
                    Open installation help
                  </HelpTopicButton>
                </div>

                <p id={liveId} className="sr-only" aria-live="polite" role="status">
                  {announcement}
                </p>
              </div>
            </DialogContent>
          </Dialog>
          <HelpTopicButton topicId="website-setup">
            Learn about website setup
          </HelpTopicButton>
        </div>
      </div>

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Passoff on this website?</AlertDialogTitle>
            <AlertDialogDescription>
              Review controls will stop appearing on this website. The install
              script can stay in place and will not break the site. You can
              enable Passoff again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep enabled</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                void handleDisableConfirm();
              }}
            >
              Disable Passoff
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
