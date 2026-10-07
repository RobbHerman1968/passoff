"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  clearTestTelemetryAction,
  saveTelemetrySettingsAction,
} from "@/app/(app)/projects/[projectId]/environments/[environmentId]/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { TelemetrySettingsRecord } from "@/lib/telemetry/settings";

export function BehavioralInsightsSettingsForm({
  projectId,
  environmentId,
  settings,
  canEdit,
}: {
  projectId: string;
  environmentId: string;
  settings: TelemetrySettingsRecord;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState(settings.collectionMode);

  return (
    <form
      className="grid max-w-2xl gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveTelemetrySettingsAction(
            environmentId,
            projectId,
            form,
          );
          if (result.status === "ok") toast.success(result.message);
          else toast.error(result.message ?? "We couldn’t save those settings.");
        });
      }}
    >
      <input type="hidden" name="version" value={settings.version} />
      <input type="hidden" name="collectionMode" value={mode} />
      <fieldset disabled={!canEdit || pending} className="grid gap-4">
        <legend className="text-sm font-medium">Collection mode</legend>
        <RadioGroup
          name="collectionMode"
          value={mode}
          onValueChange={(value) =>
            setMode(value as typeof settings.collectionMode)
          }
        >
          <div className="grid gap-1">
            <div className="flex min-h-11 items-center gap-2">
              <RadioGroupItem value="off" id="mode-off" />
              <Label htmlFor="mode-off">Off</Label>
            </div>
            <p className="type-supporting pl-6">
              No usability data is collected. This is the default.
            </p>
          </div>
          <div className="grid gap-1">
            <div className="flex min-h-11 items-center gap-2">
              <RadioGroupItem value="strict_consent" id="mode-strict" />
              <Label htmlFor="mode-strict">Strict consent</Label>
            </div>
            <p className="type-supporting pl-6">
              Nothing is sent until a visitor allows usability data. Declining
              leaves the website fully usable.
            </p>
          </div>
          <div className="grid gap-1">
            <div className="flex min-h-11 items-center gap-2">
              <RadioGroupItem
                value="privacy_first_aggregate"
                id="mode-aggregate"
              />
              <Label htmlFor="mode-aggregate">Privacy-first aggregate</Label>
            </div>
            <p className="type-supporting pl-6">
              You are responsible for confirming that notice-and-opt-out
              collection is appropriate for this website and its visitors. This
              is not automatically lawful in every place. Passoff does not use
              cookies, persistent visitor IDs, or device fingerprints.
            </p>
          </div>
        </RadioGroup>
      </fieldset>

      <FormField
        id="enabledOriginsText"
        label="Enabled production origins"
        description="One origin per line. Leave blank to use the environment’s allowed origins."
      >
        <Textarea
          name="enabledOriginsText"
          defaultValue={settings.enabledOrigins.join("\n")}
          rows={3}
          disabled={!canEdit}
        />
      </FormField>
      <FormField
        id="excludedRoutesText"
        label="Excluded routes"
        description="Paths that must never create events, one per line. Authentication, account, payment, and similar routes are already excluded."
      >
        <Textarea
          name="excludedRoutesText"
          defaultValue={settings.excludedRoutes.join("\n")}
          rows={3}
          disabled={!canEdit}
        />
      </FormField>
      <FormField id="samplingPercent" label="Sampling percentage">
        <Input
          name="samplingPercent"
          type="number"
          min={1}
          max={100}
          defaultValue={settings.samplingPercent}
          disabled={!canEdit}
        />
      </FormField>
      <FormField
        id="rawRetentionHours"
        label="Raw event retention (hours)"
        description="Default 72 hours. Maximum 168 hours during this beta."
      >
        <Input
          name="rawRetentionHours"
          type="number"
          min={1}
          max={168}
          defaultValue={settings.rawRetentionHours}
          disabled={!canEdit}
        />
      </FormField>
      <FormField
        id="aggregateRetentionDays"
        label="Aggregate retention (days)"
        description="Default 90 days."
      >
        <Input
          name="aggregateRetentionDays"
          type="number"
          min={1}
          max={365}
          defaultValue={settings.aggregateRetentionDays}
          disabled={!canEdit}
        />
      </FormField>
      <FormField id="organizationName" label="Organization name">
        <Input
          name="organizationName"
          defaultValue={settings.organizationName ?? ""}
          disabled={!canEdit}
        />
      </FormField>
      <FormField
        id="privacyPolicyUrl"
        label="Privacy policy URL"
        description="Shown to visitors from Learn more."
      >
        <Input
          name="privacyPolicyUrl"
          type="url"
          defaultValue={settings.privacyPolicyUrl ?? ""}
          disabled={!canEdit}
        />
      </FormField>

      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label htmlFor="testModeEnabled">Temporary test mode</Label>
        <Switch
          id="testModeEnabled"
          checked={undefined}
          defaultChecked={settings.testModeEnabled}
          disabled={!canEdit}
          onCheckedChange={(checked) => {
            const input = document.querySelector<HTMLInputElement>(
              'input[name="testModeEnabled"]',
            );
            if (input) input.value = checked ? "on" : "";
          }}
        />
        <input
          type="hidden"
          name="testModeEnabled"
          defaultValue={settings.testModeEnabled ? "on" : ""}
        />
      </div>
      <p className="type-supporting">
        Test events are labeled synthetic, never enter production summaries, and
        can be cleared.
      </p>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label htmlFor="environmentKillSwitch">Pause collection</Label>
        <Switch
          id="environmentKillSwitch"
          defaultChecked={settings.environmentKillSwitch}
          disabled={!canEdit}
          onCheckedChange={(checked) => {
            const input = document.querySelector<HTMLInputElement>(
              'input[name="environmentKillSwitch"]',
            );
            if (input) input.value = checked ? "on" : "";
          }}
        />
        <input
          type="hidden"
          name="environmentKillSwitch"
          defaultValue={settings.environmentKillSwitch ? "on" : ""}
        />
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            Save behavioral insights
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await clearTestTelemetryAction(
                  environmentId,
                  projectId,
                );
                if (result.status === "ok") toast.success(result.message);
                else toast.error(result.message);
              });
            }}
          >
            Clear test events
          </Button>
        </div>
      ) : (
        <p className="type-supporting">
          Only workspace owners can change these settings.
        </p>
      )}
    </form>
  );
}
