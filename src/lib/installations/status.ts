export type InstallationStatus =
  | "not_detected"
  | "checking"
  | "installed"
  | "disabled"
  | "needs_attention";

export type InstallationStatusInput = {
  isEnabled: boolean;
  verifiedAt: Date | null;
  lastSeenAt: Date | null;
  allowedOrigins: string[];
  checking?: boolean;
};

export function resolveInstallationStatus(
  input: InstallationStatusInput,
): InstallationStatus {
  if (input.checking) {
    return "checking";
  }

  if (!input.isEnabled) {
    return "disabled";
  }

  if (!input.allowedOrigins.length) {
    return "needs_attention";
  }

  if (input.verifiedAt && input.lastSeenAt) {
    return "installed";
  }

  if (input.verifiedAt && !input.lastSeenAt) {
    return "needs_attention";
  }

  return "not_detected";
}

export function installationStatusLabel(status: InstallationStatus): string {
  switch (status) {
    case "not_detected":
      return "Not detected";
    case "checking":
      return "Checking";
    case "installed":
      return "Installed";
    case "disabled":
      return "Disabled";
    case "needs_attention":
      return "Needs attention";
  }
}

/** Matches StatusPill tones without importing UI components into this lib module. */
export type InstallationStatusTone =
  | "open"
  | "in-progress"
  | "ready"
  | "positive"
  | "neutral"
  | "muted";

export function installationStatusTone(
  status: InstallationStatus,
): InstallationStatusTone {
  switch (status) {
    case "installed":
      return "positive";
    case "checking":
      return "in-progress";
    case "needs_attention":
      return "ready";
    case "disabled":
      return "muted";
    case "not_detected":
      return "open";
  }
}

export function formatDetectedAt(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
