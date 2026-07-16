import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";
import { createLogger } from "./logger";
import { trackEvent } from "./analytics";
import {
  REVENUECAT_API_KEY_ANDROID,
  REVENUECAT_API_KEY_IOS,
} from "../config/env";

let sdkConfigured = false;
let configuredUserId = null;
let configWarningLogged = false;
let resetPromise = null;
let appleSearchAdsAttributionStatus = Platform.OS === "ios" ? "not_attempted" : "not_applicable";
let appleSearchAdsAttributionError = null;
let appleSearchAdsAttributionPromise = null;
let appleSearchAdsAttributionUserId = null;
const logger = createLogger("PURCHASES");

function isPlaceholderKey(key) {
  return !key || key.includes("YOUR_") || key.endsWith("_KEY");
}

function getRevenueCatApiKey() {
  return Platform.OS === "ios"
    ? REVENUECAT_API_KEY_IOS
    : REVENUECAT_API_KEY_ANDROID;
}

function isExpoGoWithProductionStoreKey(apiKey) {
  return Constants.executionEnvironment === "storeClient" && !/^test_/i.test(String(apiKey || ""));
}

function safeIdentifierList(value) {
  return Array.isArray(value)
    ? value
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim().slice(0, 120))
      .slice(0, 20)
    : [];
}

function customerInfoSummary(customerInfo) {
  const entitlementIds = Object.keys(customerInfo?.entitlements?.active || {})
    .filter(Boolean)
    .map((item) => String(item).slice(0, 80))
    .slice(0, 20);
  const activeSubscriptionIds = safeIdentifierList(customerInfo?.activeSubscriptions);

  return {
    entitlement_ids: entitlementIds,
    active_entitlement_count: entitlementIds.length,
    active_subscription_ids: activeSubscriptionIds,
    active_subscription_count: activeSubscriptionIds.length,
    has_pro_entitlement: entitlementIds.includes("pro"),
  };
}

function revenueCatErrorCode(err) {
  const code = err?.code ?? err?.errorCode ?? err?.underlyingErrorCode ?? null;
  return code == null ? null : String(code).slice(0, 80);
}

function revenueCatErrorName(err) {
  const name = err?.name || err?.constructor?.name || null;
  return name ? String(name).slice(0, 80) : null;
}

function safePlacementIdentifier(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 80) return null;
  return /^[a-z0-9_.-]+$/.test(normalized) ? normalized : null;
}

function isPaymentPendingError(err) {
  const code = revenueCatErrorCode(err);
  const message = String(err?.message || "");
  return (
    code === "PAYMENT_PENDING" ||
    code === "PAYMENT_PENDING_ERROR" ||
    code === "4" ||
    /payment.*pending|pending.*approval/i.test(message)
  );
}

export function getRevenueCatResultAnalytics(result = {}) {
  const entitlementIds = safeIdentifierList(result.entitlement_ids);
  const activeSubscriptionIds = safeIdentifierList(result.active_subscription_ids);

  return {
    error_code: result.error_code || null,
    error_name: result.error_name || null,
    payment_pending: result.pending === true,
    active_entitlement_count: Number.isFinite(result.active_entitlement_count)
      ? result.active_entitlement_count
      : entitlementIds.length,
    active_entitlement_ids: entitlementIds,
    active_subscription_count: Number.isFinite(result.active_subscription_count)
      ? result.active_subscription_count
      : activeSubscriptionIds.length,
    active_subscription_ids: activeSubscriptionIds,
    has_pro_entitlement: result.has_pro_entitlement === true,
  };
}

export function getRevenueCatConfigStatus() {
  const apiKey = getRevenueCatApiKey();
  const requiresDevelopmentBuild = isExpoGoWithProductionStoreKey(apiKey);
  return {
    configured: !isPlaceholderKey(apiKey) && !requiresDevelopmentBuild,
    requiresDevelopmentBuild,
    executionEnvironment: Constants.executionEnvironment,
    platform: Platform.OS,
    apple_search_ads_attribution_status: appleSearchAdsAttributionStatus,
    apple_search_ads_attribution_error: appleSearchAdsAttributionError,
  };
}

function attributionErrorText(err) {
  const message = err?.message || err?.toString?.() || "";
  return message ? String(message).slice(0, 160) : null;
}

