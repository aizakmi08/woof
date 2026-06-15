import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const SESSION_KEY = "@woof_analytics_session_id";
const ANALYTICS_SCHEMA_RETRY_MS = 60_000;
const ANALYTICS_SCHEMA_MAX_RETRY_MS = 15 * 60_000;
const ANALYTICS_RPC_TIMEOUT_MS = 2_500;
const ANALYTICS_MAX_INFLIGHT = 2;
let analyticsRpcRetryAt = 0;
let analyticsSchemaRetryMs = ANALYTICS_SCHEMA_RETRY_MS;
let analyticsSchemaNoticeAt = 0;
let analyticsInflight = 0;
let sessionIdMemory = null;
let sessionIdPromise = null;
const ALLOWED_EVENTS = new Set([
  "scan_started",
  "search_result_tapped",
  "analysis_completed",
  "analysis_failed",
  "ingredient_label_requested",
  "pet_type_requested",
  "paywall_viewed",
  "paywall_plan_selected",
  "purchase_started",
  "purchase_completed",
  "purchase_cancelled",
  "purchase_failed",
  "purchase_no_entitlement",
  "restore_started",
  "restore_completed",
  "restore_failed",
  "restore_no_entitlement",
  "app_error",
]);

function fallbackSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getSessionId() {
  if (sessionIdMemory) return sessionIdMemory;
  if (sessionIdPromise) return sessionIdPromise;
  sessionIdPromise = (async () => {
    try {
      const existing = await AsyncStorage.getItem(SESSION_KEY);
      if (existing) {
        sessionIdMemory = existing;
        return existing;
      }
      const sessionId = fallbackSessionId();
      await AsyncStorage.setItem(SESSION_KEY, sessionId);
      sessionIdMemory = sessionId;
      return sessionId;
    } catch {
      const sessionId = fallbackSessionId();
      sessionIdMemory = sessionId;
      return sessionId;
    } finally {
      sessionIdPromise = null;
    }
  })();
  return sessionIdPromise;
}

function sanitizeValue(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 120);
  if (Array.isArray(value)) return value.slice(0, 10).map(sanitizeValue);
  return null;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 24)
      .map(([key, value]) => [String(key).slice(0, 40), sanitizeValue(value)])
      .filter(([, value]) => value !== null)
  );
}

export function analyticsKeyHash(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function analyticsErrorText(err) {
  return [
    err?.message,
    err?.details,
    err?.hint,
    err?.code,
  ].filter(Boolean).join(" ") || String(err || "");
}

function isAnalyticsSchemaUnavailable(err) {
  const message = analyticsErrorText(err);
  return err?.code === "PGRST202" ||
    err?.code === "PGRST203" ||
    (/log_product_event/i.test(message) &&
      /schema cache|could not find the function|function .*not found|not found in the schema cache|could not choose the best candidate/i.test(message));
}

function noteAnalyticsSchemaUnavailable(err) {
  analyticsRpcRetryAt = Date.now() + analyticsSchemaRetryMs;
  analyticsSchemaRetryMs = Math.min(analyticsSchemaRetryMs * 2, ANALYTICS_SCHEMA_MAX_RETRY_MS);
  if (Date.now() - analyticsSchemaNoticeAt > ANALYTICS_SCHEMA_RETRY_MS) {
    analyticsSchemaNoticeAt = Date.now();
    console.log("[ANALYTICS] Event RPC unavailable; suppressing analytics until schema cache refresh:", err.message);
  }
}

function noteAnalyticsRpcSuccess() {
  analyticsSchemaRetryMs = ANALYTICS_SCHEMA_RETRY_MS;
  analyticsRpcRetryAt = 0;
}

function analyticsTimeoutError(label, timeoutMs = ANALYTICS_RPC_TIMEOUT_MS) {
  const err = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
  err.code = "ANALYTICS_TIMEOUT";
  return err;
}

function withAnalyticsTimeout(promise, label, timeoutMs = ANALYTICS_RPC_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(analyticsTimeoutError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function startAnalyticsRpcDeadline(timeoutMs = ANALYTICS_RPC_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

function handleAnalyticsError(err) {
  if (isAnalyticsSchemaUnavailable(err)) {
    noteAnalyticsSchemaUnavailable(err);
    return;
  }
  if (err?.code === "ANALYTICS_TIMEOUT" || err?.name === "AbortError") {
    return;
  }
  console.log("[ANALYTICS] Event log failed:", err.message);
}

export function trackEvent(eventName, metadata = {}) {
  if (!ALLOWED_EVENTS.has(eventName)) return;
  if (Date.now() < analyticsRpcRetryAt) return;
  if (analyticsInflight >= ANALYTICS_MAX_INFLIGHT) return;

  const redacted = {
    ...sanitizeMetadata(metadata),
    platform: Platform.OS,
  };

  analyticsInflight += 1;
  withAnalyticsTimeout(getSessionId(), "Analytics session")
    .then((sessionId) => {
      const request = startAnalyticsRpcDeadline();
      return Promise.resolve(
        supabase
          .rpc("log_product_event", {
            p_event_name: eventName,
            p_session_id: sessionId,
            p_metadata: redacted,
          })
          .abortSignal(request.signal)
      ).finally(request.cleanup);
    })
    .then(({ error }) => {
      if (error) {
        handleAnalyticsError(error);
      } else {
        noteAnalyticsRpcSuccess();
      }
    })
    .catch(handleAnalyticsError)
    .finally(() => {
      analyticsInflight = Math.max(0, analyticsInflight - 1);
    });
}

export function trackError(source, error, metadata = {}) {
  trackEvent("app_error", {
    ...metadata,
    source,
    errorName: error?.name || "Error",
    message: error?.message || "Unknown error",
  });
}
