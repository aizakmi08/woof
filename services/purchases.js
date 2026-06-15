import { NativeModules, Platform } from "react-native";
import Purchases from "react-native-purchases";
import Constants from "expo-constants";

const REVENUECAT_API_KEY_IOS =
  Constants.expoConfig?.extra?.REVENUECAT_API_KEY_IOS ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ||
  "";
const REVENUECAT_API_KEY_ANDROID =
  Constants.expoConfig?.extra?.REVENUECAT_API_KEY_ANDROID ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ||
  "";
const REVENUECAT_TEST_STORE_API_KEY =
  Constants.expoConfig?.extra?.REVENUECAT_TEST_STORE_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY ||
  "";

let initialized = false;
let configuredUserId = null;
let initializingPromise = null;
let lastConfigurationFailure = null;
const configurationFailureCache = new Map();
const PRO_ENTITLEMENT_ID = "pro";
const MAX_CONFIGURATION_FAILURE_CACHE_SIZE = 8;
const PURCHASES_CONFIGURE_TIMEOUT_MS = 8_000;
const PURCHASES_CUSTOMER_INFO_TIMEOUT_MS = 6_000;
const PURCHASES_OFFERINGS_TIMEOUT_MS = 8_000;
const PURCHASES_RESTORE_TIMEOUT_MS = 20_000;

function isExpoGoRuntime() {
  const nativeMobileWithoutPurchasesModule =
    (Platform.OS === "ios" || Platform.OS === "android") &&
    !NativeModules.RNPurchases;
  const revenueCatBrowserModeExpoGo = !NativeModules.RNPurchases &&
    Boolean(globalThis?.expo?.modules?.ExpoGo);
  return nativeMobileWithoutPurchasesModule ||
    revenueCatBrowserModeExpoGo ||
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient" ||
    Boolean(Constants.expoGoConfig);
}

function getApiKey() {
  if (isExpoGoRuntime() && REVENUECAT_TEST_STORE_API_KEY) {
    return REVENUECAT_TEST_STORE_API_KEY;
  }
  return Platform.OS === "ios"
    ? REVENUECAT_API_KEY_IOS
    : REVENUECAT_API_KEY_ANDROID;
}

function expectedApiKeyPrefix(apiKey = getApiKey()) {
  if (isExpoGoRuntime() && REVENUECAT_TEST_STORE_API_KEY) return "test_";
  if (apiKey?.startsWith("test_")) return "test_";
  return Platform.OS === "ios" ? "appl_" : "goog_";
}

function apiKeyDiagnostics(apiKey = getApiKey()) {
  const expectedPrefix = expectedApiKeyPrefix(apiKey);
  return {
    platform: Platform.OS,
    expectedPrefix,
    hasKey: Boolean(apiKey),
    keyPrefix: apiKey ? apiKey.slice(0, Math.min(5, apiKey.length)) : "",
    keyLength: apiKey ? apiKey.length : 0,
    isExpoGo: isExpoGoRuntime(),
    isTestStoreKey: Boolean(apiKey?.startsWith("test_")),
    hasTestStoreKey: Boolean(REVENUECAT_TEST_STORE_API_KEY),
    hasExpoExtra: Boolean(
      isExpoGoRuntime() && REVENUECAT_TEST_STORE_API_KEY
        ? Constants.expoConfig?.extra?.REVENUECAT_TEST_STORE_API_KEY
        : Platform.OS === "ios"
        ? Constants.expoConfig?.extra?.REVENUECAT_API_KEY_IOS
        : Constants.expoConfig?.extra?.REVENUECAT_API_KEY_ANDROID
    ),
  };
}

function configurationError(message, code = "revenuecat_configuration_error", apiKey = getApiKey()) {
  const error = new Error(message);
  error.code = code;
  error.diagnostics = apiKeyDiagnostics(apiKey);
  return error;
}

