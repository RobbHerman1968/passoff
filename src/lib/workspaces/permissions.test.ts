import { describe, expect, it } from "vitest";

import {
  OWNER_ONLY_ACTIONS,
  can,
  canDeleteWorkspace,
  canInviteMembers,
  canManageBilling,
  canManageWebhooks,
  canTransferOwnership,
  type WorkspaceAction,
} from "@/lib/workspaces/permissions";

const MEMBER_ACTIONS: WorkspaceAction[] = [
  "project.mutate",
  "members.view",
  "workspace.leave",
  "workspace.plan.view",
];

describe("workspace permissions", () => {
  it("lets an owner do everything", () => {
    for (const action of OWNER_ONLY_ACTIONS) {
      expect(can({ role: "owner" }, action), action).toBe(true);
    }
    for (const action of MEMBER_ACTIONS) {
      expect(can({ role: "owner" }, action), action).toBe(true);
    }
  });

  it("refuses every owner-only action to a member", () => {
    expect(OWNER_ONLY_ACTIONS.length).toBeGreaterThan(5);
    for (const action of OWNER_ONLY_ACTIONS) {
      expect(can({ role: "member" }, action), action).toBe(false);
    }
  });

  it("covers the sensitive actions the product relies on", () => {
    for (const action of [
      "members.invite",
      "members.remove",
      "invitations.manage",
      "ownership.transfer",
      "workspace.rename",
      "workspace.delete",
      "project.delete",
      "webhooks.manage",
      "billing.manage",
    ] as WorkspaceAction[]) {
      expect(OWNER_ONLY_ACTIONS).toContain(action);
    }
  });

  it("lets members keep working and leave", () => {
    for (const action of MEMBER_ACTIONS) {
      expect(can({ role: "member" }, action), action).toBe(true);
    }
  });

  it("exposes the same answers through the named helpers", () => {
    expect(canInviteMembers({ role: "member" })).toBe(false);
    expect(canTransferOwnership({ role: "member" })).toBe(false);
    expect(canDeleteWorkspace({ role: "member" })).toBe(false);
    expect(canManageWebhooks({ role: "member" })).toBe(false);
    expect(canInviteMembers({ role: "owner" })).toBe(true);
    expect(canManageBilling({ role: "member" })).toBe(false);
    expect(canManageBilling({ role: "owner" })).toBe(true);
  });

  it("lets every member see the plan and usage but not change it", () => {
    expect(can({ role: "member" }, "workspace.plan.view")).toBe(true);
    expect(can({ role: "member" }, "billing.manage")).toBe(false);
  });

  it("treats a missing role as no access", () => {
    expect(can({ role: null }, "members.view")).toBe(false);
  });
});
