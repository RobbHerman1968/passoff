import { WifiOff } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<WifiOff className="size-8" />}
      title="You're offline"
      description="We'll keep your work on this page. Try again when you're back online."
      action={
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
