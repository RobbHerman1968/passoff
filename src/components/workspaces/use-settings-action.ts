"use client";

import { useState, useTransition } from "react";

import type { SettingsActionResult } from "@/app/(app)/settings/actions";

type SettingsAction = (
  prev: SettingsActionResult,
  formData: FormData,
) => Promise<SettingsActionResult>;

const IDLE: SettingsActionResult = { status: "idle" };

/**
 * Runs a settings server action from a button (not a form) and keeps the plain-language
 * result so the panel can announce it. Used for row actions such as "Resend invitation".
 */
export function useSettingsAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SettingsActionResult>(IDLE);

  function run(action: SettingsAction, fields: Record<string, string>) {
    startTransition(async () => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      try {
        setResult(await action(IDLE, formData));
      } catch (error) {
        // Redirects from the action are handled by Next.js; anything else is a failure.
        if (error && typeof error === "object" && "digest" in error) throw error;
        setResult({
          status: "unavailable",
          message: "We couldn’t finish that. Check your connection and try again.",
        });
      }
    });
  }

  return { pending, result, run, clear: () => setResult(IDLE) };
}