async function requestAppleSearchAdsAttributionCollection({ source = "initialize_purchases", userId = null } = {}) {
  if (Platform.OS !== "ios") {
    appleSearchAdsAttributionStatus = "not_applicable";
    appleSearchAdsAttributionError = null;
    return { requested: false, status: appleSearchAdsAttributionStatus };
  }

  if (
    appleSearchAdsAttributionStatus === "not_supported" ||
    appleSearchAdsAttributionStatus === "failed" ||
    (appleSearchAdsAttributionStatus === "requested" && appleSearchAdsAttributionUserId === userId)
  ) {
    return { requested: false, status: appleSearchAdsAttributionStatus };
  }

  if (appleSearchAdsAttributionPromise) {
    return appleSearchAdsAttributionPromise;
  }

  appleSearchAdsAttributionPromise = (async () => {
    const methodAvailable = typeof Purchases.enableAdServicesAttributionTokenCollection === "function";
    const eventBase = {
      source,
      platform: Platform.OS,
      method_available: methodAvailable,
      attribution_provider: "apple_search_ads",
      collection_method: "revenuecat_adservices",
      reidentified: Boolean(appleSearchAdsAttributionUserId && appleSearchAdsAttributionUserId !== userId),
    };

    if (!methodAvailable) {
      appleSearchAdsAttributionStatus = "not_supported";
      appleSearchAdsAttributionError = "RevenueCat AdServices token collection method unavailable";
      await trackEvent("apple_search_ads_attribution_collection_failed", {
        ...eventBase,
        status: appleSearchAdsAttributionStatus,
        message: appleSearchAdsAttributionError,
      });
      return { requested: false, status: appleSearchAdsAttributionStatus };
    }

    try {
      await Purchases.enableAdServicesAttributionTokenCollection();
      appleSearchAdsAttributionStatus = "requested";
      appleSearchAdsAttributionError = null;
      appleSearchAdsAttributionUserId = userId;
      await trackEvent("apple_search_ads_attribution_collection_requested", {
        ...eventBase,
        status: appleSearchAdsAttributionStatus,
      });
      return { requested: true, status: appleSearchAdsAttributionStatus };
    } catch (err) {
      appleSearchAdsAttributionStatus = "failed";
      appleSearchAdsAttributionError = attributionErrorText(err) || "Apple Search Ads attribution collection failed";
      logger.debug("[PURCHASES] Apple Search Ads attribution error:", appleSearchAdsAttributionError);
      await trackEvent("apple_search_ads_attribution_collection_failed", {
        ...eventBase,
        status: appleSearchAdsAttributionStatus,
        message: appleSearchAdsAttributionError,
      });
      return { requested: false, status: appleSearchAdsAttributionStatus };
    } finally {
      appleSearchAdsAttributionPromise = null;
    }
  })();

  return appleSearchAdsAttributionPromise;
}

export async function initializePurchases(userId) {
  if (resetPromise) {
    await resetPromise.catch(() => {});
  }

  if (sdkConfigured && configuredUserId === userId) {
    await requestAppleSearchAdsAttributionCollection({
      source: "initialize_purchases_existing_user",
      userId,
    });
    return true;
  }

  try {
    const apiKey = getRevenueCatApiKey();
    if (isPlaceholderKey(apiKey)) {
      if (!configWarningLogged) {
        logger.debug("[PURCHASES] RevenueCat API key missing for platform:", Platform.OS);
        configWarningLogged = true;
      }
      configuredUserId = null;
      return false;
    }

    if (isExpoGoWithProductionStoreKey(apiKey)) {
      if (!configWarningLogged) {
        logger.debug("[PURCHASES] Expo Go requires a RevenueCat Test Store key; native purchases are disabled for this preview.");
        configWarningLogged = true;
      }
      configuredUserId = null;
      return false;
    }

    if (!sdkConfigured && typeof Purchases.isConfigured === "function") {
      const nativeConfigured = await Purchases.isConfigured().catch(() => false);
      if (nativeConfigured) {
        sdkConfigured = true;
        const nativeUserId = typeof Purchases.getAppUserID === "function"
          ? await Purchases.getAppUserID().catch(() => null)
          : null;
        if (nativeUserId !== userId) {
          await Purchases.logIn(userId);
        }
        configuredUserId = userId;
        await requestAppleSearchAdsAttributionCollection({
          source: "initialize_purchases_native_reuse",
          userId,
        });
        logger.debug("[PURCHASES] Reused native RevenueCat instance for user:", userId);
        return true;
      }
    }

    if (sdkConfigured) {
      await Purchases.logIn(userId);
      configuredUserId = userId;
      await requestAppleSearchAdsAttributionCollection({
        source: "initialize_purchases_login",
        userId,
      });
      logger.debug("[PURCHASES] Switched RevenueCat user:", userId);
      return true;
    }

    await Purchases.configure({
      apiKey,
      appUserID: userId,
    });
    sdkConfigured = true;
    configuredUserId = userId;
    await requestAppleSearchAdsAttributionCollection({
      source: "initialize_purchases_configure",
      userId,
    });
    logger.debug("[PURCHASES] Initialized for user:", userId);
    return true;
  } catch (err) {
    logger.debug("[PURCHASES] Init error:", err.message);
    configuredUserId = null;
    return false;
  }
}

