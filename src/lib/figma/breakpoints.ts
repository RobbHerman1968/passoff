export type FigmaBreakpointLabel = "Mobile" | "Tablet" | "Desktop" | "Frame";

/** Width-first breakpoint derivation for imported Figma frames. */
export function deriveBreakpointLabel(width: number | null | undefined, name?: string | null): FigmaBreakpointLabel {
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    if (width < 768) return "Mobile";
    if (width < 1280) return "Tablet";
    return "Desktop";
  }

  const lower = (name || "").toLowerCase();
  if (/\b(mobile|phone|iphone|android)\b/.test(lower)) return "Mobile";
  if (/\b(tablet|ipad)\b/.test(lower)) return "Tablet";
  if (/\b(desktop|web|laptop)\b/.test(lower)) return "Desktop";
  return "Frame";
}

/** Shared display name for a breakpoint set when no explicit group name exists. */
export function commonDesignName(names: string[]) {
  if (!names.length) return "Design";
  if (names.length === 1) return names[0];
  const tokens = names.map((name) => name.replace(/\s*[/_|-]\s*(mobile|tablet|desktop|phone|web|ipad|iphone|sm|md|lg|xl)\b.*/i, "").trim());
  const first = tokens[0];
  if (first && tokens.every((token) => token.toLowerCase() === first.toLowerCase())) return first;
  return names[0];
}
