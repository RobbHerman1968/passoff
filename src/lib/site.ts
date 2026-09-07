export const siteConfig = {
  name: "Pass-Off",
  productName: "Pass-Off Approval Rooms",
  tagline: "Get client sign-off on the exact design revision.",
  description:
    "Share one review link, collect visual feedback, record approval, and deliver final files without losing track of what was approved.",
  keywords: [
    "design approval",
    "client design approval",
    "approval room",
    "design revision approval",
    "client review link",
    "design handoff files",
    "Pass-Off",
    "Pass-Off Approval Rooms",
  ],
} as const;

/** Canonical production URL for emails, Stripe redirects, OAuth, review links, sitemap. */
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
