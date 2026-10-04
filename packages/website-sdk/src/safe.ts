const reported = new Set<string>();

export function reportInternalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (reported.has(message)) {
    return;
  }
  reported.add(message);
  try {
    console.warn("[Passoff prototype]", message);
  } catch {
    // The host page may have a broken console. Swallow that too.
  }
}

export function withHostSafety<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    reportInternalError(error);
    return fallback;
  }
}

export async function withHostSafetyAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    reportInternalError(error);
    return fallback;
  }
}

export function safeListener<T extends Event>(
  handler: (event: T) => void,
): (event: T) => void {
  return (event: T) => {
    withHostSafety(() => handler(event), undefined);
  };
}
