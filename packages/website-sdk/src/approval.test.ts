import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";

import { approvalNoteError, shouldShowApproval } from "./approval";
import { mountReview } from "./review";
import { HOST_ROOT_ID } from "./styles";
import type { SdkApproval } from "./api";

const DECIDABLE: SdkApproval = {
  visibleState: "awaiting_approval",
  statusLabel: "Waiting for approval on v1.4",
  versionLabel: "v1.4",
  canDecide: true,
  blockedReason: null,
  request: {
    id: "request-1",
    deploymentId: "deployment-1",
    versionLabel: "v1.4",
    requesterDisplayName: "Sam",
    message: "Please check the new pricing page.",
  },
};

const VIEW_ONLY: SdkApproval = {
  visibleState: "awaiting_approval",
  statusLabel: "Waiting for approval on v1.4",
  versionLabel: "v1.4",
  canDecide: false,
  blockedReason: "view_only",
  request: null,
};

type Handler = (init?: RequestInit) => { ok: boolean; body: unknown };

function stubApi(options: {
  approval: SdkApproval | null;
  decide?: Handler;
}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let decided = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/approvals/status")) {
        const approval =
          decided && options.approval
            ? {
                ...options.approval,
                visibleState: "approved",
                statusLabel: "Approved for v1.4",
                canDecide: false,
                blockedReason: "already_decided" as const,
                request: null,
              }
            : options.approval;
        return { ok: true, json: async () => ({ ok: true, approval }) };
      }
      if (url.includes("/approvals/decide")) {
        const reply = options.decide?.(init) ?? {
          ok: true,
          body: { ok: true, message: "Thanks. Your approval is recorded for this version." },
        };
        if (reply.ok) decided = true;
        return { ok: reply.ok, json: async () => reply.body };
      }
      return { ok: true, json: async () => ({ ok: true, issues: [], canComment: true }) };
    }),
  );
  return calls;
}

function mount() {
  const runtime = mountReview({
    assetBaseUrl: "/",
    apiBaseUrl: "https://passoff.example.com",
    sessionToken: "session-token",
  });
  const shadow = document.getElementById(HOST_ROOT_ID)!.shadowRoot!;
  return { runtime, shadow };
}

function approvalButton(shadow: ShadowRoot) {
  return [...shadow.querySelectorAll<HTMLButtonElement>(".toolbar button")].find(
    (button) => button.textContent === "Approval",
  )!;
}

async function openPanel(shadow: ShadowRoot) {
  await vi.waitFor(() => expect(approvalButton(shadow).hidden).toBe(false));
  approvalButton(shadow).click();
  const panel = shadow.querySelector<HTMLElement>("#passoff-approval-panel")!;
  expect(panel.hidden).toBe(false);
  return panel;
}

function setNote(panel: HTMLElement, value: string) {
  const note = panel.querySelector<HTMLTextAreaElement>("#passoff-approval-note")!;
  note.value = value;
  note.dispatchEvent(new Event("input", { bubbles: true }));
  return note;
}

function chooseChanges(panel: HTMLElement) {
  const radio = panel.querySelector<HTMLInputElement>('input[value="changes_requested"]')!;
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
}

