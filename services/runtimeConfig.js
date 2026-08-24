import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { createLogger } from "./logger";

const logger = createLogger("RUNTIME_CONFIG");
// Bump the cache contract so installs carrying the former recovery ceiling do
// not retain it for another cache TTL after the faster exact-match path ships.
const CACHE_KEY = "@woof_label_resolution_config_v3";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REMOTE_CONFIG_TIMEOUT_MS = 2_000;
const SAFE_DEFAULT_RETRY_MS = 30 * 1000;
const SAFE_DEFAULTS = Object.freeze({
  strictMatching: true,
  // Auto-open remains protected by the deterministic exact-formula gates. A
  // transient config fetch must not turn a proven OCR match into an extra tap.
  autoOpenEnabled: true,
  visualConfirmationRequired: true,
  // The cloud recognizer and its bounded catalog confirmation share this total
  // budget. The normal on-device OCR path still exits as soon as it proves one
  // exact formula, usually long before this recovery ceiling.
  reconciliationTimeoutMs: 8_500,
  source: "safe_default",
});

let inMemoryConfig = null;
let lastRemoteAttemptAt = 0;

function normalizeConfig(value = {}, source = "remote") {
  return {
    strictMatching: value.strict_matching !== false,
    autoOpenEnabled: value.auto_open_enabled !== false,
    visualConfirmationRequired: value.visual_confirmation_required !== false,
    reconciliationTimeoutMs: Math.min(
      10_000,
      Math.max(6_000, Number(value.reconciliation_timeout_ms) || 8_500)
    ),
    source,
  };
}

async function readCachedConfig() {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(CACHE_KEY) || "null");
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return normalizeConfig(parsed.value, "cache");
  } catch {
    return null;
  }
}

export async function getLabelResolutionConfig({ forceRefresh = false } = {}) {
  if (!forceRefresh && inMemoryConfig) {
    const safeDefaultCanRetry = inMemoryConfig.source === "safe_default"
      && Date.now() - lastRemoteAttemptAt >= SAFE_DEFAULT_RETRY_MS;
    if (!safeDefaultCanRetry) return inMemoryConfig;
  }

  const cached = !forceRefresh ? await readCachedConfig() : null;
  if (cached) {
    inMemoryConfig = cached;
    return cached;
  }

  try {
    lastRemoteAttemptAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_CONFIG_TIMEOUT_MS);
    let response;
    try {
      response = await supabase
        .rpc("get_label_resolution_config")
        .abortSignal(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
    const { data, error } = response;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const remoteValue = row?.config || row || {};
    const normalized = normalizeConfig(remoteValue, "remote");
    inMemoryConfig = normalized;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      value: remoteValue,
    })).catch(() => {});
    return normalized;
  } catch (error) {
    logger.debug("[RUNTIME_CONFIG] Using safe label defaults:", error?.message || error);
    inMemoryConfig = SAFE_DEFAULTS;
    return SAFE_DEFAULTS;
  }
}

export function clearRuntimeConfigCache() {
  inMemoryConfig = null;
  lastRemoteAttemptAt = 0;
  return AsyncStorage.removeItem(CACHE_KEY);
}
