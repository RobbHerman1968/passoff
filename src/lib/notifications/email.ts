import { sendEmail } from "@/lib/email";
import {
  notificationCopy,
  type NotificationPayload,
  type NotificationType,
} from "@/lib/notifications/types";
import { absoluteUrl } from "@/lib/site";

export function buildNotificationEmail(input: {
  type: NotificationType;
  data: NotificationPayload;
  hrefPath: string;
}): { subject: string; text: string; html: string } {
  const copy = notificationCopy(input.type, input.data, input.hrefPath);
  const actionUrl = absoluteUrl(input.hrefPath);
  const lines = [
    copy.title,
    "",
    copy.description,
    input.data.workspaceName ? `Workspace: ${input.data.workspaceName}` : "",
    input.data.projectName ? `Project: ${input.data.projectName}` : "",
    input.data.reviewName ? `Review: ${input.data.reviewName}` : "",
    typeof input.data.issueNumber === "number"
      ? `Issue: #${input.data.issueNumber}`
      : "",
    "",
    `${copy.action.label}: ${actionUrl}`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>${escapeHtml(copy.title)}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f4f5;color:#18181b;font-family:Georgia, 'Times New Roman', serif;">
  <div style="max-width:32rem;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
    <p style="margin:0 0 12px;font-size:18px;line-height:1.4;">${escapeHtml(copy.title)}</p>
    <p style="margin:0 0 16px;color:#52525b;font-size:15px;">${escapeHtml(copy.description)}</p>
    <p style="margin:0 0 8px;color:#52525b;font-size:14px;">${escapeHtml(input.data.workspaceName)}</p>
    <p style="margin:0 0 20px;color:#52525b;font-size:14px;">${escapeHtml(
      [input.data.projectName, input.data.reviewName].filter(Boolean).join(" · "),
    )}</p>
    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 16px;background:#18181b;color:#fafafa;text-decoration:none;border-radius:8px;font-size:14px;">${escapeHtml(copy.action.label)}</a>
  </div>
</body>
</html>`;

  return {
    subject: copy.title,
    text: lines.join("\n"),
    html,
  };
}

export async function sendNotificationEmail(input: {
  to: string;
  type: NotificationType;
  data: NotificationPayload;
  hrefPath: string;
}): Promise<void> {
  const message = buildNotificationEmail(input);
  await sendEmail({
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
