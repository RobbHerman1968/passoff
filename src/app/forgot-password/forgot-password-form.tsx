"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, type PasswordFormState } from "./actions";

const initialState: PasswordFormState = {};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#7c6cf0]/50";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-[#fecaca]/30 bg-[#7f1d1d]/40 px-3 py-2 text-xs text-[#fecaca]">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
          {state.success}
        </p>
      ) : null}

      <form action={action} className="space-y-3">
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
        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center rounded-xl bg-[#7c6cf0] px-4 py-3 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 enabled:hover:bg-[#6354d4] disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send Reset Link"}
        </button>
      </form>

      <p className="text-center text-sm text-white/45">
        <Link href="/login" className="font-semibold text-[var(--brand)] hover:text-[var(--brand-glow)]">
          Back to Sign In
        </Link>
      </p>
    </div>
  );
}
