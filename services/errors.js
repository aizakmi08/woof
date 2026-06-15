/**
 * Single source of truth for error categorization across the app.
 *
 * Every fetch, RPC, and async call eventually surfaces an error. Instead of
 * each call site inventing its own message, we route the raw error through
 * `classifyError(err)` to get a consistent {kind, title, message, retryable, action}
 * shape. UI components then render the right copy + recovery affordance.
 *
 * Kinds:
 *   - network       The device is offline or DNS / TCP failed. Always retryable.
 *   - timeout       Request started but didn't return in time. Retryable.
 *   - server        5xx from our backend or upstream. Retryable.
 *   - rate_limit    429 — too many requests. Retryable after cooldown.
 *   - auth          Session expired / invalid token. Action: re-sign-in.
 *   - quota         Free tier exhausted. Action: upgrade.
 *   - product_not_found  Search/catalog miss. Action: scan product.
 *   - validation    Bad input (image too big, blurry, missing field). Not retryable as-is.
 *   - image         Specifically image-related issues (couldn't capture, couldn't read).
 *   - cancelled     User aborted (back button, navigated away). Silent.
 *   - unknown       Anything we couldn't classify.
 */

const NETWORK_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /could not connect/i,
  /the internet connection appears to be offline/i,
  /no address associated with hostname/i,
  /typeerror/i, // RN fetch network errors land here
  /networkerror/i,
];

const TIMEOUT_PATTERNS = [
  /timed?\s*out/i,
  /timeout/i,
  /aborterror/i,
];

const AUTH_PATTERNS = [
  /invalid auth token/i,
  /jwt expired/i,
  /session expired/i,
  /not authenticated/i,
  /\b401\b/,
];

const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /\b429\b/,
];

const QUOTA_PATTERNS = [
  /free scan limit/i,
  /daily free safety/i,
  /guest free safety/i,
  /free safety check used/i,
  /upgrade to pro/i,
  /scan limit reached/i,
];

const PRODUCT_NOT_FOUND_PATTERNS = [
  /product not found in database/i,
  /barcode not found/i,
  /try scanning the product instead/i,
  /not analysis-ready/i,
  /catalog miss/i,
  /product_not_found/i,
];

const IMAGE_PATTERNS = [
  /image too large/i,
  /could not read the photo/i,
  /no ingredient label visible/i,
  /could not read the product name/i,
  /capture failed/i,
];

const SERVER_PATTERNS = [
  /\b5\d\d\b/,
  /subscription sync unavailable/i,
  /quota check unavailable/i,
  /service\s*error/i,
  /internal server/i,
  /bad gateway/i,
  /service unavailable/i,
];

function _matches(patterns, str) {
  return patterns.some((p) => p.test(str));
}

/**
 * Classify any error into a structured shape. Accepts Error instances,
 * fetch Response objects, plain strings, or undefined.
 */
export function classifyError(err) {
  if (!err) {
    return {
      kind: "unknown",
      title: "Something went wrong",
      message: "Please try again.",
      retryable: true,
    };
  }

  // AbortError — user navigated away or we timed out programmatically
  if (err.name === "AbortError" || err.code === 20) {
    // If it was triggered by a real timeout the message will say so
    if (err.message && /timeout/i.test(err.message)) {
      return {
        kind: "timeout",
        title: "This is taking longer than expected",
        message: "Your connection might be slow. Try again.",
        retryable: true,
      };
    }
    return {
      kind: "cancelled",
      title: "Cancelled",
      message: "",
      retryable: false,
      silent: true,
    };
  }

  const raw = typeof err === "string" ? err : (err.message || String(err) || "");

  if (_matches(QUOTA_PATTERNS, raw)) {
    return {
      kind: "quota",
      title: "You've reached your free limit",
      message: raw.includes("safety") || raw.includes("daily")
        ? "Daily free safety check used. Upgrade to Pro for unlimited checks."
        : "Upgrade to Pro for unlimited scans.",
      retryable: false,
      action: "upgrade",
    };
  }

  if (_matches(AUTH_PATTERNS, raw)) {
    return {
      kind: "auth",
      title: "Session expired",
      message: "Please sign in again to continue.",
      retryable: false,
      action: "sign_in",
    };
  }

  if (_matches(PRODUCT_NOT_FOUND_PATTERNS, raw)) {
    return {
      kind: "product_not_found",
      title: "Product Not Found",
      message: "We could not find a verified database match. Scan the product so Woof can read the label directly.",
      retryable: false,
      action: "scan_product",
    };
  }

  if (_matches(RATE_LIMIT_PATTERNS, raw)) {
    return {
      kind: "rate_limit",
      title: "Slow down a moment",
      message: "Too many requests. Try again in a minute.",
      retryable: true,
      retryAfterMs: 60_000,
    };
  }

  if (_matches(IMAGE_PATTERNS, raw)) {
    return {
      kind: "image",
      title: "Couldn't read the photo",
      message: "Hold the camera steady, get closer to the label, and make sure the brand name is in focus.",
      retryable: true,
      action: "retake",
    };
  }

  if (_matches(TIMEOUT_PATTERNS, raw)) {
    return {
      kind: "timeout",
      title: "This is taking longer than expected",
      message: "Your connection might be slow. Tap to try again.",
      retryable: true,
    };
  }

  if (_matches(NETWORK_PATTERNS, raw)) {
    return {
      kind: "network",
      title: "No internet connection",
      message: "Check your Wi-Fi or cellular connection and try again.",
      retryable: true,
      action: "wait_for_network",
    };
  }

  if (_matches(SERVER_PATTERNS, raw)) {
    return {
      kind: "server",
      title: "Our servers are having trouble",
      message: "We're working on it. Try again in a moment.",
      retryable: true,
    };
  }

  // Fallback — unknown
  return {
    kind: "unknown",
    title: "Something went wrong",
    message: raw && raw.length < 200 ? raw : "Please try again.",
    retryable: true,
  };
}

/**
 * Helper: should the caller retry this error automatically?
 */
export function isRetryable(err) {
  return classifyError(err).retryable === true;
}

/**
 * Run an async function with N retries on transient errors only. Sleeps with
 * exponential backoff (250ms, 500ms, 1s, ...). Throws the final error if all
 * retries fail.
 */
export async function withRetry(fn, { retries = 2, baseDelayMs = 250, signal } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const c = classifyError(err);
      // Don't retry user cancels, auth failures, quota errors, or validation issues.
      if (!c.retryable || c.kind === "cancelled" || c.kind === "auth" || c.kind === "quota" || c.kind === "validation") {
        throw err;
      }
      if (attempt === retries) break;
      const wait = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * Safe AsyncStorage write — never throws, returns boolean.
 * Use this for non-critical writes (preferences, recents, scan counts) where
 * a disk-full or permission error shouldn't crash the caller.
 */
export async function safeStorageSet(asyncStorage, key, value) {
  try {
    await asyncStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.log("[STORAGE] Write failed for", key, err?.message);
    return false;
  }
}
