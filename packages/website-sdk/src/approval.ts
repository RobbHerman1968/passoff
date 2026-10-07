import {
  decideApproval,
  fetchApprovalStatus,
  type SdkApproval,
  type SdkApprovalBlockedReason,
  type SdkApprovalDecision,
} from "./api";

/** Mirrors the limit enforced when a decision is saved. */
export const APPROVAL_NOTE_MAX_LENGTH = 2_000;

export const APPROVAL_BLOCKED_COPY: Record<SdkApprovalBlockedReason, string> = {
  view_only:
    "This link lets you view and comment, but not approve. Ask the team for an approval link if you need to sign off.",
  no_request: "The team hasn’t asked for approval on this version yet.",
  someone_else: "This approval request was sent to someone else.",
  already_decided: "A decision has already been recorded for this version.",
};

/** Errors that mean the page’s idea of the request is out of date. */
const STALE_ERRORS = new Set(["conflict", "stale_version", "not_found", "forbidden"]);

export function approvalNoteError(
  decision: SdkApprovalDecision,
  rawNote: string,
): string | null {
  const note = rawNote.trim();
  if (decision === "changes_requested" && !note) {
    return "Tell the team what needs to change before requesting changes.";
  }
  if (note.length > APPROVAL_NOTE_MAX_LENGTH) {
    return `Keep the note under ${APPROVAL_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters.`;
  }
  return null;
}

/** Status-only guests see the panel once there is something to say. */
export function shouldShowApproval(approval: SdkApproval | null): approval is SdkApproval {
  if (!approval) return false;
  return (approval.canDecide && Boolean(approval.request)) || approval.visibleState !== "not_requested";
}

export type ApprovalPanel = {
  button: HTMLButtonElement;
  panel: HTMLElement;
  refresh: () => Promise<void>;
  open: () => void;
  close: (options?: { restoreFocus?: boolean }) => void;
  isOpen: () => boolean;
  getApproval: () => SdkApproval | null;
  destroy: () => void;
};

/**
 * In-page approval for guests. The Approve / Request changes controls exist only when the
 * server says this exact link can decide right now; otherwise the panel is status-only.
 */
