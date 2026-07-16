import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

const SESSION_ID_KEY = "@woof_analytics_session_id";
const QUEUE_KEY = "@woof_analytics_queue";
const MAX_QUEUE_SIZE = 100;
const MAX_PROPERTY_KEYS = 40;
const MAX_STRING_LENGTH = 500;
let flushPromise = null;

function redactString(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/file:\/\/\S+/gi, "[file]")
    .replace(/\b(?:\/(?:private\/)?var|\/tmp|\/Users|\/data\/user|\/storage\/emulated|[A-Z]:\\)[^\s)]+/gi, "[file]")
    .replace(/(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\b(?:sk-ant|sk-proj|sk|rk_live|rk_test|appl|goog)[-_][A-Za-z0-9_-]{16,}\b/g, "[secret]")
    .replace(/\b[A-Za-z0-9+/=]{80,}\b/g, "[redacted]");
}

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getSessionId() {
  const existing = await AsyncStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const next = makeId();
  await AsyncStorage.setItem(SESSION_ID_KEY, next);
  return next;
}

function safeEventName(name) {
  if (typeof name !== "string" || !name.trim()) return null;
  return name.trim().toLowerCase().replace(/[^a-z0-9_:. -]/g, "_").slice(0, 80);
}

function normalizeValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value).slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => normalizeValue(item, depth + 1));
  if (typeof value === "object" && depth < 3) {
    return Object.entries(value)
      .slice(0, MAX_PROPERTY_KEYS)
      .reduce((acc, [key, item]) => {
        acc[String(key).slice(0, 80)] = normalizeValue(item, depth + 1);
        return acc;
      }, {});
  }
  return redactString(value).slice(0, MAX_STRING_LENGTH);
}

function normalizeProperties(properties = {}) {
  const normalized = normalizeValue(properties);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized
    : {};
}

function stringOrNull(value, maxLength = 80) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function runtimeVersionLabel(value) {
  if (typeof value === "string") return stringOrNull(value);
  if (value && typeof value === "object") {
    return stringOrNull(value.policy || value.version);
  }
  return null;
}

function releaseContext() {
  const expoConfig = Constants.expoConfig || {};

  return {
    platform: Platform.OS,
    platform_version: stringOrNull(Platform.Version, 40),
    app_version: stringOrNull(expoConfig.version || Constants.nativeAppVersion),
    native_build_version: stringOrNull(Constants.nativeBuildVersion, 40),
    runtime_version: runtimeVersionLabel(expoConfig.runtimeVersion),
    eas_project_id: stringOrNull(expoConfig.extra?.eas?.projectId, 80),
    execution_environment: stringOrNull(Constants.executionEnvironment, 40),
  };
}

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function enqueueEvent(event) {
  const queue = await readQueue();
  queue.push(event);
  const trimmed = queue.slice(-MAX_QUEUE_SIZE);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
}

function eventCapturedForCurrentUser(event, currentUserId) {
  if (!event || typeof event !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(event, "userIdAtCapture")) return false;
  return event.userIdAtCapture == null || event.userIdAtCapture === currentUserId;
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session || null;
}

export async function trackEvent(name, properties = {}, options = {}) {
  const eventName = safeEventName(name);
  if (!eventName) return;

  try {
    const { queueWhenSignedOut = true } = options;
    const session = await getSession();
    const sessionId = await getSessionId();
    const clientCreatedAt = new Date().toISOString();
    const event = {
      name: eventName,
      sessionId,
      userIdAtCapture: session?.user?.id ?? null,
      properties: {
        ...normalizeProperties(properties),
        ...releaseContext(),
      },
      clientCreatedAt,
    };

    if (!session?.user?.id) {
      if (queueWhenSignedOut) {
        await enqueueEvent(event);
      }
      return;
    }

    const { error } = await supabase.from("analytics_events").insert({
      user_id: session.user.id,
      session_id: sessionId,
      name: event.name,
      properties: {
        ...event.properties,
        client_created_at: clientCreatedAt,
      },
    });

    if (error) {
      await enqueueEvent(event);
    }
  } catch {
    // Analytics must never block product flows.
  }
}

export async function flushAnalyticsQueue({ source = "unknown" } = {}) {
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    try {
      const session = await getSession();
      if (!session?.user?.id) {
        return { attempted: false, flushed: false, reason: "no_session" };
      }

      const queue = await readQueue();
      if (queue.length === 0) {
        return { attempted: false, flushed: true, queued_event_count: 0 };
      }

      const safeSource = stringOrNull(source, 80) || "unknown";
      const flushableQueue = queue.filter((event) => eventCapturedForCurrentUser(event, session.user.id));
      const droppedEventCount = queue.length - flushableQueue.length;

      if (flushableQueue.length === 0) {
        await AsyncStorage.removeItem(QUEUE_KEY);
        await supabase.from("analytics_events").insert({
          user_id: session.user.id,
          session_id: await getSessionId(),
          name: "analytics_queue_dropped",
          properties: {
            ...releaseContext(),
            analytics_flush_source: safeSource,
            dropped_event_count: droppedEventCount,
            drop_reason: "user_mismatch_or_legacy_queue",
            client_created_at: new Date().toISOString(),
          },
        });

        return {
          attempted: true,
          flushed: true,
          queued_event_count: 0,
          dropped_event_count: droppedEventCount,
        };
      }

      const rows = flushableQueue.map((event) => ({
        user_id: session.user.id,
        session_id: event.sessionId,
        name: event.name,
        properties: {
          ...normalizeProperties(event.properties),
          client_created_at: event.clientCreatedAt,
          flushed_after_sign_in: true,
          analytics_flush_source: safeSource,
        },
      }));

      const { error } = await supabase.from("analytics_events").insert(rows);
      if (error) {
        return {
          attempted: true,
          flushed: false,
          queued_event_count: flushableQueue.length,
          dropped_event_count: droppedEventCount,
        };
      }

      await AsyncStorage.removeItem(QUEUE_KEY);

      await supabase.from("analytics_events").insert([
        {
          user_id: session.user.id,
          session_id: await getSessionId(),
          name: "analytics_queue_flushed",
          properties: {
            ...releaseContext(),
            analytics_flush_source: safeSource,
            queued_event_count: flushableQueue.length,
            dropped_event_count: droppedEventCount,
            client_created_at: new Date().toISOString(),
          },
        },
        ...(droppedEventCount > 0 ? [{
          user_id: session.user.id,
          session_id: await getSessionId(),
          name: "analytics_queue_dropped",
          properties: {
            ...releaseContext(),
            analytics_flush_source: safeSource,
            dropped_event_count: droppedEventCount,
            drop_reason: "user_mismatch_or_legacy_queue",
            client_created_at: new Date().toISOString(),
          },
        }] : []),
      ]);

      return {
        attempted: true,
        flushed: true,
        queued_event_count: flushableQueue.length,
        dropped_event_count: droppedEventCount,
      };
    } catch {
      // Keep the queue for a later attempt.
      return { attempted: true, flushed: false };
    } finally {
      flushPromise = null;
    }
  })();

  return flushPromise;
}

export async function clearAnalyticsStorage() {
  await AsyncStorage.multiRemove([SESSION_ID_KEY, QUEUE_KEY]);
}
