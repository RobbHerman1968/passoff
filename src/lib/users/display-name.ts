export function personDisplayName(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (email?.trim()) return email.trim();
  return "Unknown";
}
