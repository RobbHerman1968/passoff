"use client";

import { useHelp } from "@/components/help/help-context";
import { Button } from "@/components/ui/button";
import type { HelpTopicId } from "@/lib/help/topics";

export function HelpTopicButton({
  topicId,
  children,
}: {
  topicId: HelpTopicId;
  children: React.ReactNode;
}) {
  const { openHelp } = useHelp();

  return (
    <Button
      type="button"
      variant="link"
      className="h-11 min-h-11 px-1"
      onClick={() => openHelp(topicId)}
    >
      {children}
    </Button>
  );
}
