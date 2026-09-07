import "server-only";

import type { OutboxType } from "@/lib/rooms/outbox";
import { getSiteUrl } from "@/lib/site";
import { logInfo, logWarn } from "@/lib/logging";

type EmailPayload = {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  idempotencyKey?: string;
  [key: string]: unknown;
};

export type EmailSendResult =
  | { ok: true; id?: string }
  | { skipped: true; reason: "no_recipient" | "email_unconfigured" | "no_resend_key" };

function absoluteUrl(pathOrUrl: unknown) {
  if (typeof pathOrUrl !== "string" || !pathOrUrl.trim()) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getSiteUrl();
  return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function defaultCopy(type: OutboxType, payload: EmailPayload) {
  const projectName = String(payload.projectName || "your approval room");
  const clientName = String(payload.clientName || payload.reviewerName || "A client");
  const ownerUrl = absoluteUrl(payload.ownerUrl || payload.roomUrl || "/dashboard");
  const shareUrl = absoluteUrl(payload.shareUrl);

  switch (type) {
    case "email.share":
      return {
        subject: payload.subject || `Please review ${projectName} on Pass-Off`,
        text:
          payload.text ||
          `You have been invited to review “${projectName}”.\n\nOpen the review link:\n${shareUrl}\n\nIdentify yourself with your name and email to leave feedback or approve.`,
      };
    case "email.comment":
      return {
        subject: payload.subject || `New comment on ${projectName}`,
        text:
          payload.text ||
          `${clientName} commented on “${projectName}”:\n\n${payload.body || ""}\n\nOpen the approval room:\n${ownerUrl}`,
      };
    case "email.changes_requested":
      return {
        subject: payload.subject || `Changes requested on ${projectName}`,
        text:
          payload.text ||
          `${clientName} requested changes on “${projectName}”.\n\nOpen the approval room to review feedback and publish a new revision:\n${ownerUrl}`,
      };
    case "email.approval":
      return {
        subject: payload.subject || `${projectName} was approved`,
        text:
          payload.text ||
          `${clientName} approved “${projectName}” (revision digest ${payload.contentDigest || "n/a"}).\n\nRelease handoff files from the approval room:\n${ownerUrl}`,
      };
    case "email.receipt":
      return {
        subject: payload.subject || `Your approval of ${projectName} was recorded`,
        text:
          payload.text ||
          `Thanks — your approval of “${projectName}” was recorded.\n\nRevision digest: ${payload.contentDigest || ""}\n\nYou can return to the same review link for handoff files once they are released.`,
      };
    case "email.password_reset":
      return {
        subject: payload.subject || "Reset your Pass-Off password",
        text:
          payload.text ||
          `Reset your Pass-Off password using this link (expires in one hour):\n\n${absoluteUrl(payload.resetUrl)}\n\nIf you did not request this, you can ignore this email.`,
      };
    default:
      return {
        subject: payload.subject || "Pass-Off notification",
        text: payload.text || "You have a new Pass-Off notification.",
      };
  }
}

/** Sends via Resend when configured. Never reports success when email is unconfigured. */
export async function sendTransactionalEmail(
  type: OutboxType,
  payload: EmailPayload,
): Promise<EmailSendResult> {
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  if (!to) {
    logWarn("email.skip_no_recipient", { type });
    return { skipped: true, reason: "no_recipient" };
  }

  const copy = defaultCopy(type, payload);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Pass-Off <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL === "1") {
      logWarn("email.unconfigured", { type });
      return { skipped: true, reason: "email_unconfigured" };
    }
    logInfo("email.dev_log", { type, to, subject: copy.subject });
    return { skipped: true, reason: "no_resend_key" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(payload.idempotencyKey
        ? { "Idempotency-Key": String(payload.idempotencyKey).slice(0, 256) }
        : {}),
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: copy.subject,
      text: copy.text,
      html: typeof payload.html === "string" ? payload.html : undefined,
      reply_to: typeof payload.replyTo === "string" ? payload.replyTo : undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json().catch(() => ({}))) as { id?: string };
  logInfo("email.sent", { type, id: body.id });
  return { ok: true, id: body.id };
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
