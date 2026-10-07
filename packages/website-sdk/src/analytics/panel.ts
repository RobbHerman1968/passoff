import type { AnalyticsBootstrap } from "./contract";
import { markNoticeSeen, type PrivacyChoice } from "./consent";

const HOST_ID = "passoff-privacy-root";

export function mountPrivacyPanel(options: {
  config: AnalyticsBootstrap;
  mode: "consent" | "notice" | "manage";
  current: PrivacyChoice;
  onAllow: () => void;
  onDeny: () => void;
}) {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-passoff-ui", "true");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;
  const root = document.createElement("div");
  root.className = "wrap";
  const dialog = document.createElement("div");
  dialog.className = "panel";
  dialog.setAttribute("role", options.mode === "manage" ? "dialog" : "region");
  dialog.setAttribute("aria-labelledby", "passoff-privacy-title");
  dialog.setAttribute("aria-describedby", "passoff-privacy-body");

  const org = options.config.organizationName?.trim();
  const title = document.createElement("h2");
  title.id = "passoff-privacy-title";
  title.textContent =
    options.mode === "manage" ? "Privacy choices" : "Help improve this site";

  const body = document.createElement("p");
  body.id = "passoff-privacy-body";
  body.textContent =
    options.mode === "notice"
      ? `${org ? `${org} is` : "The site owner is"} collecting limited information about how people use this site—such as where they click, how far they scroll, repeated clicks, and technical errors. This is not used to identify you, linked to your account, or used for advertising.`
      : "The site owner would like to collect limited information about how people use this site—such as where they click, how far they scroll, repeated clicks, and technical errors. This helps find usability problems and improve the experience. This information is not used to identify you, linked to your account, or used for advertising.\n\nMay we collect this usability data?";

  const live = document.createElement("p");
  live.className = "sr";
  live.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "actions";

  const allow = document.createElement("button");
  allow.type = "button";
  allow.textContent = "Allow usability data";
  const deny = document.createElement("button");
  deny.type = "button";
  deny.textContent = options.mode === "notice" ? "Opt out" : "No thanks";
  const more = document.createElement("a");
  more.textContent = "Learn more";
  more.href = options.config.privacyPolicyUrl || "#passoff-privacy-details";
  if (!options.config.privacyPolicyUrl) more.setAttribute("role", "button");

  const details = document.createElement("div");
  details.id = "passoff-privacy-details";
  details.hidden = Boolean(options.config.privacyPolicyUrl);
  details.innerHTML =
    "<p>Passoff may record page views, clicks on labeled controls, scroll depth, possible repeated or unresponsive clicks, and sanitized technical errors. It does not record names, emails, passwords, form values, keystrokes, chat, payment details, or a recording of your visit.</p>";

  if (options.mode === "manage") {
    const status = document.createElement("p");
    status.textContent =
      options.current === "allow"
        ? "Current choice: usability data is allowed."
        : options.current === "deny"
          ? "Current choice: usability data is not collected."
          : "Current choice: no preference saved yet.";
    dialog.append(title, status, body, details, actions, live);
  } else {
    dialog.append(title, body, details, actions, live);
  }

  actions.append(allow, deny, more);
  root.append(dialog);
  shadow.append(style, root);
  document.documentElement.append(host);
  if (options.mode === "manage") {
    queueMicrotask(() => allow.focus());
  }

  const finish = (choice: "allow" | "deny") => {
    markNoticeSeen();
    live.textContent =
      choice === "allow"
        ? "Usability data collection is allowed."
        : "Usability data will not be collected.";
    if (choice === "allow") options.onAllow();
    else options.onDeny();
    host.remove();
  };

  allow.addEventListener("click", () => finish("allow"));
  deny.addEventListener("click", () => finish("deny"));
  more.addEventListener("click", (event) => {
    if (options.config.privacyPolicyUrl) return;
    event.preventDefault();
    details.hidden = !details.hidden;
  });

  live.textContent = "Usability privacy choices are available.";

  return {
    destroy() {
      host.remove();
    },
  };
}

export function mountPrivacyChoiceLauncher(open: () => void): {
  destroy: () => void;
  focus: () => void;
} {
  const existing = document.getElementById("passoff-privacy-choice-launcher");
  existing?.remove();

  const host = document.createElement("div");
  host.id = "passoff-privacy-choice-launcher";
  host.setAttribute("data-passoff-ui", "true");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    button {
      position: fixed;
      z-index: 2147482999;
      right: 12px;
      bottom: 12px;
      min-height: 44px;
      min-width: 44px;
      padding: 8px 12px;
      border: 1px solid #737373;
      border-radius: 999px;
      background: #111;
      color: #fafafa;
      font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.28);
    }
    button:hover { background: #262626; }
    button:focus-visible { outline: 3px solid #ff7a18; outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  `;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Privacy choices";
  button.setAttribute("aria-label", "Open usability privacy choices");
  button.addEventListener("click", open);
  shadow.append(style, button);
  document.documentElement.append(host);

  return {
    focus() {
      button.focus();
    },
    destroy() {
      host.remove();
    },
  };
}

const PANEL_STYLES = `
:host { all: initial; }
.wrap { position: fixed; z-index: 2147483000; inset: auto 12px 12px 12px; pointer-events: none; font-family: ui-sans-serif, system-ui, sans-serif; }
.panel { pointer-events: auto; max-width: 28rem; margin-left: auto; padding: 16px; border-radius: 12px; background: #111; color: #fafafa; box-shadow: 0 12px 40px rgb(0 0 0 / 0.35); color-scheme: dark; }
h2 { margin: 0 0 8px; font-size: 16px; }
p { margin: 0 0 12px; font-size: 14px; line-height: 1.45; color: #e7e5e4; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button, a { min-height: 44px; padding: 8px 12px; border-radius: 8px; font: inherit; font-size: 14px; cursor: pointer; }
button { border: 1px solid #a8a29e; background: #1c1917; color: #fafafa; }
button:focus-visible, a:focus-visible { outline: 2px solid #fb923c; outline-offset: 2px; }
a { color: #fed7aa; display: inline-flex; align-items: center; }
.choice-link { pointer-events: auto; position: fixed; right: 12px; bottom: 12px; background: #1c1917; color: #fafafa; border: 1px solid #a8a29e; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
@media (max-width: 360px) { .wrap { inset: auto 8px 8px 8px; } .panel { max-width: none; } }
`;
