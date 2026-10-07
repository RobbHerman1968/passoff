import { FormAlert } from "@/components/auth/form-alert";
import type { SettingsActionResult } from "@/app/(app)/settings/actions";

/**
 * Shows the outcome of a settings action. Success is announced politely, problems
 * assertively, and the region stays in the page so assistive technology hears changes.
 */
export function ActionMessage({
  result,
  errorTitle = "That didn’t work",
  successTitle,
}: {
  result: SettingsActionResult;
  errorTitle?: string;
  successTitle?: string;
}) {
  if (result.status === "idle" || !result.message) {
    return <div role="status" aria-live="polite" className="sr-only" />;
  }
  if (result.status === "success") {
    return (
      <FormAlert tone="success" title={successTitle ?? result.message} description={successTitle ? result.message : undefined} />
    );
  }
  return <FormAlert title={errorTitle} description={result.message} />;
}