export function createApprovalPanel(options: {
  apiBaseUrl: string;
  sessionToken: string;
  live: HTMLElement;
  /** Return false to stop the panel from opening (for example while feedback is half-written). */
  canOpen?: () => boolean;
  onOpen?: () => void;
}): ApprovalPanel {
  let approval: SdkApproval | null = null;
  let opened = false;
  let submitting = false;
  let destroyed = false;
  let loadToken = 0;

  const button = document.createElement("button");
  button.className = "button";
  button.type = "button";
  button.textContent = "Approval";
  button.hidden = true;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "passoff-approval-panel");

  const panel = document.createElement("section");
  panel.className = "panel approval-panel";
  panel.id = "passoff-approval-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "passoff-approval-title");

  const title = document.createElement("h2");
  title.id = "passoff-approval-title";
  title.tabIndex = -1;
  title.textContent = "Approval";

  const statusEl = document.createElement("p");
  statusEl.className = "approval-state";

  const intro = document.createElement("p");
  const message = document.createElement("p");
  message.className = "approval-message";

  const blocked = document.createElement("p");

  const result = document.createElement("p");
  result.className = "form-status";
  result.setAttribute("role", "status");
  result.tabIndex = -1;
  result.hidden = true;

  const form = document.createElement("form");
  form.className = "feedback-form";
  form.noValidate = true;
  form.hidden = true;

  const fieldset = document.createElement("fieldset");
  fieldset.className = "choices";
  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = "Your decision";

  function choice(value: SdkApprovalDecision, text: string, checked: boolean) {
    const label = document.createElement("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "passoff-approval-decision";
    input.value = value;
    input.checked = checked;
    const span = document.createElement("span");
    span.textContent = text;
    label.append(input, span);
    return { label, input };
  }
  const approveChoice = choice("approved", "Approve this review", true);
  const changesChoice = choice("changes_requested", "Request changes", false);
  fieldset.append(legend, approveChoice.label, changesChoice.label);

  const noteLabel = document.createElement("label");
  noteLabel.className = "field-label";
  noteLabel.htmlFor = "passoff-approval-note";

  const note = document.createElement("textarea");
  note.id = "passoff-approval-note";
  note.name = "note";
  note.rows = 3;
  note.maxLength = APPROVAL_NOTE_MAX_LENGTH;

  const noteError = document.createElement("p");
  noteError.className = "field-error";
  noteError.id = "passoff-approval-note-error";
  noteError.hidden = true;

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const submit = document.createElement("button");
  submit.className = "button";
  submit.dataset.variant = "primary";
  submit.type = "submit";
  actions.append(submit);

  form.append(fieldset, noteLabel, note, noteError, actions);

  const closeButton = document.createElement("button");
  closeButton.className = "button";
  closeButton.type = "button";
  closeButton.textContent = "Close";

  panel.append(title, statusEl, intro, message, form, blocked, result, closeButton);

  const selectedDecision = (): SdkApprovalDecision =>
    changesChoice.input.checked ? "changes_requested" : "approved";

  const setNoteError = (text: string | null) => {
    if (!text) {
      noteError.hidden = true;
      noteError.textContent = "";
      note.removeAttribute("aria-invalid");
      note.removeAttribute("aria-describedby");
      return;
    }
    noteError.hidden = false;
    noteError.textContent = text;
    note.setAttribute("aria-invalid", "true");
    note.setAttribute("aria-describedby", noteError.id);
  };

  const setResult = (text: string | null) => {
    result.hidden = !text;
    result.textContent = text ?? "";
  };

  const renderDecisionLabels = () => {
    const changes = selectedDecision() === "changes_requested";
    noteLabel.textContent = changes ? "What needs to change?" : "Note (optional)";
    note.required = changes;
    if (changes) note.setAttribute("aria-required", "true");
    else note.removeAttribute("aria-required");
    if (!submitting) {
      submit.textContent = changes ? "Send change request" : "Approve this review";
    }
  };

  function render() {
    if (!shouldShowApproval(approval)) {
      button.hidden = true;
      if (opened) close({ restoreFocus: false });
      return;
    }
    button.hidden = false;
    statusEl.textContent = approval.statusLabel;

    const request = approval.canDecide ? approval.request : null;
    if (request) {
      intro.hidden = false;
      intro.textContent = `${request.requesterDisplayName} asked for your decision on ${request.versionLabel}. Your decision covers this version only.`;
      message.hidden = !request.message;
      message.textContent = request.message ?? "";
      form.hidden = false;
      blocked.hidden = true;
      blocked.textContent = "";
    } else {
      intro.hidden = true;
      message.hidden = true;
      form.hidden = true;
      const reason = approval.blockedReason;
      blocked.hidden = !reason;
      blocked.textContent = reason ? APPROVAL_BLOCKED_COPY[reason] : "";
    }
    renderDecisionLabels();
  }

  async function refresh() {
    if (destroyed) return;
    const token = ++loadToken;
    const loaded = await fetchApprovalStatus({
      apiBaseUrl: options.apiBaseUrl,
      sessionToken: options.sessionToken,
    });
    if (destroyed || token !== loadToken) return;
    // A failed refresh keeps what the guest already sees rather than hiding their decision.
    if (!loaded.ok) return;
    approval = loaded.approval;
    render();
  }

  function open() {
    if (destroyed || opened || button.hidden) return;
    if (options.canOpen && !options.canOpen()) return;
    opened = true;
    if (approval?.canDecide) setResult(null);
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    options.onOpen?.();
    queueMicrotask(() => {
      if (!opened) return;
      if (!form.hidden) {
        (selectedDecision() === "approved"
          ? approveChoice.input
          : changesChoice.input
        ).focus();
      } else {
        title.focus();
      }
    });
    void refresh();
  }

  function close(closeOptions: { restoreFocus?: boolean } = {}) {
    if (!opened) return;
    opened = false;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (closeOptions.restoreFocus !== false && !button.hidden) button.focus();
  }

  async function send() {
    if (submitting || !approval?.canDecide || !approval.request) return;
    const decision = selectedDecision();
    const text = note.value.trim();
    const invalid = approvalNoteError(decision, text);
    if (invalid) {
      setNoteError(invalid);
      note.focus();
      return;
    }
    setNoteError(null);

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setResult("You’re offline. Your note is still here. Reconnect, then try again.");
      submit.textContent = "Try again";
      options.live.textContent = "You’re offline.";
      return;
    }

    submitting = true;
    submit.disabled = true;
    submit.textContent = "Sending decision…";
    setResult("Sending your decision…");

    const sent = await decideApproval({
      apiBaseUrl: options.apiBaseUrl,
      sessionToken: options.sessionToken,
      decision,
      note: text,
      deploymentId: approval.request.deploymentId,
      requestId: approval.request.id,
    });

    submitting = false;
    submit.disabled = false;
    if (destroyed) return;

    if (!sent.ok) {
      // Keep the typed note so nothing is lost on a recoverable error.
      setResult(
        sent.message ??
          "Passoff couldn’t save your decision. Your note is still here. Try again.",
      );
      submit.textContent = "Try again";
      options.live.textContent = "Your decision wasn’t saved. You can try again.";
      if (sent.error && STALE_ERRORS.has(sent.error)) void refresh();
      return;
    }

    note.value = "";
    setResult(sent.message);
    options.live.textContent = sent.message;
    // Hide the form straight away so a second decision can’t be sent by mistake.
    form.hidden = true;
    if (approval) approval = { ...approval, canDecide: false, request: null, blockedReason: "already_decided" };
    render();
    result.focus();
    void refresh();
  }

  button.addEventListener("click", () => (opened ? close() : open()));
  closeButton.addEventListener("click", () => close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void send();
  });
  for (const input of [approveChoice.input, changesChoice.input]) {
    input.addEventListener("change", () => {
      setNoteError(null);
      renderDecisionLabels();
    });
  }
  note.addEventListener("input", () => {
    if (!noteError.hidden) setNoteError(null);
    if (!submitting) renderDecisionLabels();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  });

  renderDecisionLabels();

  return {
    button,
    panel,
    refresh,
    open,
    close,
    isOpen: () => opened,
    getApproval: () => approval,
    destroy() {
      destroyed = true;
    },
  };
}
