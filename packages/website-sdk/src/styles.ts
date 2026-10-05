export const HOST_ROOT_ID = "passoff-sdk-root";
export const VERSION = "1.0.0";

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
  --muted-foreground: #57534e;
  --primary: #c2410c;
  --primary-foreground: #fff7ed;
  --border: #78716c;
  --ring: #c2410c;
  --danger: #b91c1c;
  --overlay: rgb(24 24 27 / 0.18);
  --warning: #9a3412;
  --success: #166534;
  --radius: 12px;
  --shadow: 0 12px 32px rgb(28 25 23 / 0.18);
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
    --muted-foreground: #a1a1aa;
    --primary: #f97316;
    --primary-foreground: #18181b;
    --border: #a1a1aa;
    --ring: #f97316;
    --danger: #f87171;
    --overlay: rgb(0 0 0 / 0.4);
    --warning: #fdba74;
    --success: #86efac;
    --shadow: 0 8px 24px rgb(0 0 0 / 0.4);
  }
}

.passoff-root[data-theme="light"] {
  --background: #fafaf9;
  --foreground: #1c1917;
  --card: #ffffff;
  --muted-foreground: #57534e;
  --primary: #c2410c;
  --primary-foreground: #fff7ed;
  --border: #78716c;
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
  --muted-foreground: #a1a1aa;
  --primary: #f97316;
  --primary-foreground: #18181b;
  --border: #a1a1aa;
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
  gap: 6px;
  max-width: calc(100vw - 24px);
  padding: 6px;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
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

.brand {
  font-weight: 700;
  font-size: 14px;
  margin-inline: 6px 4px;
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
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.button[data-variant="primary"] {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: transparent;
}

.button[aria-pressed="true"] {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
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
  border: 2px solid var(--card);
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 700;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  box-shadow: var(--shadow);
}

.marker[data-missing="true"] {
  background: var(--danger);
  color: #fff7ed;
}

.panel {
  position: fixed;
  z-index: 4;
  width: min(360px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 96px));
  overflow-y: auto;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
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
  background: color-mix(in srgb, var(--success) 16%, transparent);
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
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 10px 12px;
  font: inherit;
  color: var(--foreground);
  background: var(--background);
}

.feedback-form textarea:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
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
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .toolbar {
    justify-content: center;
  }

  .toolbar .button {
    flex: 1 1 auto;
  }
}
`;
