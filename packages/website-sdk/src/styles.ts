import { PASSOFF_SDK_VERSION } from "../version";

export const HOST_ROOT_ID = "passoff-sdk-root";
export const VERSION = PASSOFF_SDK_VERSION;

/**
 * Isolated Shadow DOM styles. Token hex values match src/lib/design-tokens.ts
 * so the prototype UI stays visually aligned with the product foundation
 * without inheriting hostile host CSS.
 */
export const REVIEW_STYLES = `
:host {
  all: initial;
  color-scheme: light dark;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.passoff-root {
  --background: #fafaf9;
  --foreground: #1c1917;
  --card: #ffffff;
  --subtle: #f5f5f4;
  --muted-foreground: #57534e;
  --primary: #c2410c;
  --primary-foreground: #fff7ed;
  --border: #d6d3d1;
  --control-border: #78716c;
  --ring: #c2410c;
  --danger: #b91c1c;
  --overlay: rgb(24 24 27 / 0.18);
  --warning: #9a3412;
  --success: #166534;
  --radius: 12px;
  --shadow: 0 16px 40px rgb(28 25 23 / 0.16), 0 2px 8px rgb(28 25 23 / 0.08);
  --motion: 180ms;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  color: var(--foreground);
  line-height: 1.4;
}

/* Author styles otherwise override the browser's [hidden] rule. */
.passoff-root [hidden] {
  display: none !important;
}

@media (prefers-color-scheme: dark) {
  .passoff-root {
    --background: #18181b;
    --foreground: #fafafa;
    --card: #27272a;
    --subtle: #3f3f46;
    --muted-foreground: #a1a1aa;
    --primary: #f97316;
    --primary-foreground: #18181b;
    --border: #52525b;
    --control-border: #a1a1aa;
    --ring: #f97316;
    --danger: #f87171;
    --overlay: rgb(0 0 0 / 0.4);
    --warning: #fdba74;
    --success: #86efac;
    --shadow: 0 18px 44px rgb(0 0 0 / 0.42), 0 2px 8px rgb(0 0 0 / 0.28);
  }
}

.passoff-root[data-theme="light"] {
  --background: #fafaf9;
  --foreground: #1c1917;
  --card: #ffffff;
  --subtle: #f5f5f4;
  --muted-foreground: #57534e;
  --primary: #c2410c;
  --primary-foreground: #fff7ed;
  --border: #d6d3d1;
  --control-border: #78716c;
  --ring: #c2410c;
  --danger: #b91c1c;
  --overlay: rgb(24 24 27 / 0.18);
  --warning: #9a3412;
  --success: #166534;
}

.passoff-root[data-theme="dark"] {
  --background: #18181b;
  --foreground: #fafafa;
  --card: #27272a;
  --subtle: #3f3f46;
  --muted-foreground: #a1a1aa;
  --primary: #f97316;
  --primary-foreground: #18181b;
  --border: #52525b;
  --control-border: #a1a1aa;
  --ring: #f97316;
  --danger: #f87171;
  --overlay: rgb(0 0 0 / 0.4);
  --warning: #fdba74;
  --success: #86efac;
}

@media (prefers-reduced-motion: reduce) {
  .passoff-root {
    --motion: 0.01ms;
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.toolbar,
.panel,
.highlight,
.marker,
.launcher {
  pointer-events: auto;
}

.toolbar {
  position: fixed;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - 24px);
  padding: 2px;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
}

.toolbar[data-placement="desktop"] {
  right: 16px;
  bottom: 16px;
}

.toolbar[data-placement="mobile"] {
  left: 8px;
  right: 8px;
  bottom: 8px;
  top: auto;
  justify-content: flex-end;
}

.toolbar[data-placement="custom"] {
  right: auto;
  bottom: auto;
}

.move-handle {
  padding: 0;
  color: var(--muted-foreground);
  cursor: grab;
  touch-action: none;
}

.toolbar[data-dragging="true"],
.toolbar[data-dragging="true"] .move-handle {
  cursor: grabbing;
  user-select: none;
}

.move-handle svg {
  width: 20px;
  height: 20px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.04em;
  white-space: nowrap;
  margin-inline: 8px 6px;
}

.brand svg {
  display: block;
  flex: none;
}

.mode-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.button {
  appearance: none;
  min-height: 44px;
  min-width: 44px;
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--motion), border-color var(--motion), color var(--motion);
}

.button[data-variant="primary"] {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: transparent;
}

.button[aria-pressed="true"]:not([data-variant="primary"]) {
  background: var(--subtle);
}

.button:hover {
  background: var(--subtle);
}

.button[data-variant="primary"]:hover {
  background: color-mix(in srgb, var(--primary) 88%, black);
}

/* Keep a 44px accessible target while making toolbar controls look compact. */
.toolbar .button {
  position: relative;
  isolation: isolate;
  padding-inline: 10px;
  line-height: 1.1;
}

.toolbar .button,
.toolbar .button:hover,
.toolbar .button[aria-pressed="true"]:not([data-variant="primary"]),
.toolbar .button[data-variant="primary"],
.toolbar .button[data-variant="primary"]:hover {
  background: transparent;
}

.toolbar .button::before {
  content: "";
  position: absolute;
  inset: 4px 0;
  z-index: -1;
  border-radius: 8px;
  background: transparent;
  transition: background-color var(--motion);
}

.toolbar .button:hover::before,
.toolbar .button[aria-pressed="true"]:not([data-variant="primary"])::before {
  background: var(--subtle);
}

.toolbar .button[data-variant="primary"]::before {
  background: var(--primary);
}

.toolbar .button[data-variant="primary"]:hover::before {
  background: color-mix(in srgb, var(--primary) 88%, black);
}

.button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.launcher {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  padding-inline: 7px;
  background: transparent;
  line-height: 1;
}

.launcher:hover,
.launcher:active {
  background: transparent;
}

.launcher::before {
  content: "";
  position: absolute;
  inset: 6px 0;
  z-index: -1;
  border: 1px solid var(--control-border);
  border-radius: 7px;
  background: var(--card);
  box-shadow: 0 3px 10px rgb(28 25 23 / 0.16);
  transition: background-color var(--motion), border-color var(--motion);
}

.launcher:hover::before {
  background: var(--subtle);
}

.launcher-brand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.025em;
  white-space: nowrap;
}

.launcher-brand svg {
  width: 18px;
  height: 12px;
  color: var(--foreground);
}

.highlight {
  position: fixed;
  z-index: 1;
  border: 2px solid var(--primary);
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  pointer-events: none;
}

.marker {
  position: fixed;
  z-index: 3;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--primary-foreground);
  font-weight: 700;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
}

.marker::before {
  content: "";
  position: absolute;
  inset: 7px;
  border: 2px solid var(--card);
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 4px 12px rgb(28 25 23 / 0.24);
}

.marker-number {
  position: relative;
  z-index: 1;
  line-height: 1;
}

.marker[data-missing="true"]::before {
  background: var(--danger);
}

.panel {
  position: fixed;
  z-index: 4;
  width: min(348px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 96px));
  overflow-y: auto;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 18px;
}

.panel[data-placement="desktop"] {
  right: 16px;
  bottom: 76px;
}

.panel[data-placement="mobile"] {
  left: 8px;
  right: 8px;
  bottom: 68px;
  width: auto;
  max-height: calc(100vh - 84px);
}

.panel h2 {
  margin: 0 0 6px;
  font-size: 18px;
  line-height: 1.3;
}

.panel p {
  margin: 0 0 14px;
  color: var(--muted-foreground);
  font-size: 14px;
}

.status {
  display: block;
  padding: 10px 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--success) 11%, var(--card));
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
  margin-bottom: 12px;
}

.feedback-form {
  display: grid;
  gap: 10px;
}

.field-label {
  font-size: 14px;
  font-weight: 700;
}

.feedback-form textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  border: 1px solid var(--control-border);
  border-radius: 9px;
  padding: 10px 12px;
  font: inherit;
  color: var(--foreground);
  background: var(--background);
}

.feedback-form textarea:focus-visible {
  border-color: var(--ring);
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--ring);
}

.field-error,
.form-status {
  margin: 0;
  font-size: 13px;
}

.field-error {
  color: var(--danger);
}

.form-status {
  padding: 10px 12px;
  border-radius: 9px;
  color: var(--foreground);
  background: var(--subtle);
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.form-actions .button,
.panel > .button {
  position: relative;
  isolation: isolate;
  padding-inline: 12px;
  line-height: 1.1;
  border-color: transparent;
  background: transparent;
}

.form-actions .button:hover,
.form-actions .button[data-variant="primary"],
.form-actions .button[data-variant="primary"]:hover,
.panel > .button:hover {
  background: transparent;
}

.form-actions .button::before,
.panel > .button::before {
  content: "";
  position: absolute;
  inset: 4px 0;
  z-index: -1;
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: transparent;
  transition: background-color var(--motion), border-color var(--motion);
}

.form-actions .button:hover::before,
.panel > .button:hover::before {
  background: var(--subtle);
}

.form-actions .button[data-variant="primary"]::before {
  border-color: transparent;
  background: var(--primary);
}

.form-actions .button[data-variant="primary"]:hover::before {
  background: color-mix(in srgb, var(--primary) 88%, black);
}

.marker[data-status] {
  /* Status also appears in the accessible name; color is not the only cue. */
}

.marker::after {
  content: attr(data-status);
  position: absolute;
  left: 50%;
  top: calc(100% + 0.2rem);
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--foreground);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  padding: 0.1rem 0.35rem;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--motion), visibility var(--motion);
}

.marker:hover::after,
.marker:focus-visible::after {
  opacity: 1;
  visibility: visible;
}

.selecting-banner {
  position: fixed;
  left: 50%;
  top: 0.75rem;
  transform: translateX(-50%);
  z-index: 2;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: 999px;
  padding: 0.5rem 0.9rem;
  font-size: 0.875rem;
  font-weight: 600;
  pointer-events: none;
}

.heatmap {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.heatmap-hotspot {
  position: fixed;
  z-index: 3;
  min-width: 2.75rem;
  min-height: 2.75rem;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  border: 2px solid var(--primary);
  background: color-mix(in srgb, var(--primary) 28%, transparent);
  color: var(--foreground);
  font-weight: 700;
  pointer-events: auto;
  display: grid;
  place-items: center;
  gap: 0.15rem;
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--foreground) 35%, transparent);
}

.heatmap-hotspot-label {
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.heatmap-hotspot[data-intensity="medium"] {
  background: color-mix(in srgb, var(--primary) 48%, transparent);
}

.heatmap-hotspot[data-intensity="high"] {
  background: color-mix(in srgb, var(--primary) 68%, transparent);
}

.heatmap-filters {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.heatmap-filters select,
.heatmap-hotspot-list .button,
.heatmap-list .button {
  min-height: 2.75rem;
}

.heatmap-help {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

.heatmap-hotspot-list {
  position: fixed;
  z-index: 5;
  right: 0.75rem;
  bottom: 4.5rem;
  width: min(22rem, calc(100vw - 1.5rem));
  max-height: min(16rem, 36vh);
  overflow: auto;
  pointer-events: auto;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
}

.heatmap-list {
  position: fixed;
  z-index: 4;
  left: 0.75rem;
  bottom: 4.5rem;
  width: min(22rem, calc(100vw - 1.5rem));
  max-height: min(22rem, 46vh);
  overflow: auto;
  pointer-events: auto;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
}

.heatmap-list h2,
.heatmap-list h3,
.heatmap-hotspot-list h2 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}

.marker-focused {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .heatmap-hotspot,
  .marker-focused {
    transition: none;
  }
}

@media (max-width: 40rem) {
  .toolbar {
    flex-wrap: wrap;
  }

  .brand {
    margin-right: auto;
  }

  .selecting-banner {
    top: auto;
    bottom: 68px;
  }
}

@media (max-width: 24rem) {
  .brand {
    gap: 0;
    margin-inline: 4px;
  }

  .brand > span {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .brand svg {
    width: 32px;
    height: 20px;
  }

  .toolbar {
    justify-content: center;
  }

  .toolbar .button {
    flex: 1 1 auto;
  }
}
`;
