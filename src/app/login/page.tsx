import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { auth } from "@/auth";
import { siteConfig } from "@/lib/site";

import { githubSignIn, googleSignIn } from "./actions";
import { CredentialsForms } from "./credentials-forms";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) {
    redirect(params.callbackUrl || "/dashboard");
  }

  const callbackUrl = params.callbackUrl || "/dashboard";
  const googleReady = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const githubReady = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  const initialMode = params.mode === "signup" ? "signup" : "signin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0d14] p-4 text-white sm:p-6 lg:p-8">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-[#1a1625] shadow-2xl lg:min-h-[720px] lg:grid-cols-2">
        <aside className="relative hidden min-h-[320px] overflow-hidden lg:block">
          <Image
            src="/brand/login-hero.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,19,31,0.35)_0%,rgba(22,19,31,0.15)_40%,rgba(22,19,31,0.85)_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--brand)_28%,transparent)] mix-blend-multiply"
          />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-6">
            <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
              <BrandMark size={28} />
              Pass-Off
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--brand)_72%,transparent)] px-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-[var(--brand)]"
            >
              Back to Website
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-8">
            <p className="max-w-sm font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-[-0.04em] text-white">
              {siteConfig.tagline}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
              {siteConfig.description}
            </p>
          </div>
        </aside>

        <section className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2.5 text-xl font-semibold tracking-[-0.04em] lg:hidden"
          >
            <BrandMark size={32} />
            Pass-Off
          </Link>

          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {initialMode === "signup" ? "Create an Account" : "Sign In"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {initialMode === "signup" ? (
              <>
                Already have an account?{" "}
                <Link
                  href={`/login?mode=signin&callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-glow)]"
                >
                  Login
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link
                  href={`/login?mode=signup&callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-glow)]"
                >
                  Create an Account
                </Link>
              </>
            )}
          </p>

          {params.error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-[#fecaca]/30 bg-[#7f1d1d]/40 px-3 py-2 text-xs text-[#fecaca]"
            >
              Sign-in failed ({params.error}). Check your OAuth app credentials and try again.
            </p>
          ) : null}

          <div className="mt-8">
            <CredentialsForms callbackUrl={callbackUrl} mode={initialMode} showModeTabs={false} />
          </div>

          {(googleReady || githubReady) ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
                <span className="h-px flex-1 bg-white/10" />
                Or continue with
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {googleReady ? (
                  <form action={googleSignIn}>
                    <input type="hidden" name="callbackUrl" value={callbackUrl} />
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                    >
                      Google
                    </button>
                  </form>
                ) : null}
                {githubReady ? (
                  <form action={githubSignIn}>
                    <input type="hidden" name="callbackUrl" value={callbackUrl} />
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                    >
                      GitHub
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
