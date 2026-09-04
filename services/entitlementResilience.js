import AsyncStorage from "@react-native-async-storage/async-storage";

const ENTITLEMENT_CACHE_KEY_PREFIX = "@woof_entitlement_state:";
const FALLBACK_PRO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function entitlementCacheKey(userId) {
  return userId ? `${ENTITLEMENT_CACHE_KEY_PREFIX}${userId}` : "";
}

function validFutureIso(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now
    ? new Date(timestamp).toISOString()
    : null;
}

export function cachedProIsActive(value, now = Date.now()) {
  return value?.isPro === true && Boolean(validFutureIso(value.expiresAt, now));
}

export function cachedProExpiry({
  isPro,
  proExpiresAt = null,
  previousExpiresAt = null,
  now = Date.now(),
} = {}) {
  if (!isPro) return null;
  return validFutureIso(proExpiresAt, now)
    || validFutureIso(previousExpiresAt, now)
    || new Date(now + FALLBACK_PRO_CACHE_TTL_MS).toISOString();
}

export async function readCachedEntitlement(userId) {
  const key = entitlementCacheKey(userId);
  if (!key) return null;
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(key) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      isPro: parsed.isPro === true,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
      savedAt: Number(parsed.savedAt) || null,
    };
  } catch {
    return null;
  }
}

export async function persistCachedEntitlement(userId, {
  isPro,
  proExpiresAt = null,
} = {}) {
  const key = entitlementCacheKey(userId);
  if (!key || typeof isPro !== "boolean") return null;
  const previous = await readCachedEntitlement(userId);
  const value = {
    isPro,
    expiresAt: cachedProExpiry({
      isPro,
      proExpiresAt,
      previousExpiresAt: previous?.expiresAt,
    }),
    savedAt: Date.now(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function clearCachedEntitlement(userId) {
  const key = entitlementCacheKey(userId);
  return key ? AsyncStorage.removeItem(key) : Promise.resolve();
}

export function authRefreshFailurePolicy(error) {
  const status = Number(error?.status);
  const code = String(error?.code || "").toLowerCase();
  const name = String(error?.name || error?.constructor?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const knownRevocation = [
    "refresh_token_not_found",
    "refresh_token_already_used",
    "invalid_refresh_token",
    "session_not_found",
  ].some((value) => code.includes(value) || message.includes(value.replaceAll("_", " ")));
  const authApiError = name.includes("authapierror")
    || error?.__isAuthError === true
    || code.startsWith("refresh_token_");

  return knownRevocation || (authApiError && (status === 400 || status === 401))
    ? "sign_out"
    : "retry_keep_session";
}

export function webhookEventShouldApply(lastEventAt, incomingEventAt) {
  if (!lastEventAt) return true;
  const lastTimestamp = Date.parse(lastEventAt);
  const incomingTimestamp = Date.parse(incomingEventAt);
  if (!Number.isFinite(incomingTimestamp)) return false;
  if (!Number.isFinite(lastTimestamp)) return true;
  return incomingTimestamp > lastTimestamp;
}

export function entitlementResilienceQaScenario(name, now = Date.now()) {
  if (name === "refresh_network_failure") {
    const actual = authRefreshFailurePolicy({
      name: "TypeError",
      message: "Network request failed",
    });
    return {
      title: "Token refresh network failure",
      expected: "Keep the signed-in session and offer a retry.",
      actual: actual === "retry_keep_session"
        ? "Session kept; request is retryable."
        : "Session would be cleared.",
      passed: actual === "retry_keep_session",
    };
  }

  if (name === "cached_pro_profile_failure") {
    const cached = {
      isPro: true,
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    };
    const active = cachedProIsActive(cached, now);
    return {
      title: "Cached Pro with profile fetch failure",
      expected: "Keep Pro UI while background reconciliation retries.",
      actual: active ? "Cached unexpired Pro remains active." : "UI would downgrade to Free.",
      passed: active,
    };
  }

  if (name === "out_of_order_webhook") {
    const renewalAt = new Date(now).toISOString();
    const lateExpirationAt = new Date(now - 5 * 60 * 1000).toISOString();
    const applies = webhookEventShouldApply(renewalAt, lateExpirationAt);
    return {
      title: "Out-of-order RevenueCat webhook",
      expected: "Ignore an older expiration after a newer renewal.",
      actual: applies ? "Older expiration would overwrite renewal." : "Older expiration ignored.",
      passed: !applies,
    };
  }

  return {
    title: "Unknown entitlement fixture",
    expected: "A known scenario.",
    actual: "No scenario ran.",
    passed: false,
  };
}
