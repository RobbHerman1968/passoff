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
  --radius: 0.625rem;
  --shadow: 0 8px 24px rgb(28 25 23 / 0.14);
  --motion: 180ms;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--foreground);
  line-height: 1.4;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  max-width: calc(100vw - 1rem);
  padding: 0.5rem;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.toolbar[data-placement="desktop"] {
  top: 0.75rem;
  right: 0.75rem;
}

.toolbar[data-placement="mobile"] {
  left: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  top: auto;
}

.brand {
  font-weight: 700;
  font-size: 0.875rem;
  margin-inline-end: 0.25rem;
}

.mode-label {
  font-size: 0.875rem;
  color: var(--muted-foreground);
}

.button {
  appearance: none;
  min-height: 44px;
  min-width: 44px;
  padding: 0 0.85rem;
  border-radius: calc(var(--radius) * 0.8);
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
  right: 0.75rem;
  bottom: 0.75rem;
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
  width: min(22rem, calc(100vw - 1rem));
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1rem;
}

.panel[data-placement="desktop"] {
  top: 5rem;
  right: 0.75rem;
}

.panel[data-placement="mobile"] {
  left: 0.5rem;
  right: 0.5rem;
  bottom: 5.5rem;
  width: auto;
}

.panel h2 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
}

.panel p {
  margin: 0 0 0.75rem;
  color: var(--muted-foreground);
  font-size: 0.95rem;
}

.status {
  display: inline-flex;
  min-height: 1.75rem;
  align-items: center;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--foreground);
  font-size: 0.8rem;
  font-weight: 700;
}

.feedback-form {
  display: grid;
  gap: 0.65rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 700;
}

.feedback-form textarea {
  width: 100%;
  min-height: 6rem;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 0.8);
  padding: 0.65rem 0.75rem;
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
  font-size: 0.85rem;
}

.field-error {
  color: var(--danger);
}

.form-status {
  color: var(--muted-foreground);
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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
  .selecting-banner {
    top: auto;
    bottom: 5.5rem;
  }
}
`;
