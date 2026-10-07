import * as React from "react";

import { SettingsNav } from "@/components/workspaces/settings-nav";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    // Each page sends the person to sign in with its own return address.
    return <>{children}</>;
  }

  return (
    <>
      <SettingsNav role={auth.context.role} />
      {children}
    </>
  );
}
