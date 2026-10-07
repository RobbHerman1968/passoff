export const LABEL_NAME_MAX_LENGTH = 32;
export const MAX_LABELS_PER_ISSUE = 10;

/**
 * Label colors are named tokens, not raw values. The chip always shows the label
 * name as text, so color is a secondary cue only.
 */
export const LABEL_COLORS = [
  "slate",
  "blue",
  "green",
  "amber",
  "red",
  "violet",
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  slate: "Gray",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  red: "Red",
  violet: "Violet",
};

/** Decorative dot classes. Text and borders stay on neutral design tokens. */
export const LABEL_COLOR_DOT_CLASSES: Record<LabelColor, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  green: "bg-green-600",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
};

export type LabelView = {
  id: string;
  name: string;
  color: LabelColor;
};

export function isLabelColor(value: unknown): value is LabelColor {
  return typeof value === "string" && (LABEL_COLORS as readonly string[]).includes(value);
}

export function normalizeLabelColor(value: unknown): LabelColor {
  return isLabelColor(value) ? value : "slate";
}

export type LabelNameResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export function normalizeLabelName(raw: unknown): LabelNameResult {
  if (typeof raw !== "string") {
    return { ok: false, message: "Enter a label name." };
  }
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, message: "Enter a label name." };
  if (name.length > LABEL_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep label names to ${LABEL_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, name };
}
