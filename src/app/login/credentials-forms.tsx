"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { markSignupPending } from "@/lib/analytics/client-flags";
import { track } from "@/lib/analytics/events";

import {
  credentialsSignIn,
  credentialsSignUp,
  type AuthFormState,
} from "./actions";

const initialState: AuthFormState = {};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#7c6cf0]/50";

function PasswordField({
  autoComplete,
  placeholder,
}: {
  autoComplete: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        name="password"
        type={visible ? "text" : "password"}
        required
        minLength={8}
        autoComplete={autoComplete}
        className={`${inputClassName} pr-11`}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white/70"
      >
        {visible ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}

export function CredentialsForms({
  callbackUrl,
  mode = "signin",
  showModeTabs = true,
}: {
  callbackUrl: string;
  mode?: "signin" | "signup";
  showModeTabs?: boolean;
}) {
  const [signInState, signInAction, signInPending] = useActionState(credentialsSignIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(credentialsSignUp, initialState);
  const error = mode === "signup" ? signUpState.error : signInState.error;
  const pending = mode === "signup" ? signUpPending : signInPending;

  return (
    <div className="space-y-4">
      {showModeTabs ? (
        <div className="flex gap-2 rounded-xl bg-white/5 p-1 text-xs font-semibold">
          <a
            href={`/login?mode=signin&callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className={`flex-1 rounded-lg px-3 py-2 text-center transition ${mode === "signin" ? "bg-[#7c6cf0] text-white" : "text-white/55 hover:text-white"}`}
          >
            Sign in
          </a>
          <a
            href={`/login?mode=signup&callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className={`flex-1 rounded-lg px-3 py-2 text-center transition ${mode === "signup" ? "bg-[#7c6cf0] text-white" : "text-white/55 hover:text-white"}`}
          >
            Create account
          </a>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-[#fecaca]/30 bg-[#7f1d1d]/40 px-3 py-2 text-xs text-[#fecaca]">
          {error}
        </p>
      ) : null}

      {mode === "signup" ? (
        <form
          action={signUpAction}
          className="space-y-3"
          onSubmit={() => {
            markSignupPending();
            track("signup_start", { path: "/login", source: "credentials" });
          }}
        >
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Name</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              className={inputClassName}
              placeholder="Your name"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClassName}
              placeholder="you@company.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Password</span>
            <PasswordField autoComplete="new-password" placeholder="At least 8 characters" />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center rounded-xl bg-[#7c6cf0] px-4 py-3 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 enabled:hover:bg-[#6354d4] disabled:opacity-50"
          >
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>
      ) : (
        <form action={signInAction} className="space-y-3">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClassName}
              placeholder="you@company.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Password</span>
            <PasswordField autoComplete="current-password" placeholder="Your password" />
          </label>
          <div className="flex justify-end">
            <a
              href="/forgot-password"
              className="text-xs font-semibold text-white/45 transition hover:text-[var(--brand-glow)]"
            >
              Forgot password?
            </a>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center rounded-xl bg-[#7c6cf0] px-4 py-3 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 enabled:hover:bg-[#6354d4] disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
