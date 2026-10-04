export function formatRelativeActivity(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const timestamp = value.getTime();
  if (Number.isNaN(timestamp)) {
    return "Unknown activity";
  }

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (abs < 60) {
    return formatter.format(deltaSeconds, "second");
  }
  if (abs < 3600) {
    return formatter.format(Math.round(deltaSeconds / 60), "minute");
  }
  if (abs < 86400) {
    return formatter.format(Math.round(deltaSeconds / 3600), "hour");
  }
  if (abs < 86400 * 30) {
    return formatter.format(Math.round(deltaSeconds / 86400), "day");
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatReviewCount(count: number): string {
  if (count === 0) return "No reviews yet";
  if (count === 1) return "1 review";
  return `${count} reviews`;
}

export function formatOpenIssueCount(count: number): string {
  if (count === 0) return "No open issues";
  if (count === 1) return "1 open issue";
  return `${count} open issues`;
}

export function formatVersionLabel(identifier: string, historical?: boolean): string {
  return historical ? `${identifier} (historical)` : identifier;
}
