import type { IssueStatus } from "@/lib/issues/statuses";
import type { VerificationCheckKind } from "@/lib/verification/contract";
import { isAllowedHookName, isVerificationCheckKind } from "@/lib/verification/contract";

export const CHECKABLE_ISSUE_STATUSES: IssueStatus[] = [
  "open",
  "in_progress",
  "ready_for_verification",
  "verified",
];

export type VerificationBlocker = {
  code: string;
  title: string;
  next: string;
};

export function checksUsefulForStatus(status: IssueStatus): boolean {
  return CHECKABLE_ISSUE_STATUSES.includes(status);
}

export function selectedChecksFromInput(input: {
  checks?: string[];
  namedHook?: string | null;
  allowlist: string[];
}): { checks: VerificationCheckKind[]; namedHook: string | null; error?: VerificationBlocker } {
  const requested = (input.checks ?? []).filter(isVerificationCheckKind);
  const unique = [...new Set(requested)];
  if (unique.length === 0) {
    unique.push("element_visibility", "bounding_box_overlap");
  }

  let namedHook: string | null = null;
  if (unique.includes("named_test_hook")) {
    const name = input.namedHook?.trim() ?? "";
    if (!isAllowedHookName(name) || !input.allowlist.includes(name)) {
      return {
        checks: unique.filter((item) => item !== "named_test_hook"),
        namedHook: null,
        error: unique.length === 1
          ? {
              code: "hook_missing",
              title: "That named check isn’t allowed for this website.",
              next: "Ask a workspace owner to allow the check name, or run visibility and overlap instead.",
            }
          : undefined,
      };
    }
    namedHook = name;
  }

  return { checks: unique, namedHook };
}

export function parseHookAllowlist(text: string): string[] {
  const names = text
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(isAllowedHookName);
  return [...new Set(names)].slice(0, 20);
}
