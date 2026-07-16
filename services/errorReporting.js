import { trackEvent } from "./analytics";
import { createLogger } from "./logger";

const logger = createLogger("ERROR_REPORTING");

const MAX_MESSAGE_LENGTH = 240;
const MAX_NAME_LENGTH = 80;
const MAX_FRAME_LENGTH = 220;
const MAX_CONTEXT_KEYS = 16;
const MAX_CONTEXT_VALUE_LENGTH = 160;
const DEDUPE_WINDOW_MS = 30000;

const reportedAtByKey = new Map();
let globalHandlersInstalled = false;

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function redactText(value, maxLength) {
  const redacted = normalizeText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/file:\/\/\S+/gi, "[file]")
    .replace(/\b(?:\/(?:private\/)?var|\/tmp|\/Users|\/data\/user|\/storage\/emulated|[A-Z]:\\)[^\s)]+/gi, "[file]")
    .replace(/(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\b(?:sk-ant|sk-proj|sk|rk_live|rk_test|appl|goog)[-_][A-Za-z0-9_-]{16,}\b/g, "[secret]")
    .replace(/[A-Za-z0-9+/=]{64,}/g, "[redacted]");

  return truncate(redacted, maxLength);
}

function firstUsefulStackFrame(stack) {
  if (typeof stack !== "string") return null;
  const frame = stack
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.toLowerCase().startsWith("error:"));

  return frame ? redactText(frame, MAX_FRAME_LENGTH) : null;
}

function sanitizeError(error) {
  if (!error) {
    return {
      error_name: "UnknownError",
      error_message: "Unknown error",
      top_frame: null,
    };
  }

  if (typeof error === "string") {
    return {
      error_name: "Error",
      error_message: redactText(error, MAX_MESSAGE_LENGTH),
      top_frame: null,
    };
  }

  const name = redactText(error.name || "Error", MAX_NAME_LENGTH);
  const message = redactText(error.message || String(error), MAX_MESSAGE_LENGTH);

  return {
    error_name: name || "Error",
    error_message: message || "Unknown error",
    top_frame: firstUsefulStackFrame(error.stack),
  };
}

function sanitizeContext(context = {}) {
  const blockedPattern = /base64|image|photo|payload|prompt|response|stack|text|uri|url/i;

  return Object.entries(context)
    .filter(([key]) => !blockedPattern.test(key))
    .slice(0, MAX_CONTEXT_KEYS)
    .reduce((acc, [key, value]) => {
      if (value == null) return acc;

      const safeKey = String(key).slice(0, 80);
      if (typeof value === "boolean" || typeof value === "number") {
        acc[safeKey] = value;
      } else if (typeof value === "string") {
        acc[safeKey] = redactText(value, MAX_CONTEXT_VALUE_LENGTH);
      }
      return acc;
    }, {});
}

function hashForGrouping(parts) {
  const input = parts.filter(Boolean).join("|");
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function normalizeForFingerprint(value) {
  return redactText(value, MAX_MESSAGE_LENGTH)
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/g, "[id]")
    .replace(/\b\d+(?:\.\d+)?\b/g, "[number]")
    .replace(/['"`][^'"`]{1,80}['"`]/g, "[value]")
    .replace(/:\d+:\d+/g, ":[line]")
    .replace(/\s+/g, " ")
    .trim();
}

function errorCategory({ source, errorName, errorMessage }) {
  const text = `${source} ${errorName} ${errorMessage}`.toLowerCase();

  if (/revenuecat|purchase|restore|subscription|entitlement|paywall/.test(text)) {
    return "monetization";
  }
  if (/auth|oauth|session|sign.?in|token|credential/.test(text)) {
    return "auth";
  }
  if (/analysis|claude|json|parse|stream|scan|barcode|ingredient/.test(text)) {
    return "analysis";
  }
  if (/network|fetch|timeout|offline|internet|request failed/.test(text)) {
    return "network";
  }
  if (/asyncstorage|storage|database|supabase|rpc|insert|select|upsert/.test(text)) {
    return "data";
  }
  if (/navigation|route|screen/.test(text)) {
    return "navigation";
  }
  if (/error_boundary|render|component/.test(text)) {
    return "render";
  }
  return "app_runtime";
}

function shouldReport(key) {
  const now = Date.now();
  const lastReportedAt = reportedAtByKey.get(key);

  if (lastReportedAt && now - lastReportedAt < DEDUPE_WINDOW_MS) {
    return false;
  }

  reportedAtByKey.set(key, now);

  if (reportedAtByKey.size > 100) {
    for (const [existingKey, reportedAt] of reportedAtByKey.entries()) {
      if (now - reportedAt > DEDUPE_WINDOW_MS) {
        reportedAtByKey.delete(existingKey);
      }
    }
  }

  return true;
}

export function trackAppError(error, context = {}) {
  try {
    const sanitizedError = sanitizeError(error);
    const safeContext = sanitizeContext(context);
    const source = safeContext.source || "unknown";
    const normalizedMessage = normalizeForFingerprint(sanitizedError.error_message);
    const normalizedFrame = normalizeForFingerprint(sanitizedError.top_frame || "");
    const category = errorCategory({
      source,
      errorName: sanitizedError.error_name,
      errorMessage: sanitizedError.error_message,
    });
    const errorFingerprint = hashForGrouping([
      category,
      sanitizedError.error_name,
      normalizedMessage,
      normalizedFrame,
    ]);
    const errorKey = errorFingerprint;

    if (!shouldReport(errorKey)) return;

    trackEvent("app_error_captured", {
      ...safeContext,
      source,
      error_key: errorKey,
      error_fingerprint: errorFingerprint,
      error_category: category,
      error_name: sanitizedError.error_name,
      error_message: sanitizedError.error_message,
      top_frame: sanitizedError.top_frame,
      fatal: Boolean(safeContext.fatal),
    }).catch(() => {
      // Error telemetry should never create another product-flow error.
    });
  } catch (reportingError) {
    logger.debug("Unable to report app error", reportingError?.message);
  }
}

export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  try {
    const errorUtils = globalThis.ErrorUtils;
    if (errorUtils?.getGlobalHandler && errorUtils?.setGlobalHandler) {
      const previousHandler = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        trackAppError(error, {
          source: "global_js_error",
          fatal: Boolean(isFatal),
        });

        if (typeof previousHandler === "function") {
          previousHandler(error, isFatal);
        }
      });
    }

    const previousUnhandledRejection = globalThis.onunhandledrejection;
    globalThis.onunhandledrejection = (event) => {
      trackAppError(event?.reason || event, {
        source: "unhandled_promise_rejection",
        fatal: false,
      });

      if (typeof previousUnhandledRejection === "function") {
        previousUnhandledRejection(event);
      }
    };
  } catch (error) {
    logger.debug("Unable to install global error handlers", error?.message);
  }
}
