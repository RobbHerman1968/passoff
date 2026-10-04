"use client";

import * as React from "react";

import {
  getHelpTopic,
  type HelpPageContext,
  type HelpTopic,
  type HelpTopicId,
} from "@/lib/help/topics";

type HelpContextValue = {
  pageContext: HelpPageContext;
  open: boolean;
  activeTopic: HelpTopic;
  openHelp: (topicId?: HelpTopicId) => void;
  closeHelp: () => void;
  setOpen: (open: boolean) => void;
  restoreFocus: (event: Event) => void;
};

const HelpContext = React.createContext<HelpContextValue | null>(null);

export function ContextualHelpProvider({
  pageContext,
  children,
}: {
  pageContext: HelpPageContext;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(false);
  const [topicId, setTopicId] = React.useState<HelpTopicId>(pageContext);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const openHelp = React.useCallback(
    (nextTopicId?: HelpTopicId) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        triggerRef.current = active;
      }
      setTopicId(nextTopicId ?? pageContext);
      setOpenState(true);
    },
    [pageContext],
  );

  const closeHelp = React.useCallback(() => {
    setOpenState(false);
  }, []);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        openHelp();
        return;
      }
      closeHelp();
    },
    [openHelp, closeHelp],
  );

  const restoreFocus = React.useCallback((event: Event) => {
    event.preventDefault();
    const trigger = triggerRef.current;
    triggerRef.current = null;
    trigger?.focus();
  }, []);

  const value = React.useMemo<HelpContextValue>(
    () => ({
      pageContext,
      open,
      activeTopic: getHelpTopic(topicId),
      openHelp,
      closeHelp,
      setOpen,
      restoreFocus,
    }),
    [pageContext, open, topicId, openHelp, closeHelp, setOpen, restoreFocus],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp() {
  const value = React.useContext(HelpContext);
  if (!value) {
    throw new Error("useHelp must be used within ContextualHelpProvider.");
  }
  return value;
}

export function useOptionalHelp() {
  return React.useContext(HelpContext);
}