function purchasesTimeoutError(operation, timeoutMs) {
  const error = new Error(`${operation} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
  error.code = "revenuecat_operation_timeout";
  error.diagnostics = apiKeyDiagnostics();
  return error;
}

async function withPurchasesTimeout(operation, promise, timeoutMs) {
  let didTimeout = false;
  let timeoutId = null;
  const guardedPromise = Promise.resolve(promise);
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      reject(purchasesTimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([guardedPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
    if (didTimeout) {
      guardedPromise.catch((err) => {
        console.log(`[PURCHASES] ${operation} completed after timeout:`, err?.message || err);
      });
    }
  }
}

function configurationAttemptKey(appUserID, apiKey = getApiKey()) {
  const diagnostics = apiKeyDiagnostics(apiKey);
  return JSON.stringify({
    appUserID: appUserID || null,
    platform: diagnostics.platform,
    isExpoGo: diagnostics.isExpoGo,
    keyPrefix: diagnostics.keyPrefix,
    keyLength: diagnostics.keyLength,
    hasTestStoreKey: diagnostics.hasTestStoreKey,
  });
}

function configurationEnvironmentKey(apiKey = getApiKey()) {
  const diagnostics = apiKeyDiagnostics(apiKey);
  return JSON.stringify({
    platform: diagnostics.platform,
    isExpoGo: diagnostics.isExpoGo,
    keyPrefix: diagnostics.keyPrefix,
    keyLength: diagnostics.keyLength,
    hasTestStoreKey: diagnostics.hasTestStoreKey,
  });
}

function cloneConfigurationError(error) {
  const next = new Error(error.message);
  next.code = error.code;
  next.diagnostics = error.diagnostics ? { ...error.diagnostics } : undefined;
  return next;
}

function isCacheableConfigurationError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  return (
    code === "expo_go_revenuecat_unavailable" ||
    code === "missing_revenuecat_api_key" ||
    code === "invalid_revenuecat_api_key_prefix" ||
    /invalid api key/i.test(message) ||
    /native store is not available/i.test(message) ||
    /issue with your configuration/i.test(message)
  );
}

function isNativeStoreUnavailableError(error) {
  return /native store is not available/i.test(error?.message || "");
}

function rememberConfigurationFailure(key, error) {
  if (!key) return;
  if (!configurationFailureCache.has(key) && configurationFailureCache.size >= MAX_CONFIGURATION_FAILURE_CACHE_SIZE) {
    const oldestKey = configurationFailureCache.keys().next().value;
    if (oldestKey) configurationFailureCache.delete(oldestKey);
  }
  configurationFailureCache.set(key, cloneConfigurationError(error));
}

function normalizePurchasesError(error, apiKey = getApiKey()) {
  if (
    isNativeStoreUnavailableError(error) &&
    !REVENUECAT_TEST_STORE_API_KEY &&
    (apiKey?.startsWith("appl_") || apiKey?.startsWith("goog_"))
  ) {
    const normalized = configurationError(
      "RevenueCat native purchases are unavailable in Expo Go with App Store keys. Use a Woof development build, TestFlight, App Store build, or configure REVENUECAT_TEST_STORE_API_KEY for local Expo Go testing.",
      "expo_go_revenuecat_unavailable",
      apiKey
    );
    normalized.cause = error;
    return normalized;
  }
  if (!error.diagnostics) {
    error.diagnostics = apiKeyDiagnostics(apiKey);
  }
  return error;
}

function cacheConfigurationFailure(key, error, apiKey = getApiKey()) {
  if (!key || !isCacheableConfigurationError(error)) return;
  lastConfigurationFailure = { key, error: cloneConfigurationError(error) };
  rememberConfigurationFailure(key, error);
  rememberConfigurationFailure(configurationEnvironmentKey(apiKey), error);
}

function getCachedConfigurationFailure(key, apiKey = getApiKey()) {
  if (!key) return null;
  const cached = configurationFailureCache.get(key) ||
    configurationFailureCache.get(configurationEnvironmentKey(apiKey)) ||
    (lastConfigurationFailure?.key === key ? lastConfigurationFailure.error : null);
  return cached ? cloneConfigurationError(cached) : null;
}

export function getPurchaseConfigurationDiagnostics() {
  return apiKeyDiagnostics();
}

export function getPurchaseConfigurationIssue() {
  const apiKey = getApiKey();
  if (isExpoGoRuntime() && !REVENUECAT_TEST_STORE_API_KEY) {
    return configurationError(
      "RevenueCat native purchases are unavailable in Expo Go with App Store keys. Use a Woof development build, TestFlight, App Store build, or configure REVENUECAT_TEST_STORE_API_KEY for local Expo Go testing.",
      "expo_go_revenuecat_unavailable",
      apiKey
    );
  }
  if (!apiKey) {
    return configurationError(
      `Missing RevenueCat ${Platform.OS} public SDK key.`,
      "missing_revenuecat_api_key",
      apiKey
    );
  }
  const expectedPrefix = expectedApiKeyPrefix(apiKey);
  if (!apiKey.startsWith(expectedPrefix)) {
    return configurationError(
      `RevenueCat ${Platform.OS} public SDK key must start with ${expectedPrefix}.`,
      "invalid_revenuecat_api_key_prefix",
      apiKey
    );
  }
  return null;
}

export async function initializePurchases(userId) {
  const appUserID = userId || null;
  if (initialized && configuredUserId === appUserID) return true;
  if (initializingPromise) return initializingPromise;
  const apiKey = getApiKey();
  const attemptKey = configurationAttemptKey(appUserID, apiKey);
  const cachedConfigurationFailure = getCachedConfigurationFailure(attemptKey);
  if (cachedConfigurationFailure) throw cachedConfigurationFailure;

  const configurationIssue = getPurchaseConfigurationIssue();
  if (configurationIssue) {
    if (configurationIssue.code === "missing_revenuecat_api_key") {
      console.log("[PURCHASES] Missing RevenueCat API key:", configurationIssue.diagnostics);
    } else if (configurationIssue.code === "invalid_revenuecat_api_key_prefix") {
      console.log("[PURCHASES] Invalid RevenueCat API key prefix:", configurationIssue.diagnostics);
    }
    cacheConfigurationFailure(attemptKey, configurationIssue);
    throw configurationIssue;
  }

  initializingPromise = (async () => {
    if (initialized && configuredUserId !== appUserID && appUserID) {
      await withPurchasesTimeout(
        "RevenueCat logIn",
        Purchases.logIn(appUserID),
        PURCHASES_CONFIGURE_TIMEOUT_MS
      );
      configuredUserId = appUserID;
      console.log("[PURCHASES] Switched RevenueCat user:", appUserID);
      return true;
    }

    const config = appUserID ? { apiKey, appUserID } : { apiKey };
    await withPurchasesTimeout(
      "RevenueCat configure",
      Purchases.configure(config),
      PURCHASES_CONFIGURE_TIMEOUT_MS
    );
    initialized = true;
    configuredUserId = appUserID;
    console.log("[PURCHASES] Initialized for user:", appUserID || "anonymous");
    return true;
  })();

  try {
    return await initializingPromise;
  } catch (err) {
    const normalizedError = normalizePurchasesError(err, apiKey);
    cacheConfigurationFailure(attemptKey, normalizedError);
    console.log("[PURCHASES] Init error:", normalizedError.message, normalizedError.diagnostics);
    throw normalizedError;
  } finally {
    initializingPromise = null;
  }
}

/**
 * Reset initialized state so purchases can be re-configured for a new user.
 */
export function resetPurchases() {
  initialized = false;
  configuredUserId = null;
  initializingPromise = null;
  lastConfigurationFailure = null;
  configurationFailureCache.clear();
}

export async function logOutPurchases() {
  try {
    if (initialized && configuredUserId) {
      const isConfigured = await Purchases.isConfigured().catch(() => false);
      if (isConfigured) {
        await Purchases.logOut();
        console.log("[PURCHASES] Logged out RevenueCat user:", configuredUserId);
      }
    }
    return true;
  } catch (err) {
    console.log("[PURCHASES] Logout error:", err.message);
    return false;
  } finally {
    resetPurchases();
  }
}

export async function checkProStatus(userId = configuredUserId) {
  try {
    await initializePurchases(userId || null);
    const customerInfo = await withPurchasesTimeout(
      "RevenueCat customer info",
      Purchases.getCustomerInfo(),
      PURCHASES_CUSTOMER_INFO_TIMEOUT_MS
    );
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
  } catch (err) {
    if (err.code !== "expo_go_revenuecat_unavailable") {
      console.log("[PURCHASES] Customer info error:", err.message, err.diagnostics || "");
    }
    return null;
  }
}

export async function getOfferings(userId = configuredUserId) {
  try {
    await initializePurchases(userId || null);
    const offerings = await withPurchasesTimeout(
      "RevenueCat offerings",
      Purchases.getOfferings(),
      PURCHASES_OFFERINGS_TIMEOUT_MS
    );
    return { offering: offerings.current, error: null };
  } catch (err) {
    const normalizedError = normalizePurchasesError(err);
    if (normalizedError.code !== "expo_go_revenuecat_unavailable") {
      console.log("[PURCHASES] Offerings error:", normalizedError.message, normalizedError.diagnostics);
    }
    return { offering: null, error: normalizedError };
  }
}

// --- Package lookup helpers ---

export function getWeeklyPackage(offering) {
  if (!offering?.availablePackages) return null;
  return offering.availablePackages.find(
    (p) => p.packageType === "WEEKLY" || p.identifier === "$rc_weekly"
  ) || null;
}

export function getMonthlyPackage(offering) {
  if (!offering?.availablePackages) return null;
  return offering.availablePackages.find(
    (p) => p.packageType === "MONTHLY" || p.identifier === "$rc_monthly"
  ) || null;
}

export function getAnnualPackage(offering) {
  if (!offering?.availablePackages) return null;
  return offering.availablePackages.find(
    (p) => p.packageType === "ANNUAL" || p.identifier === "$rc_annual"
  ) || null;
}

export function getLifetimePackage(offering) {
  if (!offering?.availablePackages) return null;
  return offering.availablePackages.find(
    (p) => p.packageType === "LIFETIME" || p.identifier === "$rc_lifetime"
  ) || null;
}

// --- Purchase + Restore (structured returns) ---

export async function purchasePackage(pkg, userId = configuredUserId) {
  try {
    await initializePurchases(userId || null);
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const activeEntitlementIds = Object.keys(customerInfo.entitlements?.active || {});
    const allEntitlementIds = Object.keys(customerInfo.entitlements?.all || {});
    const success = activeEntitlementIds.includes(PRO_ENTITLEMENT_ID);
    if (!success) {
      console.log("[PURCHASES] Purchase returned without active Pro entitlement:", {
        packageId: pkg?.identifier,
        productId: pkg?.product?.identifier,
        expectedEntitlementId: PRO_ENTITLEMENT_ID,
        activeEntitlementIds,
        allEntitlementIds,
      });
      return {
        success: false,
        cancelled: false,
        error: "The store returned your purchase, but Pro access is not active yet. Restore purchases, then contact support if access still does not unlock.",
        code: "no_entitlement",
        packageId: pkg?.identifier || null,
        productId: pkg?.product?.identifier || null,
        expectedEntitlementId: PRO_ENTITLEMENT_ID,
        activeEntitlementIds,
        allEntitlementIds,
      };
    }
    return { success, cancelled: false, error: null };
  } catch (err) {
    if (err.userCancelled) {
      return { success: false, cancelled: true, error: null };
    }
    console.log("[PURCHASES] Purchase error:", err.code, err.message);
    // Provide user-friendly messages for common StoreKit errors
    let message = err.message || "Purchase failed";
    if (err.code === "STORE_PROBLEM" || err.code === 2 || /store/i.test(err.message)) {
      message = "There was a problem connecting to the App Store. Please check your internet connection and try again. If the issue persists, go to Settings > App Store and make sure you're signed in.";
    } else if (err.code === "NETWORK_ERROR" || err.code === 1) {
      message = "Network error. Please check your internet connection and try again.";
    } else if (err.code === "PRODUCT_NOT_AVAILABLE" || err.code === 7) {
      message = "This subscription is temporarily unavailable. Please try again later.";
    } else if (err.code === "PAYMENT_PENDING" || err.code === 4) {
      message = "Your payment is pending approval. You'll get access once it's confirmed.";
    }
    return { success: false, cancelled: false, error: message };
  }
}

export async function restorePurchases(userId = configuredUserId) {
  try {
    await initializePurchases(userId || null);
    const customerInfo = await withPurchasesTimeout(
      "RevenueCat restore",
      Purchases.restoreTransactions(),
      PURCHASES_RESTORE_TIMEOUT_MS
    );
    const activeEntitlementIds = Object.keys(customerInfo.entitlements?.active || {});
    const allEntitlementIds = Object.keys(customerInfo.entitlements?.all || {});
    const success = activeEntitlementIds.includes(PRO_ENTITLEMENT_ID);
    if (!success && activeEntitlementIds.length > 0) {
      console.log("[PURCHASES] Restore returned entitlements without active Pro:", {
        expectedEntitlementId: PRO_ENTITLEMENT_ID,
        activeEntitlementIds,
        allEntitlementIds,
      });
      return {
        success: false,
        error: "Purchases were found, but Pro access was not activated. Please contact support.",
        code: "no_entitlement",
        expectedEntitlementId: PRO_ENTITLEMENT_ID,
        activeEntitlementIds,
        allEntitlementIds,
      };
    }
    return { success, error: null };
  } catch (err) {
    return { success: false, error: err.message || "Restore failed" };
  }
}
