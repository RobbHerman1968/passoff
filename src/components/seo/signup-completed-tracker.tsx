"use client";

import { useEffect } from "react";

import { consumeSignupPending } from "@/lib/analytics/client-flags";
import { track } from "@/lib/analytics/events";

/** Fires once after a credentials signup redirects into the app. */
export function SignupCompletedTracker() {
  useEffect(() => {
    if (consumeSignupPending()) {
      track("signup_completed", { path: "/dashboard" });
    }
  }, []);

  return null;
}
