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

  if (process.env.NODE_ENV === "test" || mode === "test") {
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

export type { EmailMessage, EmailTransport };
