import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LABEL_COLOR_DOT_CLASSES,
  type LabelView,
} from "@/lib/labels/types";

/**
 * A label is always shown with its name as text. The colored dot is decorative,
 * so state never depends on color alone.
 */
export function LabelChip({
  label,
  onRemove,
  removeDisabled = false,
}: {
  label: LabelView;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <li className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-3 text-sm text-foreground has-[button]:pr-1">
      <span
        aria-hidden="true"
        className={`size-2.5 shrink-0 rounded-full ${LABEL_COLOR_DOT_CLASSES[label.color]}`}
      />
      <span className="min-w-0 break-words font-medium">{label.name}</span>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={`Remove label ${label.name}`}
          disabled={removeDisabled}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}
