"use client";

import * as React from "react";

import { OfflineState } from "@/components/offline-state";

export function useOnlineStatus() {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

export function NetworkGate({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  const online = useOnlineStatus();

  if (!online) {
    return <OfflineState onRetry={onRetry ?? (() => window.location.reload())} />;
  }

  return children;
}
