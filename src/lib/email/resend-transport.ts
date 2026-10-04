import { Resend } from "resend";

import type { EmailMessage, EmailTransport } from "@/lib/email/types";

type ResendSendResult = {
  data: { id: string } | null;
  error: { message: string; name: string } | null;
};

export type ResendClient = {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
    }): Promise<ResendSendResult>;
  };
};

export class ResendEmailTransport implements EmailTransport {
  constructor(
    private readonly client: ResendClient,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (error) {
      throw new Error("Email delivery failed.");
    }
  }
}

export function createResendEmailTransport(
  env: Record<string, string | undefined> = process.env,
): EmailTransport {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error(
      "EMAIL_TRANSPORT=resend requires RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  return new ResendEmailTransport(new Resend(apiKey), from);
}
