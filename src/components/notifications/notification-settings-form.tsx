"use client";

import { useState } from "react";
import { toast } from "sonner";

import { updateNotificationSettingsAction } from "@/app/(app)/notifications/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { UserNotificationSettings } from "@/lib/notifications/types";

const OPTIONS: Array<{
  key: keyof UserNotificationSettings;
  label: string;
  description: string;
}> = [
  {
    key: "emailAssignments",
    label: "Assignments",
    description: "Email me when an issue is assigned to me.",
  },
  {
    key: "emailReplies",
    label: "Replies and mentions",
    description: "Email me when someone replies to my feedback or mentions me.",
  },
  {
    key: "emailVerification",
    label: "Verification",
    description: "Email me when a fix is ready to check, or when a check fails.",
  },
  {
    key: "emailApproval",
    label: "Approval",
    description: "Email me when a review is ready to approve or changes are requested.",
  },
];

export function NotificationSettingsForm({
  settings,
}: {
  settings: UserNotificationSettings;
}) {
  const [values, setValues] = useState(settings);
  const [savingKey, setSavingKey] = useState<keyof UserNotificationSettings | null>(
    null,
  );

  async function toggle(key: keyof UserNotificationSettings, checked: boolean) {
    const previous = values;
    setValues((current) => ({ ...current, [key]: checked }));
    setSavingKey(key);
    const result = await updateNotificationSettingsAction({ [key]: checked });
    setSavingKey(null);
    if (!result.ok) {
      setValues(previous);
      toast.error(result.message ?? "We couldn’t save that preference.");
      return;
    }
    toast.success("Preference saved.");
  }

  return (
    <section className="grid max-w-xl gap-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">
        These switches only change email. You’ll still see important workflow
        updates in the notification bell.
      </p>
      {OPTIONS.map((option) => (
        <div
          key={option.key}
          className="flex items-start justify-between gap-4"
        >
          <div className="grid min-w-0 gap-1">
            <Label htmlFor={option.key}>{option.label}</Label>
            <p id={`${option.key}-description`} className="text-sm text-muted-foreground">
              {option.description}
            </p>
          </div>
          <Switch
            id={option.key}
            checked={values[option.key]}
            disabled={savingKey === option.key}
            aria-describedby={`${option.key}-description`}
            onCheckedChange={(checked) => void toggle(option.key, checked)}
          />
        </div>
      ))}
    </section>
  );
}
