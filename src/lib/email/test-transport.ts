import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * In-memory transport for automated tests.
 * Never log message bodies that may contain reset URLs.
 */
export class TestEmailTransport implements EmailTransport {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push({
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  clear() {
    this.messages.length = 0;
  }

  findByRecipient(email: string): EmailMessage | undefined {
    return this.messages.find((message) => message.to === email);
  }

  /**
   * Extract a reset path from a stored message for tests only.
   * Production code must never surface raw reset URLs to the browser.
   */
  extractResetPath(email: string): string | null {
    const message = this.findByRecipient(email);
    if (!message) {
      return null;
    }

    const match = message.text.match(/\/reset-password\?token=[A-Za-z0-9_-]+/);
    return match?.[0] ?? null;
  }
}

const globalTestTransport = globalThis as unknown as {
  passoffTestEmailTransport?: TestEmailTransport;
};

export function getTestEmailTransport(): TestEmailTransport {
  if (!globalTestTransport.passoffTestEmailTransport) {
    globalTestTransport.passoffTestEmailTransport = new TestEmailTransport();
  }
  return globalTestTransport.passoffTestEmailTransport;
}
