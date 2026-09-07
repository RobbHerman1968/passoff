"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";

import {
  signOutAction,
  updateAccountPassword,
  updateAccountProfile,
  type AccountFormState,
} from "@/app/account/actions";
import { formatStorageBytes } from "@/lib/rooms/entitlements-format";

export type AccountMenuProps = {
  name: string;
  email: string;
  roomCount: number;
  maxActiveRooms: number;
  usedBytes: number;
  maxStorageBytes: number;
  hasPassword: boolean;
  compact?: boolean;
};

const initialState: AccountFormState = {};

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#6354d4]";

function initialsFromName(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] || "PO";
  return local.slice(0, 2).toUpperCase();
}

function ProfileFields({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAccountProfile, initialState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={action} className="space-y-2">
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
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
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-700">{state.success}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center rounded-lg bg-[var(--brand-surface)] px-3 text-xs font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Name"}
      </button>
    </form>
  );
}

function PasswordFields() {
  const [state, action, pending] = useActionState(updateAccountPassword, initialState);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
        Current password
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClassName}
        />
      </label>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
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
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
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
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-700">{state.success}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 transition hover:bg-black/[0.02] disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}

export function AccountMenu({
  name,
  email,
  roomCount,
  maxActiveRooms,
  usedBytes,
  maxStorageBytes,
  hasPassword,
  compact = false,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = initialsFromName(name, email);
  const usedLabel = formatStorageBytes(usedBytes);
  const maxLabel = formatStorageBytes(maxStorageBytes);
  const usagePct = maxStorageBytes > 0 ? Math.min(100, Math.round((usedBytes / maxStorageBytes) * 100)) : 0;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setAccountOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1.5 rounded-full border border-[#a594f5]/35 bg-white transition hover:border-[#a594f5]/55 hover:bg-[#f7f4ff] ${
          compact ? "p-0.5" : "pl-0.5 pr-1.5 py-0.5"
        }`}
      >
        <span
          className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--brand-surface)] text-[11px] font-semibold tracking-wide text-[var(--brand-soft)]"
          aria-hidden
        >
          {initials}
        </span>
        {!compact ? (
          <ChevronDown className={`size-3.5 text-black/35 transition ${open ? "rotate-180" : ""}`} />
        ) : null}
        <span className="sr-only">Account menu for {name || email}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#a594f5]/25 bg-[#faf8ff] shadow-[0_18px_40px_rgba(40,30,90,0.14)]"
        >
          <div className="border-b border-[#a594f5]/20 px-4 py-3">
            <p className="truncate text-sm font-semibold text-[var(--brand-deep)]">{name || "Account"}</p>
            <p className="mt-0.5 truncate text-xs text-black/45">{email}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-b border-[#a594f5]/20 px-4 py-3">
            <div className="rounded-xl border border-black/8 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">Rooms</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--brand-deep)]">
                {roomCount}
                <span className="font-medium text-black/35"> / {maxActiveRooms}</span>
              </p>
            </div>
            <div className="rounded-xl border border-black/8 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">Storage</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--brand-deep)]">{usedLabel}</p>
              <p className="text-[10px] text-black/40">of {maxLabel}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="px-2 py-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => setAccountOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[var(--brand-deep)] transition hover:bg-white"
            >
              Account
              <ChevronDown className={`size-3.5 text-black/35 transition ${accountOpen ? "rotate-180" : ""}`} />
            </button>

            {accountOpen ? (
              <div className="mx-1 mb-2 space-y-4 rounded-xl border border-black/8 bg-white p-3">
                <ProfileFields defaultName={name} />
                {hasPassword ? (
                  <div className="border-t border-black/6 pt-3">
                    <PasswordFields />
                  </div>
                ) : (
                  <p className="border-t border-black/6 pt-3 text-xs leading-5 text-black/45">
                    This account uses social sign-in. Password changes are not available here.
                  </p>
                )}
                <Link
                  href="/account"
                  className="inline-flex text-xs font-semibold text-[var(--brand-ink)] hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Open full account page
                </Link>
              </div>
            ) : null}

            <form action={signOutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-black/55 transition hover:bg-white"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
