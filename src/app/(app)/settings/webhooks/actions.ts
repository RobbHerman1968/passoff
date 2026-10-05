"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { retryFailedDelivery } from "@/lib/webhooks/deliver";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  rotateWebhookSecret,
  sendTestWebhook,
  updateWebhookEndpoint,
} from "@/lib/webhooks/service";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/types";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

const eventsSchema = z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1);

function revalidate() {
  revalidatePath("/settings/webhooks");
}

export async function createWebhookEndpointAction(input: {
  url: string;
  events: string[];
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const, message: "Sign in to continue." };
  const events = eventsSchema.safeParse(input.events);
  if (!events.success) {
    return { ok: false as const, message: "Choose at least one event." };
  }
  const result = await createWebhookEndpoint(auth.context, {
    url: input.url,
    events: events.data,
  });
  if (!result.ok) {
    return {
      ok: false as const,
      message: "message" in result ? result.message : "You need to be a workspace owner to manage webhooks.",
    };
  }
  revalidate();
  return { ok: true as const, secret: result.secret, id: result.endpoint.id };
}

export async function toggleWebhookEndpointAction(endpointId: string, isEnabled: boolean) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const };
  const parsed = z.string().uuid().safeParse(endpointId);
  if (!parsed.success) return { ok: false as const };
  const result = await updateWebhookEndpoint(auth.context, {
    endpointId: parsed.data,
    isEnabled,
  });
  revalidate();
  return { ok: result.ok };
}

export async function rotateWebhookSecretAction(endpointId: string) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const, message: "Sign in to continue." };
  const parsed = z.string().uuid().safeParse(endpointId);
  if (!parsed.success) return { ok: false as const, message: "That endpoint isn’t available." };
  const result = await rotateWebhookSecret(auth.context, parsed.data);
  if (!result.ok) return { ok: false as const, message: "That endpoint isn’t available." };
  revalidate();
  return { ok: true as const, secret: result.secret };
}

export async function deleteWebhookEndpointAction(endpointId: string) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const };
  const parsed = z.string().uuid().safeParse(endpointId);
  if (!parsed.success) return { ok: false as const };
  await deleteWebhookEndpoint(auth.context, parsed.data);
  revalidate();
  return { ok: true as const };
}

export async function sendTestWebhookAction(endpointId: string) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const, message: "Sign in to continue." };
  const parsed = z.string().uuid().safeParse(endpointId);
  if (!parsed.success) return { ok: false as const, message: "That endpoint isn’t available." };
  const result = await sendTestWebhook(auth.context, parsed.data);
  if (!result.ok) {
    return {
      ok: false as const,
      message: "message" in result ? result.message : "We couldn’t send a test delivery.",
    };
  }
  revalidate();
  return { ok: true as const };
}

export async function retryWebhookDeliveryAction(deliveryId: string) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const };
  if (auth.context.role !== "owner") return { ok: false as const };
  const parsed = z.string().uuid().safeParse(deliveryId);
  if (!parsed.success) return { ok: false as const };
  await retryFailedDelivery(parsed.data, auth.context.workspaceId);
  revalidate();
  return { ok: true as const };
}