/**
 * Reset initialized state so purchases can be re-configured for a new user.
 */
export function resetPurchases() {
  if (resetPromise) return resetPromise;

  const userToReset = configuredUserId;
  configuredUserId = null;

  if (!sdkConfigured || !userToReset) {
    return Promise.resolve(false);
  }

  resetPromise = Purchases.logOut()
    .then(() => true)
    .catch((err) => {
      logger.debug("[PURCHASES] logOut failed:", err.message);
      return false;
    })
    .finally(() => {
      resetPromise = null;
    });

  return resetPromise;
}

export async function getProStatus() {
  if (!sdkConfigured) {
    return { checked: false, isPro: false, reason: "not_configured" };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return {
      checked: true,
      isPro: customerInfo.entitlements.active["pro"] !== undefined,
      reason: null,
    };
  } catch (err) {
    logger.debug("[PURCHASES] Customer info error:", err?.message || "Customer info unavailable");
    return { checked: false, isPro: false, reason: "customer_info_error" };
  }
}

export async function checkProStatus() {
  const status = await getProStatus();
  return status.isPro;
}

export async function getOfferings() {
  if (!sdkConfigured) return null;

  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

export async function getPaywallOffering(placementIdentifier = null) {
  const normalizedPlacement = safePlacementIdentifier(placementIdentifier);
  const placementSupported = typeof Purchases.getCurrentOfferingForPlacement === "function";
  const placementRequested = Boolean(normalizedPlacement);

  if (!sdkConfigured) {
    return {
      offering: null,
      placementIdentifier: normalizedPlacement,
      fetchMode: "not_configured",
      placementRequested,
      placementSupported,
      placementOfferingReturned: false,
      placementFallbackUsed: false,
    };
  }

  if (normalizedPlacement && placementSupported) {
    try {
      const placementOffering = await Purchases.getCurrentOfferingForPlacement(normalizedPlacement);
      if (placementOffering) {
        return {
          offering: placementOffering,
          placementIdentifier: normalizedPlacement,
          fetchMode: "placement",
          placementRequested,
          placementSupported,
          placementOfferingReturned: true,
          placementFallbackUsed: false,
        };
      }
    } catch (err) {
      logger.debug(
        "[PURCHASES] Placement offering error:",
        revenueCatErrorCode(err) || err?.message || "Unavailable"
      );
    }
  }

  const currentOffering = await getOfferings();
  return {
    offering: currentOffering,
    placementIdentifier: normalizedPlacement,
    fetchMode: normalizedPlacement && placementSupported
      ? "placement_fallback_current"
      : "current",
    placementRequested,
    placementSupported,
    placementOfferingReturned: false,
    placementFallbackUsed: Boolean(normalizedPlacement && placementSupported),
  };
}

export function getOfferingMetadata(offering) {
  const metadata = offering?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

function introEligibilityStatus(value) {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return value.status ?? value.introEligibilityStatus ?? null;
}

export function isIntroEligibilityEligible(value) {
  const status = introEligibilityStatus(value);
  return status === 2 || status === "INTRO_ELIGIBILITY_STATUS_ELIGIBLE";
}

function hasZeroPrice(value) {
  if (value == null) return false;
  const directPrice = Number(value.price);
  if (Number.isFinite(directPrice) && directPrice === 0) return true;
  const amountMicros = Number(value.priceAmountMicros ?? value.amountMicros ?? value.price?.amountMicros);
  if (Number.isFinite(amountMicros) && amountMicros === 0) return true;
  const formattedPrice = String(value.priceString ?? value.formatted ?? value.price?.formatted ?? "").toLowerCase();
  if (formattedPrice === "free") return true;
  if (/^[^\d-]*0(?:[.,]0{1,2})?[^\d-]*$/.test(formattedPrice)) return true;
  return false;
}

function normalizePeriodUnit(unit) {
  const normalized = String(unit || "").toLowerCase();
  if (normalized.startsWith("day") || normalized === "d") return "day";
  if (normalized.startsWith("week") || normalized === "w") return "week";
  if (normalized.startsWith("month") || normalized === "m") return "month";
  if (normalized.startsWith("year") || normalized === "y") return "year";
  return null;
}

function periodFromIso(isoPeriod) {
  if (typeof isoPeriod !== "string") return null;
  const match = isoPeriod.trim().match(/^P(\d+)([DWMY])$/i);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: normalizePeriodUnit(match[2]),
  };
}

function periodFromValue(value) {
  if (typeof value === "string") return periodFromIso(value);
  if (!value || typeof value !== "object") return null;
  const nested = value.billingPeriod || value.period;
  if (nested && typeof nested === "object") {
    const nestedPeriod = periodFromValue(nested);
    if (nestedPeriod) return nestedPeriod;
  }

  const iso = value.iso8601 || (typeof nested === "string" ? nested : null);
  const isoPeriod = periodFromIso(iso);
  if (isoPeriod) return isoPeriod;

  const unit = normalizePeriodUnit(value.periodUnit || value.unit);
  const rawValue = Number(value.periodNumberOfUnits ?? value.value);
  if (unit && Number.isFinite(rawValue) && rawValue > 0) {
    const cycles = Number(value.cycles ?? value.billingCycleCount ?? 1);
    const multiplier = Number.isFinite(cycles) && cycles > 1 ? cycles : 1;
    return { value: rawValue * multiplier, unit };
  }

  return null;
}

function formatPeriodLabel(period) {
  if (!period?.unit || !Number.isFinite(period.value) || period.value <= 0) return "trial";
  const rounded = Math.round(period.value);
  const unit = rounded === 1 ? period.unit : `${period.unit}s`;
  return `${rounded} ${unit}`;
}

function getFreeTrialPhaseInfo(value) {
  if (!value || typeof value !== "object" || !hasZeroPrice(value)) return null;
  return {
    configured: true,
    trialLabel: formatPeriodLabel(periodFromValue(value)),
  };
}

function getSubscriptionOptionFreeTrialInfo(option) {
  if (!option || typeof option !== "object") return null;

  const explicitPhase = getFreeTrialPhaseInfo(option.freePhase)
    || getFreeTrialPhaseInfo(option.freeTrialPhase)
    || getFreeTrialPhaseInfo(option.freeTrial);
  if (explicitPhase) return explicitPhase;

  if (option.freeTrial === true || option.trialPeriod) {
    return {
      configured: true,
      trialLabel: formatPeriodLabel(periodFromValue(option.trialPeriod || option)),
    };
  }

  const phases = [
    option.pricingPhase,
    ...(Array.isArray(option.pricingPhases) ? option.pricingPhases : []),
  ].filter(Boolean);

  for (const phase of phases) {
    const phaseInfo = getFreeTrialPhaseInfo(phase);
    if (phaseInfo) return phaseInfo;
  }

  return null;
}

function getSubscriptionOptions(product) {
  const options = product?.subscriptionOptions;
  return [
    product?.defaultOption,
    options?.freeTrial,
    options?.defaultOption,
    ...(Array.isArray(options?.all) ? options.all : []),
    ...(Array.isArray(options) ? options : []),
  ].filter(Boolean);
}

function getConfiguredFreeTrialInfo(product) {
  const introPriceInfo = getFreeTrialPhaseInfo(product?.introPrice);
  if (introPriceInfo) return introPriceInfo;

  for (const option of getSubscriptionOptions(product)) {
    const optionInfo = getSubscriptionOptionFreeTrialInfo(option);
    if (optionInfo) return optionInfo;
  }

  return {
    configured: false,
    trialLabel: null,
  };
}

export function getPackageTrialInfo(pkg, eligibilityByProductId = {}) {
  const product = pkg?.product || pkg?.storeProduct || null;
  const productId = product?.identifier || null;
  const configuredTrial = getConfiguredFreeTrialInfo(product);
  const configured = configuredTrial.configured;
  const eligibility = productId ? eligibilityByProductId[productId] : null;
  const status = introEligibilityStatus(eligibility);
  const eligible = isIntroEligibilityEligible(eligibility);
  const trialLabel = configuredTrial.trialLabel || "trial";

  if (Platform.OS === "ios") {
    return {
      configured,
      eligible,
      canClaimTrial: configured && eligible,
      eligibilityStatus: status ?? "unknown",
      trialLabel,
    };
  }

  return {
    configured,
    eligible: configured,
    canClaimTrial: configured,
    eligibilityStatus: status ?? "not_checked",
    trialLabel,
  };
}

export async function getIntroEligibilityByProductId(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!sdkConfigured || ids.length === 0 || Platform.OS !== "ios") return {};

  if (typeof Purchases.checkTrialOrIntroductoryPriceEligibility !== "function") {
    return {};
  }

  try {
    return await Purchases.checkTrialOrIntroductoryPriceEligibility(ids);
  } catch (err) {
    logger.debug("[PURCHASES] Trial eligibility check failed:", err?.message || "Unavailable");
    return {};
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

export async function purchasePackage(pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const summary = customerInfoSummary(customerInfo);
    return {
      ...summary,
      success: summary.has_pro_entitlement,
      cancelled: false,
      pending: false,
      error: null,
      error_code: null,
      error_name: null,
    };
  } catch (err) {
    const error_code = revenueCatErrorCode(err);
    const error_name = revenueCatErrorName(err);
    if (err.userCancelled) {
      return {
        success: false,
        cancelled: true,
        pending: false,
        error: null,
        error_code,
        error_name,
      };
    }
    logger.debug("[PURCHASES] Purchase error:", err.code, err.message);
    // Provide user-friendly messages for common store billing errors.
    let message = err.message || "Purchase failed";
    const pending = isPaymentPendingError(err);
    if (err.code === "STORE_PROBLEM" || err.code === 2 || /store/i.test(err.message)) {
      message = "There was a problem connecting to the store. Please check your internet connection and make sure you're signed in to the App Store or Google Play.";
    } else if (err.code === "NETWORK_ERROR" || err.code === 1) {
      message = "Network error. Please check your internet connection and try again.";
    } else if (err.code === "PRODUCT_NOT_AVAILABLE" || err.code === 7) {
      message = "This subscription is temporarily unavailable. Please try again later.";
    } else if (pending) {
      message = "Your payment is pending approval. You'll get access once it's confirmed.";
    }
    return {
      success: false,
      cancelled: false,
      pending,
      error: message,
      error_code,
      error_name,
    };
  }
}

export async function restorePurchases() {
  if (!sdkConfigured) {
    const configStatus = getRevenueCatConfigStatus();
    return {
      success: false,
      error: configStatus.requiresDevelopmentBuild
        ? "Restore Purchases requires a development build or TestFlight."
        : "Purchases aren't available in this build. Please try again from the App Store or Google Play version.",
      error_code: "NOT_CONFIGURED",
      error_name: "RevenueCatNotConfiguredError",
    };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const summary = customerInfoSummary(customerInfo);
    return {
      ...summary,
      success: summary.has_pro_entitlement,
      error: null,
      error_code: null,
      error_name: null,
    };
  } catch (err) {
    logger.debug("[PURCHASES] Restore error:", err?.code, err?.message);
    return {
      success: false,
      error: "We couldn't restore purchases right now. Please check your App Store or Google Play connection and try again.",
      error_code: revenueCatErrorCode(err),
      error_name: revenueCatErrorName(err),
    };
  }
}
