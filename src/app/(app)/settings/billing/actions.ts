"use server";

import { redirect } from "next/navigation";

import { openBillingPortal, startCheckout } from "@/lib/billing/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type BillingActionState = {
  status: "idle" | "error" | "forbidden" | "unavailable";
  message?: string;
};

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function requireContext() {
  const auth = await requireWorkspaceContext();
  if (auth.ok) return auth.context;
  if (auth.reason === "unauthenticated") redirect("/sign-in?callbackUrl=/settings/billing");
  redirect("/onboarding");
}

function failure(
  error: "forbidden" | "invalid" | "not_configured" | "already_subscribed" | "no_customer" | "rate_limited" | "unavailable",
  message: string,
): BillingActionState {
  return { status: error === "forbidden" ? "forbidden" : error === "unavailable" ? "unavailable" : "error", message };
}

/**
 * Sends the owner to a Stripe-hosted Checkout page. The plan only changes when Stripe's
 * webhook confirms payment; coming back to Passoff never changes it on its own.
 */
export async function startCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const context = await requireContext();
  const result = await startCheckout(context, {
    plan: formString(formData, "plan"),
    interval: formString(formData, "interval"),
  });
  if (!result.ok) return failure(result.error, result.message);
  redirect(result.url);
}

export async function openBillingPortalAction(
  // useActionState always passes the previous state; the portal doesn't need it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: BillingActionState,
): Promise<BillingActionState> {
  const context = await requireContext();
  const result = await openBillingPortal(context);
  if (!result.ok) return failure(result.error, result.message);
  redirect(result.url);
}
