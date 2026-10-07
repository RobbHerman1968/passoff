"use server";

import { revalidatePath } from "next/cache";

import {
  clearTestTelemetry,
  telemetrySettingsSchema,
  updateTelemetrySettings,
} from "@/lib/telemetry/settings";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type TelemetryActionResult = {
  status: "ok" | "error";
  message?: string;
};

export async function saveTelemetrySettingsAction(
  environmentId: string,
  projectId: string,
  formData: FormData,
): Promise<TelemetryActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { status: "error", message: "Sign in to continue." };
  }

  const parsed = telemetrySettingsSchema.safeParse({
    collectionMode: formData.get("collectionMode"),
    enabledOriginsText: String(formData.get("enabledOriginsText") ?? ""),
    excludedRoutesText: String(formData.get("excludedRoutesText") ?? ""),
    samplingPercent: formData.get("samplingPercent"),
    rawRetentionHours: formData.get("rawRetentionHours"),
    aggregateRetentionDays: formData.get("aggregateRetentionDays"),
    organizationName: String(formData.get("organizationName") ?? ""),
    privacyPolicyUrl: String(formData.get("privacyPolicyUrl") ?? ""),
    hideBuiltInPrivacyLink: formData.get("hideBuiltInPrivacyLink") === "on",
    testModeEnabled: formData.get("testModeEnabled") === "on",
    environmentKillSwitch: formData.get("environmentKillSwitch") === "on",
    version: formData.get("version"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
    };
  }

  const result = await updateTelemetrySettings(
    auth.context,
    environmentId,
    parsed.data,
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.message ??
        (result.error === "forbidden"
          ? "Only workspace owners can change behavioral insights."
          : "We couldn’t save those settings."),
    };
  }
  revalidatePath(`/projects/${projectId}/environments/${environmentId}`);
  revalidatePath("/usability");
  return { status: "ok", message: "Behavioral insights settings saved." };
}

export async function clearTestTelemetryAction(
  environmentId: string,
  projectId: string,
): Promise<TelemetryActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { status: "error", message: "Sign in to continue." };
  const result = await clearTestTelemetry(auth.context, environmentId);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "forbidden"
          ? "Only workspace owners can clear test events."
          : "We couldn’t clear test events.",
    };
  }
  revalidatePath(`/projects/${projectId}/environments/${environmentId}`);
  return { status: "ok", message: "Test events were cleared." };
}
