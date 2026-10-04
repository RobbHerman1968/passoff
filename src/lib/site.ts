export const siteConfig = {
  name: "Passoff",
  tagline: "Good work deserves a clean pass.",
  description:
    "Review real websites and videos, collect clear feedback, and get a confident yes—all without the usual screenshot scavenger hunt.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://passoff.app",
} as const;

export const authRoutes = {
  signIn: "/sign-in",
  signUp: "/sign-up",
} as const;

export const publicNavItems = [
  { href: "/website-feedback-tool", label: "Websites" },
  { href: "/video-review-software", label: "Video" },
  { href: "/client-approval-software", label: "Approval" },
  { href: "/review-tool-for-agencies", label: "Agencies" },
  { href: "/pricing", label: "Pricing" },
  { href: "/alternatives", label: "Compare" },
] as const;

export const publicFooterGroups = [
  {
    title: "Product",
    items: [
      { href: "/website-feedback-tool", label: "Website feedback" },
      { href: "/video-review-software", label: "Video review" },
      { href: "/client-approval-software", label: "Client approval" },
    ],
  },
  {
    title: "Choosing Passoff",
    items: [
      { href: "/review-tool-for-agencies", label: "Agencies" },
      { href: "/pricing", label: "Pricing" },
      { href: "/alternatives", label: "Compare" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: authRoutes.signIn, label: "Sign in" },
      { href: authRoutes.signUp, label: "Create an account" },
    ],
  },
] as const;

export function absoluteUrl(path = "/") {
  return new URL(path, siteConfig.url).toString();
}
