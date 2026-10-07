import type { PrototypeAnchor, ScreenshotResult } from "./types";

export type SdkRemoteIssue = {
  id: string;
  number: number;
  status: string;
  statusLabel: string;
  summary: string;
  marker: {
    normalizedX: number;
    normalizedY: number;
    stableElementId: string | null;
    approvedDataAttributes: Record<string, string>;
    cssSelector: string | null;
    ancestryFingerprint: string | null;
    elementTag: string | null;
    accessibleName: string | null;
    documentX: number | null;
    documentY: number | null;
  };
};

export type ExchangeSuccess = {
  ok: true;
  sessionToken: string;
  expiresAt: string;
  canComment: boolean;
  reviewerName: string;
  privateSelectors: string[];
};

export type ApiFailure = {
  ok: false;
  error?: string;
  message?: string;
  offline?: boolean;
};

function friendlyFromNetwork(): ApiFailure {
  return {
    ok: false,
    offline: typeof navigator !== "undefined" && navigator.onLine === false,
    message:
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You’re offline. Reconnect, then try again."
        : "Passoff couldn’t reach the server. Try again in a moment.",
  };
}

export async function exchangeSession(options: {
  apiBaseUrl: string;
  installationKey: string;
  exchangeCode: string;
}): Promise<ExchangeSuccess | ApiFailure> {
  try {
    const response = await fetch(
      `${options.apiBaseUrl}/api/sdk/v1/session/exchange`,
      {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          installationKey: options.installationKey,
          exchangeCode: options.exchangeCode,
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ExchangeSuccess
      | ApiFailure
      | null;
    if (!response.ok || !payload || !("sessionToken" in payload)) {
      return {
        ok: false,
        error: payload && "error" in payload ? payload.error : undefined,
        message:
          payload && "message" in payload && payload.message
            ? payload.message
            : mapExchangeError(
                payload && "error" in payload ? payload.error : undefined,
              ),
      };
    }
    return payload;
  } catch {
    return friendlyFromNetwork();
  }
}

function mapExchangeError(error?: string): string {
  switch (error) {
    case "expired":
      return "This review link has expired. Ask the team for a new link.";
    case "revoked":
      return "This review link was turned off. Ask the team for a new link.";
    case "origin":
      return "Passoff isn’t allowed on this website address.";
    case "closed":
      return "This review is closed, so feedback can’t be added.";
    case "archived":
      return "This review isn’t available anymore.";
    case "disabled":
      return "Passoff is turned off for this website.";
    default:
      return "Passoff couldn’t start this review. Open the review link again.";
  }
}

export async function fetchHeatmapIssues(options: {
  apiBaseUrl: string;
  sessionToken: string;
  pageUrl: string;
  show?: string;
  priority?: string;
  weighting?: string;
  version?: string;
}): Promise<
  | {
      ok: true;
      issues: import("./heatmap").HeatmapRemoteIssue[];
      weighting: "equal" | "priority";
      pageRoute?: string;
      environmentName?: string;
      versionLabel?: string;
    }
  | ApiFailure
> {
  try {
    const url = new URL(`${options.apiBaseUrl}/api/sdk/v1/heatmap`);
    url.searchParams.set("pageUrl", options.pageUrl);
    if (options.show) url.searchParams.set("show", options.show);
    if (options.priority) url.searchParams.set("priority", options.priority);
    if (options.weighting) url.searchParams.set("weighting", options.weighting);
    if (options.version) url.searchParams.set("version", options.version);
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.sessionToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      issues?: import("./heatmap").HeatmapRemoteIssue[];
      weighting?: "equal" | "priority";
      pageRoute?: string;
      environmentName?: string;
      versionLabel?: string;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.issues)) {
      return {
        ok: false,
        error: payload?.error,
        message: payload?.message ?? "Passoff couldn’t load the issue heatmap.",
      };
    }
    return {
      ok: true,
      issues: payload.issues,
      weighting: payload.weighting === "priority" ? "priority" : "equal",
      pageRoute: payload.pageRoute,
      environmentName: payload.environmentName,
      versionLabel: payload.versionLabel,
    };
  } catch {
    return friendlyFromNetwork();
  }
}

export async function fetchIssues(options: {
  apiBaseUrl: string;
  sessionToken: string;
  pageUrl: string;
}): Promise<{ ok: true; issues: SdkRemoteIssue[]; canComment: boolean } | ApiFailure> {
  try {
    const url = new URL(`${options.apiBaseUrl}/api/sdk/v1/issues`);
    url.searchParams.set("pageUrl", options.pageUrl);
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.sessionToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      issues?: SdkRemoteIssue[];
      canComment?: boolean;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.issues)) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ??
          "Passoff couldn’t load existing feedback for this page.",
      };
    }
    return {
      ok: true,
      issues: payload.issues,
      canComment: Boolean(payload.canComment),
    };
  } catch {
    return friendlyFromNetwork();
  }
}

