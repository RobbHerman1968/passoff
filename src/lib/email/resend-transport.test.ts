import { describe, expect, it, vi } from "vitest";

import {
  createResendEmailTransport,
  ResendEmailTransport,
  type ResendClient,
} from "@/lib/email/resend-transport";

function createClient(result: {
  data?: { id: string } | null;
  error?: { message: string; name: string } | null;
}): ResendClient {
  return {
    emails: {
      send: vi.fn().mockResolvedValue({
        data: result.data ?? { id: "email_1" },
        error: result.error ?? null,
      }),
    },
  };
}

describe("Resend email transport", () => {
  it("requires an API key and from address", () => {
    expect(() => createResendEmailTransport({})).toThrow(
      /RESEND_API_KEY and EMAIL_FROM/,
    );
    expect(() =>
      createResendEmailTransport({ RESEND_API_KEY: "re_test" }),
    ).toThrow(/RESEND_API_KEY and EMAIL_FROM/);
  });

  it("sends text mail through Resend", async () => {
    const client = createClient({});
    const transport = new ResendEmailTransport(
      client,
      "Passoff <noreply@passoff.test>",
    );

    await transport.send({
      to: "ada@example.com",
      subject: "Reset your Passoff password",
      text: "https://passoff.test/reset-password?token=abc",
    });

    expect(client.emails.send).toHaveBeenCalledWith({
      from: "Passoff <noreply@passoff.test>",
      to: "ada@example.com",
      subject: "Reset your Passoff password",
      text: "https://passoff.test/reset-password?token=abc",
      html: undefined,
    });
  });

  it("throws when Resend reports an error", async () => {
    const transport = new ResendEmailTransport(
      createClient({
        data: null,
        error: { name: "validation_error", message: "Invalid from address" },
      }),
      "Passoff <noreply@passoff.test>",
    );

    await expect(
      transport.send({
        to: "ada@example.com",
        subject: "Hello",
        text: "Hello",
      }),
    ).rejects.toThrow("Email delivery failed.");
  });
});
