export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailTransport = {
  send(message: EmailMessage): Promise<void>;
};
