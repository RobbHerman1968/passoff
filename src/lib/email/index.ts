import "server-only";

import { createResendEmailTransport } from "@/lib/email/resend-transport";
import { getTestEmailTransport } from "@/lib/email/test-transport";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Provider-neutral email boundary.
 *
 * Transports:
 * - `test`: in-memory capture for automated tests
 * - `none`: no-op for local UI work without sending
 * - `resend`: production delivery through Resend
 *
 * Production must set EMAIL_TRANSPORT=resend plus RESEND_API_KEY and EMAIL_FROM.
 * Automated tests always use the in-memory transport, even if EMAIL_TRANSPORT is set.
 */
class NoopEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<void> {
    void message;
  }
}

let overrideTransport: EmailTransport | null = null;

export function setEmailTransportForTests(transport: EmailTransport | null) {
  overrideTransport = transport;
}

function resolveTransport(): EmailTransport {
  if (overrideTransport) {
    return overrideTransport;
  }

  const mode = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();

  if (process.env.NODE_ENV === "test") {
    return getTestEmailTransport();
  }

  if (mode === "test") {
    // The in-memory mailbox would silently swallow real invitations and password
    // resets. Refuse it on a production build rather than lose customer email.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "EMAIL_TRANSPORT=test is not allowed in production. Use 'resend'.",
      );
    }
    return getTestEmailTransport();
  }

  if (mode === "resend") {
    return createResendEmailTransport();
  }

  if (mode === "none" || !mode) {
    return new NoopEmailTransport();
  }

  throw new Error(
    "EMAIL_TRANSPORT is set to an unsupported value. Use 'resend', 'test', or 'none'.",
  );
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await resolveTransport().send(message);
}

export async function sendPasswordResetEmail(options: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  // Never log options.resetUrl.
  await sendEmail({
    to: options.to,
    subject: "Reset your Passoff password",
    text: [
      "Reset your Passoff password using the link below.",
      "",
      "This link expires in 60 minutes and can only be used once.",
      "",
      options.resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
  });
}

export async function sendWorkspaceInvitationEmail(options: {
  to: string;
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}): Promise<void> {
  // Never log options.acceptUrl. It is a private link for one person.
  await sendEmail({
    to: options.to,
    subject: `${options.inviterName} invited you to ${options.workspaceName} on Passoff`,
    text: [
      `${options.inviterName} invited you to join ${options.workspaceName} on Passoff.`,
      "",
      "Passoff is where your team collects website feedback and signs off on fixes.",
      "",
      `Join the workspace: ${options.acceptUrl}`,
      "",
      `This invitation is for ${options.to} and expires in ${options.expiresInDays} days.`,
      "If you weren’t expecting it, you can ignore this email.",
    ].join("\n"),
  });
}

export type { EmailMessage, EmailTransport };
