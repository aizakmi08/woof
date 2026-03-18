import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import Constants from "expo-constants";

const REVENUECAT_API_KEY_IOS =
  Constants.expoConfig?.extra?.REVENUECAT_API_KEY_IOS || "appl_YOUR_IOS_KEY";
const REVENUECAT_API_KEY_ANDROID =
  Constants.expoConfig?.extra?.REVENUECAT_API_KEY_ANDROID || "goog_YOUR_ANDROID_KEY";

let initialized = false;

export async function initializePurchases(userId) {
  if (initialized) return;
  try {
    await Purchases.configure({
      apiKey:
        Platform.OS === "ios"
          ? REVENUECAT_API_KEY_IOS
          : REVENUECAT_API_KEY_ANDROID,
      appUserID: userId,
    });
    initialized = true;
    console.log("[PURCHASES] Initialized for user:", userId);
  } catch (err) {
    console.log("[PURCHASES] Init error:", err.message);
  }
}

/**
 * Reset initialized state so purchases can be re-configured for a new user.
 */
export function resetPurchases() {
  initialized = false;
}

export async function checkProStatus() {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active["pro"] !== undefined;
  } catch {
    return false;
  }
}

export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
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
    const success = customerInfo.entitlements.active["pro"] !== undefined;
    return { success, cancelled: false, error: null };
  } catch (err) {
    if (err.userCancelled) {
      return { success: false, cancelled: true, error: null };
    }
    return { success: false, cancelled: false, error: err.message || "Purchase failed" };
  }
}

export async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restoreTransactions();
    const success = customerInfo.entitlements.active["pro"] !== undefined;
    return { success, error: null };
  } catch (err) {
    return { success: false, error: err.message || "Restore failed" };
  }
}