export async function createIssue(options: {
  apiBaseUrl: string;
  sessionToken: string;
  body: string;
  pageUrl: string;
  anchor: PrototypeAnchor;
  screenshot: ScreenshotResult | null;
  idempotencyKey: string;
}): Promise<{ ok: true; issue: SdkRemoteIssue } | ApiFailure> {
  try {
    const response = await fetch(`${options.apiBaseUrl}/api/sdk/v1/issues`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${options.sessionToken}`,
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        body: options.body,
        pageUrl: options.pageUrl,
        anchor: options.anchor,
        screenshot: options.screenshot
          ? {
              status: options.screenshot.status,
              reason: options.screenshot.reason,
              dataUrl: options.screenshot.dataUrl,
              annotation: options.screenshot.annotation,
            }
          : undefined,
        idempotencyKey: options.idempotencyKey,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      issue?: SdkRemoteIssue;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok || !payload.issue) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ??
          "Passoff couldn’t save that feedback. Your text is still here — try again.",
      };
    }
    return { ok: true, issue: payload.issue };
  } catch {
    return friendlyFromNetwork();
  }
}

export type SdkIssueComment = {
  id: string;
  body: string;
  visibility: "public";
  authorDisplayName: string;
  authorKind: "member" | "guest";
  createdAt: string;
  mentions: Array<{ userId: string; displayName: string }>;
};

/** Load the public discussion for one issue. Private notes are never returned. */
export async function fetchIssueComments(options: {
  apiBaseUrl: string;
  sessionToken: string;
  issueNumber: number;
}): Promise<
  | { ok: true; comments: SdkIssueComment[]; canComment: boolean }
  | ApiFailure
> {
  try {
    const response = await fetch(
      `${options.apiBaseUrl}/api/sdk/v1/issues/${encodeURIComponent(
        String(options.issueNumber),
      )}/comments`,
      {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.sessionToken}`,
        },
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      comments?: SdkIssueComment[];
      canComment?: boolean;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.comments)) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ?? "Passoff couldn’t load the discussion. Try again.",
      };
    }
    return {
      ok: true,
      comments: payload.comments.filter((comment) => comment.visibility === "public"),
      canComment: Boolean(payload.canComment),
    };
  } catch {
    return friendlyFromNetwork();
  }
}

export async function createIssueComment(options: {
  apiBaseUrl: string;
  sessionToken: string;
  issueNumber: number;
  body: string;
}): Promise<{ ok: true; comment: SdkIssueComment } | ApiFailure> {
  try {
    const response = await fetch(
      `${options.apiBaseUrl}/api/sdk/v1/issues/${encodeURIComponent(
        String(options.issueNumber),
      )}/comments`,
      {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${options.sessionToken}`,
        },
        body: JSON.stringify({ body: options.body }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      comment?: SdkIssueComment;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok || !payload.comment) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ??
          "Passoff couldn’t save that reply. Your text is still here. Try again.",
      };
    }
    return { ok: true, comment: payload.comment };
  } catch {
    return friendlyFromNetwork();
  }
}

export type SdkApprovalBlockedReason =
  | "view_only"
  | "no_request"
  | "someone_else"
  | "already_decided";

export type SdkApproval = {
  visibleState: string;
  statusLabel: string;
  versionLabel: string;
  canDecide: boolean;
  blockedReason: SdkApprovalBlockedReason | null;
  /** Present only when this link can decide on the current version right now. */
  request: {
    id: string;
    deploymentId: string;
    versionLabel: string;
    requesterDisplayName: string;
    message: string | null;
  } | null;
};

export type SdkApprovalDecision = "approved" | "changes_requested";

/** Load approval status for this review link. `approval` is null when none applies. */
export async function fetchApprovalStatus(options: {
  apiBaseUrl: string;
  sessionToken: string;
}): Promise<{ ok: true; approval: SdkApproval | null } | ApiFailure> {
  try {
    const response = await fetch(`${options.apiBaseUrl}/api/sdk/v1/approvals/status`, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.sessionToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      approval?: SdkApproval | null;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ?? "Passoff couldn’t load the approval status. Try again.",
      };
    }
    const approval = payload.approval;
    // Ignore anything that doesn’t look like an approval so older servers stay harmless.
    if (!approval || typeof approval.statusLabel !== "string") {
      return { ok: true, approval: null };
    }
    return { ok: true, approval };
  } catch {
    return friendlyFromNetwork();
  }
}

/** Send the guest’s decision. A note is required when asking for changes. */
export async function decideApproval(options: {
  apiBaseUrl: string;
  sessionToken: string;
  decision: SdkApprovalDecision;
  note?: string;
  deploymentId?: string;
  requestId?: string;
}): Promise<{ ok: true; message: string } | ApiFailure> {
  try {
    const response = await fetch(`${options.apiBaseUrl}/api/sdk/v1/approvals/decide`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${options.sessionToken}`,
      },
      body: JSON.stringify({
        decision: options.decision,
        note: options.note || undefined,
        deploymentId: options.deploymentId,
        requestId: options.requestId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: payload?.error,
        message:
          payload?.message ??
          "Passoff couldn’t save your decision. Your note is still here. Try again.",
      };
    }
    return { ok: true, message: payload.message ?? "Thanks. Your decision is recorded." };
  } catch {
    return friendlyFromNetwork();
  }
}
