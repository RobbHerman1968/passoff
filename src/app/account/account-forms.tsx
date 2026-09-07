"use client";

import { useActionState } from "react";

import {
  updateAccountPassword,
  updateAccountProfile,
  updateNotificationEmail,
  type AccountFormState,
} from "./actions";

const initialState: AccountFormState = {};

const inputClassName =
  "mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]";

export function AccountProfileForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(updateAccountProfile, initialState);

  return (
    <form action={action} className="space-y-4">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        Name
        <input
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          autoComplete="name"
          className={inputClassName}
        />
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-xl bg-[var(--brand-surface)] px-4 text-sm font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Name"}
      </button>
    </form>
  );
}

export function AccountPasswordForm() {
  const [state, action, pending] = useActionState(updateAccountPassword, initialState);

  return (
    <form action={action} className="space-y-4">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        Current password
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClassName}
        />
      </label>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClassName}
        />
      </label>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        Confirm new password
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClassName}
        />
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-black/65 transition hover:bg-black/[0.02] disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}

export function NotificationEmailForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState(updateNotificationEmail, initialState);

  return (
    <form action={action} className="space-y-4">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        Workspace notification email
        <input
          name="notificationEmail"
          type="email"
          required
          defaultValue={defaultEmail}
          autoComplete="email"
          className={inputClassName}
        />
      </label>
      <p className="text-sm leading-6 text-black/45">
        Used for approval, comment, and review notifications for this workspace.
      </p>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Notification Email"}
      </button>
    </form>
  );
}
