/**
 * Documented semantic color pairs for WCAG 2.2 AA checks.
 *
 * Hex literals belong in token definitions (globals.css and this table),
 * not in product components. Values are chosen to match the theme tokens.
 */
export type ContrastPair = {
  id: string;
  foreground: string;
  background: string;
  minimum: number;
  usage: string;
};

export const LIGHT_THEME_PAIRS: ContrastPair[] = [
  { id: "page-text", foreground: "#1c1917", background: "#fafaf9", minimum: 4.5, usage: "Page text" },
  { id: "muted-text", foreground: "#57534e", background: "#fafaf9", minimum: 4.5, usage: "Supporting text" },
  { id: "card-text", foreground: "#1c1917", background: "#ffffff", minimum: 4.5, usage: "Card text" },
  { id: "primary-action", foreground: "#fff7ed", background: "#c2410c", minimum: 4.5, usage: "Primary action" },
  { id: "focus-ring", foreground: "#c2410c", background: "#fafaf9", minimum: 3, usage: "Focus indicator" },
  { id: "input", foreground: "#78716c", background: "#fafaf9", minimum: 3, usage: "Form control and outline button boundaries" },
  { id: "input-on-card", foreground: "#78716c", background: "#ffffff", minimum: 3, usage: "Form control boundaries on cards" },
  { id: "brand-dark-text", foreground: "#d6d3d1", background: "#211d1a", minimum: 4.5, usage: "Supporting text on dark brand sections" },
  { id: "brand-dark-accent", foreground: "#fdba74", background: "#211d1a", minimum: 4.5, usage: "Accent text on dark brand sections" },
  { id: "danger-text", foreground: "#b91c1c", background: "#fafaf9", minimum: 4.5, usage: "Danger text" },
  { id: "info", foreground: "#eff6ff", background: "#1e40af", minimum: 4.5, usage: "Information" },
  { id: "success", foreground: "#f0fdf4", background: "#166534", minimum: 4.5, usage: "Success" },
  { id: "warning", foreground: "#fff7ed", background: "#9a3412", minimum: 4.5, usage: "Warning" },
  { id: "status-open", foreground: "#eff6ff", background: "#1e40af", minimum: 4.5, usage: "Open status" },
  { id: "status-in-progress", foreground: "#fff7ed", background: "#9a3412", minimum: 4.5, usage: "In progress status" },
  { id: "status-ready", foreground: "#f5f3ff", background: "#5b21b6", minimum: 4.5, usage: "Ready for review status" },
  { id: "status-resolved", foreground: "#f0fdf4", background: "#166534", minimum: 4.5, usage: "Resolved status" },
  { id: "status-not-planned", foreground: "#fafaf9", background: "#44403c", minimum: 4.5, usage: "Not planned status" },
  { id: "preview-canvas", foreground: "#1c1917", background: "#f5f1eb", minimum: 4.5, usage: "Product preview canvas" },
];

export const DARK_THEME_PAIRS: ContrastPair[] = [
  { id: "page-text", foreground: "#fafaf9", background: "#1c1917", minimum: 4.5, usage: "Page text" },
  { id: "muted-text", foreground: "#a8a29e", background: "#1c1917", minimum: 4.5, usage: "Supporting text" },
  { id: "muted-text-on-card", foreground: "#a8a29e", background: "#292524", minimum: 4.5, usage: "Supporting text on cards" },
  { id: "card-text", foreground: "#fafaf9", background: "#292524", minimum: 4.5, usage: "Card text" },
  { id: "primary-action", foreground: "#1c1917", background: "#f97316", minimum: 4.5, usage: "Primary action" },
  { id: "focus-ring", foreground: "#f97316", background: "#1c1917", minimum: 3, usage: "Focus indicator" },
  { id: "input", foreground: "#78716c", background: "#1c1917", minimum: 3, usage: "Form control and outline button boundaries" },
  { id: "brand-dark-text", foreground: "#d6d3d1", background: "#0f0d0c", minimum: 4.5, usage: "Supporting text on dark brand sections" },
  { id: "danger-text", foreground: "#f87171", background: "#1c1917", minimum: 4.5, usage: "Danger text" },
  { id: "info", foreground: "#1e3a8a", background: "#93c5fd", minimum: 4.5, usage: "Information" },
  { id: "success", foreground: "#14532d", background: "#86efac", minimum: 4.5, usage: "Success" },
  { id: "warning", foreground: "#7c2d12", background: "#fdba74", minimum: 4.5, usage: "Warning" },
  { id: "status-open", foreground: "#1e3a8a", background: "#93c5fd", minimum: 4.5, usage: "Open status" },
  { id: "status-in-progress", foreground: "#7c2d12", background: "#fdba74", minimum: 4.5, usage: "In progress status" },
  { id: "status-ready", foreground: "#4c1d95", background: "#c4b5fd", minimum: 4.5, usage: "Ready for review status" },
  { id: "status-resolved", foreground: "#14532d", background: "#86efac", minimum: 4.5, usage: "Resolved status" },
  { id: "status-not-planned", foreground: "#1c1917", background: "#d6d3d1", minimum: 4.5, usage: "Not planned status" },
  { id: "preview-canvas", foreground: "#fafaf9", background: "#231f1c", minimum: 4.5, usage: "Product preview canvas" },
];
