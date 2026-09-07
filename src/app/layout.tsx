import type { Metadata } from "next";
import { Figtree, Manrope } from "next/font/google";

import { ToastViewport } from "@/components/ui/toast";
import { getSiteUrl, siteConfig } from "@/lib/site";

import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteConfig.productName} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.productName,
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: siteConfig.name,
    title: `${siteConfig.productName} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [{ url: "/brand/passoff-mark.png", width: 512, height: 512, alt: "Pass-Off mark" }],
  },
  twitter: {
    card: "summary",
    title: `${siteConfig.productName} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: ["/brand/passoff-mark.png"],
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-figtree)]">
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