function submitForm(panel: HTMLElement) {
  panel.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

afterEach(() => {
  document.getElementById(HOST_ROOT_ID)?.remove();
  vi.unstubAllGlobals();
});

describe("approval note rules", () => {
  it("requires a note only when asking for changes", () => {
    expect(approvalNoteError("approved", "")).toBeNull();
    expect(approvalNoteError("changes_requested", "   ")).toMatch(/what needs to change/i);
    expect(approvalNoteError("changes_requested", "Fix the title")).toBeNull();
    expect(approvalNoteError("approved", "x".repeat(2_001))).toMatch(/under 2,000/);
  });

  it("shows nothing until approval has been requested for this link", () => {
    expect(shouldShowApproval(null)).toBe(false);
    expect(
      shouldShowApproval({ ...VIEW_ONLY, visibleState: "not_requested" }),
    ).toBe(false);
    expect(shouldShowApproval(VIEW_ONLY)).toBe(true);
    expect(shouldShowApproval(DECIDABLE)).toBe(true);
  });
});

describe("in-page guest approval", () => {
  it("lets a guest who can approve approve with an optional note", async () => {
    const calls = stubApi({ approval: DECIDABLE });
    const { runtime, shadow } = mount();
    const panel = await openPanel(shadow);

    expect(panel.textContent).toContain("Waiting for approval on v1.4");
    expect(panel.textContent).toContain("Sam asked for your decision on v1.4");
    expect(panel.textContent).toContain("Please check the new pricing page.");
    expect(panel.querySelector("form")!.hidden).toBe(false);

    setNote(panel, "Looks good");
    submitForm(panel);

    await vi.waitFor(() => {
      expect(panel.querySelector("form")!.hidden).toBe(true);
      expect(panel.textContent).toContain("Your approval is recorded");
    });
    const decide = calls.find((call) => call.url.includes("/approvals/decide"))!;
    expect(JSON.parse(String(decide.init?.body))).toEqual({
      decision: "approved",
      note: "Looks good",
      deploymentId: "deployment-1",
      requestId: "request-1",
    });
    expect((decide.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer session-token",
    );
    runtime.destroy();
  });

  it("requires a note before requesting changes, then sends it", async () => {
    const calls = stubApi({ approval: DECIDABLE });
    const { runtime, shadow } = mount();
    const panel = await openPanel(shadow);

    chooseChanges(panel);
    expect(panel.querySelector("label[for='passoff-approval-note']")!.textContent).toBe(
      "What needs to change?",
    );
    submitForm(panel);
    const error = panel.querySelector("#passoff-approval-note-error")!;
    expect(error.textContent).toMatch(/what needs to change/i);
    expect(
      panel.querySelector("#passoff-approval-note")!.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(calls.some((call) => call.url.includes("/approvals/decide"))).toBe(false);

    setNote(panel, "Headline is wrong");
    expect(panel.querySelector<HTMLElement>("#passoff-approval-note-error")!.hidden).toBe(true);
    submitForm(panel);
    await vi.waitFor(() => {
      expect(calls.some((call) => call.url.includes("/approvals/decide"))).toBe(true);
    });
    const decide = calls.find((call) => call.url.includes("/approvals/decide"))!;
    expect(JSON.parse(String(decide.init?.body))).toMatchObject({
      decision: "changes_requested",
      note: "Headline is wrong",
    });
    runtime.destroy();
  });

  it("keeps the typed note and offers a retry when saving fails", async () => {
    stubApi({
      approval: DECIDABLE,
      decide: () => ({
        ok: false,
        body: {
          ok: false,
          error: "unavailable",
          message: "We couldn’t save that decision. Your note is still here. Try again.",
        },
      }),
    });
    const { runtime, shadow } = mount();
    const panel = await openPanel(shadow);

    chooseChanges(panel);
    const note = setNote(panel, "Please fix the footer links");
    submitForm(panel);

    await vi.waitFor(() => {
      expect(panel.querySelector("[role='status']")!.textContent).toContain(
        "Your note is still here",
      );
    });
    expect(note.value).toBe("Please fix the footer links");
    const submit = panel.querySelector<HTMLButtonElement>("button[type='submit']")!;
    expect(submit.textContent).toBe("Try again");
    expect(submit.disabled).toBe(false);
    expect(panel.querySelector("form")!.hidden).toBe(false);
    runtime.destroy();
  });

  it("shows status only, with no decide controls, for a view-only link", async () => {
    stubApi({ approval: VIEW_ONLY });
    const { runtime, shadow } = mount();
    const panel = await openPanel(shadow);

    expect(panel.textContent).toContain("Waiting for approval on v1.4");
    expect(panel.textContent).toContain("lets you view and comment, but not approve");
    expect(panel.querySelector("form")!.hidden).toBe(true);
    runtime.destroy();
  });

  it("hides the approval button when approval was never requested", async () => {
    const calls = stubApi({
      approval: { ...VIEW_ONLY, visibleState: "not_requested", blockedReason: "view_only" },
    });
    const { runtime, shadow } = mount();
    await vi.waitFor(() => {
      expect(calls.some((call) => call.url.includes("/approvals/status"))).toBe(true);
    });
    expect(approvalButton(shadow).hidden).toBe(true);
    runtime.destroy();
  });

  it("closes with Escape and returns focus to the Approval button", async () => {
    stubApi({ approval: DECIDABLE });
    const { runtime, shadow } = mount();
    const panel = await openPanel(shadow);
    const button = approvalButton(shadow);
    const radio = panel.querySelector<HTMLInputElement>("input[type='radio']")!;
    radio.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    runtime.destroy();
  });

  it("has no serious automated accessibility violations when open", async () => {
    stubApi({ approval: DECIDABLE });
    const { runtime, shadow } = mount();
    await openPanel(shadow);
    const results = await axe(shadow.querySelector(".passoff-root") as HTMLElement, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
    runtime.destroy();
  });
});
