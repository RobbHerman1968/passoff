import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0d14] p-4 text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#1a1625] px-6 py-10 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
          <BrandMark size={28} />
          Pass-Off
        </Link>
        <h1 className="mt-8 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.05em]">
          Choose a new password
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          Set a new password for your Pass-Off Approval Rooms account.
        </p>
        <div className="mt-8">
          <ResetPasswordForm token={token} />
        </div>
      </div>
    </main>
  );
}
