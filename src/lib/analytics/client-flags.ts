/**
 * Client-side helpers for one-time funnel events until a vendor is connected.
 */

const FIRST_PUBLISH_KEY = "passoff:analytics:first-revision-published";
const FIRST_SHARE_KEY = "passoff:analytics:first-review-link-created";
const SIGNUP_PENDING_KEY = "passoff:analytics:signup-pending";

export function markSignupPending() {
  try {
    sessionStorage.setItem(SIGNUP_PENDING_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumeSignupPending() {
  try {
    const pending = sessionStorage.getItem(SIGNUP_PENDING_KEY) === "1";
    if (pending) sessionStorage.removeItem(SIGNUP_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

export function isFirstEvent(key: "publish" | "share") {
  const storageKey = key === "publish" ? FIRST_PUBLISH_KEY : FIRST_SHARE_KEY;
  try {
    if (localStorage.getItem(storageKey) === "1") return false;
    localStorage.setItem(storageKey, "1");
    return true;
  } catch {
    return true;
  }
}
