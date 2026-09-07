"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { resetPasswordWithToken, type PasswordFormState } from "../forgot-password/actions";

const initialState: PasswordFormState = {};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#7c6cf0]/50";

function PasswordInput({
  name,
  autoComplete,
  placeholder,
}: {
  name: string;
  autoComplete: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
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

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordWithToken, initialState);

  if (state.success) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
          {state.success}
        </p>
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-xl bg-[#7c6cf0] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#6354d4]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-[#fecaca]/30 bg-[#7f1d1d]/40 px-3 py-2 text-xs text-[#fecaca]">
          {state.error}
        </p>
      ) : null}

      {!token ? (
        <p role="alert" className="rounded-xl border border-[#fecaca]/30 bg-[#7f1d1d]/40 px-3 py-2 text-xs text-[#fecaca]">
          This reset link is missing or invalid. Request a new one from the forgot password page.
        </p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
              New password
            </span>
            <PasswordInput name="password" autoComplete="new-password" placeholder="At least 8 characters" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Confirm password
            </span>
            <PasswordInput name="confirm" autoComplete="new-password" placeholder="Repeat password" />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center rounded-xl bg-[#7c6cf0] px-4 py-3 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 enabled:hover:bg-[#6354d4] disabled:opacity-50"
          >
            {pending ? "Updating…" : "Update password"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-white/45">
        <Link href="/forgot-password" className="font-semibold text-[var(--brand)] hover:text-[var(--brand-glow)]">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
