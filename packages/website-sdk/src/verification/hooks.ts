import {
  HOOK_SUMMARY_MAX,
  HOOK_TIMEOUT_MS,
  isAllowedHookName,
  isVerificationOutcome,
  type VerificationOutcome,
} from "./contract";

export type NamedHookResult = {
  outcome: VerificationOutcome;
  summary: string;
};

type HookFn = () =>
  | { outcome: VerificationOutcome; summary?: string }
  | Promise<{ outcome: VerificationOutcome; summary?: string }>;

const hooks = new Map<string, HookFn>();

export function registerVerificationCheck(name: string, fn: HookFn): void {
  if (!isAllowedHookName(name) || typeof fn !== "function") return;
  hooks.set(name, fn);
}

export function clearVerificationHooksForTests(): void {
  hooks.clear();
}

function sanitizeHookResult(value: unknown): NamedHookResult {
  if (!value || typeof value !== "object") {
    return {
      outcome: "uncertain",
      summary: "The named check returned a result Passoff could not use.",
    };
  }
  const input = value as Record<string, unknown>;
  const outcome = isVerificationOutcome(String(input.outcome))
    ? (input.outcome as VerificationOutcome)
    : null;
  if (!outcome) {
    return {
      outcome: "uncertain",
      summary: "The named check returned a result Passoff could not use.",
    };
  }
  const summary =
    typeof input.summary === "string"
      ? input.summary.replace(/<[^>]*>/g, "").slice(0, HOOK_SUMMARY_MAX)
      : "";
  return {
    outcome,
    summary: summary || "The named check finished.",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout" | "error"> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve("timeout"), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve("error");
      },
    );
  });
}

export async function runNamedHook(
  name: string,
  allowlist: string[],
): Promise<{
  outcome: VerificationOutcome;
  summary: string;
  limitations: string[];
  measurements: Record<string, unknown>;
  failureCode?: string;
}> {
  if (!isAllowedHookName(name) || !allowlist.includes(name)) {
    return {
      outcome: "uncertain",
      summary: "That named check isn’t allowed for this website.",
      limitations: [],
      measurements: { hookName: name },
      failureCode: "hook_missing",
    };
  }
  const fn = hooks.get(name);
  if (!fn) {
    return {
      outcome: "uncertain",
      summary: "The named check isn’t registered on this website.",
      limitations: [],
      measurements: { hookName: name },
      failureCode: "hook_missing",
    };
  }
  try {
    const raced = await withTimeout(Promise.resolve().then(() => fn()), HOOK_TIMEOUT_MS);
    if (raced === "timeout") {
      return {
        outcome: "uncertain",
        summary: "The named check did not return before the time limit.",
        limitations: [],
        measurements: { hookName: name, timedOut: true },
        failureCode: "hook_timeout",
      };
    }
    if (raced === "error") {
      return {
        outcome: "uncertain",
        summary: "The named check couldn’t finish.",
        limitations: [],
        measurements: { hookName: name },
      };
    }
    const sanitized = sanitizeHookResult(raced);
    return {
      ...sanitized,
      limitations: [],
      measurements: { hookName: name },
    };
  } catch {
    return {
      outcome: "uncertain",
      summary: "The named check couldn’t finish.",
      limitations: [],
      measurements: { hookName: name },
    };
  }
}
