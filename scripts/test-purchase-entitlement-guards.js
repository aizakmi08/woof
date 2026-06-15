#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const purchasesSource = fs.readFileSync(path.join(root, "services/purchases.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");
const paywallSource = fs.readFileSync(path.join(root, "screens/PaywallScreen.js"), "utf8");
const appConfigSource = fs.readFileSync(path.join(root, "app.config.js"), "utf8");
const validateConfigSource = fs.readFileSync(path.join(root, "scripts/validate-config.js"), "utf8");
const checkRevenueCatSource = fs.readFileSync(path.join(root, "scripts/check-revenuecat-config.js"), "utf8");
const envExampleSource = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`purchase entitlement guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  purchasesSource.includes('const PRO_ENTITLEMENT_ID = "pro"') &&
    purchasesSource.includes("export async function checkProStatus(userId = configuredUserId)") &&
    purchasesSource.includes("await initializePurchases(userId || null)") &&
    purchasesSource.includes("export async function getOfferings(userId = configuredUserId)") &&
    purchasesSource.includes("export async function purchasePackage(pkg, userId = configuredUserId)") &&
    purchasesSource.includes("export async function restorePurchases(userId = configuredUserId)") &&
    purchasesSource.includes("activeEntitlementIds.includes(PRO_ENTITLEMENT_ID)"),
  "purchase checks must use the configured Pro entitlement id and scope Pro refreshes, offerings, purchase, and restore to the current RevenueCat app user id"
);

assert(
  /code: "no_entitlement"[\s\S]{0,240}expectedEntitlementId: PRO_ENTITLEMENT_ID[\s\S]{0,120}activeEntitlementIds[\s\S]{0,120}allEntitlementIds/.test(
    purchasesSource
  ),
  "purchase no-entitlement results must include diagnostic entitlement metadata"
);

assert(
  /packageId: pkg\?\.identifier[\s\S]{0,80}productId: pkg\?\.product\?\.identifier/.test(
    purchasesSource
  ),
  "purchase no-entitlement diagnostics must include package and product ids"
);

assert(
  paywallSource.includes("const { refreshProStatus, isPro, user } = useAuth()") &&
    paywallSource.includes("const offeringsRequestRef = useRef(0)") &&
    paywallSource.includes("const requestId = ++offeringsRequestRef.current") &&
    paywallSource.includes("const purchaseUserId = user?.id || null") &&
    paywallSource.includes("getOfferings(purchaseUserId)") &&
    paywallSource.includes("requestId !== offeringsRequestRef.current") &&
    paywallSource.includes("purchasePackage(selectedPkg, user?.id || null)") &&
    paywallSource.includes("restorePurchases(user?.id || null)") &&
    paywallSource.includes("}, [user?.id])"),
  "Paywall must scope RevenueCat offerings, purchases, and restores to the signed-in Supabase user and drop stale anonymous offerings responses"
);

assert(
  (() => {
    const block = paywallSource.slice(
      paywallSource.indexOf('result.code === "no_entitlement"'),
      paywallSource.indexOf('} else if (result.error)', paywallSource.indexOf('result.code === "no_entitlement"'))
    );
    return block.includes("purchase_no_entitlement") &&
      block.includes("Alert.alert(") &&
      block.includes('"Purchase Received"') &&
      block.includes('"Restore Purchase"') &&
      block.includes("setTimeout(handleRestore, 0)");
  })(),
  "Paywall must show a purchase-received state with a restore action"
);

assert(
  paywallSource.includes("SUPPORT_EMAIL") &&
    /result\.code === "no_entitlement"[\s\S]{0,360}restore_no_entitlement[\s\S]{0,260}Support: \$\{SUPPORT_EMAIL\}/.test(
      paywallSource
    ),
  "restore no-entitlement state must include support guidance"
);

assert(
  packageJson.includes('"test:purchase-entitlement": "node scripts/test-purchase-entitlement-guards.js"') &&
    packageJson.includes("npm run test:purchase-entitlement"),
  "purchase entitlement guard must be wired into package scripts"
);

assert(
  purchasesSource.includes("export async function logOutPurchases()") &&
    purchasesSource.includes("Purchases.isConfigured()") &&
    purchasesSource.includes("Purchases.logOut()") &&
    /finally\s*\{[\s\S]{0,80}resetPurchases\(\);[\s\S]{0,20}\}/.test(purchasesSource),
  "RevenueCat logout must call the SDK when configured and always reset local purchase identity"
);

assert(
  purchasesSource.includes("export function getPurchaseConfigurationDiagnostics()") &&
    purchasesSource.includes('error.code = code') &&
    purchasesSource.includes("PURCHASES_CONFIGURE_TIMEOUT_MS = 8_000") &&
    purchasesSource.includes("PURCHASES_CUSTOMER_INFO_TIMEOUT_MS = 6_000") &&
    purchasesSource.includes("PURCHASES_OFFERINGS_TIMEOUT_MS = 8_000") &&
    purchasesSource.includes("PURCHASES_RESTORE_TIMEOUT_MS = 20_000") &&
    purchasesSource.includes("function purchasesTimeoutError(operation, timeoutMs)") &&
    purchasesSource.includes("function withPurchasesTimeout(operation, promise, timeoutMs)") &&
    purchasesSource.includes('error.code = "revenuecat_operation_timeout"') &&
    purchasesSource.includes("export function getPurchaseConfigurationIssue()") &&
    purchasesSource.includes("let lastConfigurationFailure = null") &&
    purchasesSource.includes("const configurationFailureCache = new Map()") &&
    purchasesSource.includes("MAX_CONFIGURATION_FAILURE_CACHE_SIZE = 8") &&
    purchasesSource.includes("function configurationAttemptKey(appUserID, apiKey = getApiKey())") &&
    purchasesSource.includes("function configurationEnvironmentKey(apiKey = getApiKey())") &&
    purchasesSource.includes("function cloneConfigurationError(error)") &&
    purchasesSource.includes("function isCacheableConfigurationError(error)") &&
    purchasesSource.includes("function isNativeStoreUnavailableError(error)") &&
    purchasesSource.includes("function rememberConfigurationFailure(key, error)") &&
    purchasesSource.includes("function normalizePurchasesError(error, apiKey = getApiKey())") &&
    purchasesSource.includes('/invalid api key/i.test(message)') &&
    purchasesSource.includes('/native store is not available/i.test(message)') &&
    purchasesSource.includes("function cacheConfigurationFailure(key, error, apiKey = getApiKey())") &&
    purchasesSource.includes("function getCachedConfigurationFailure(key, apiKey = getApiKey())") &&
    purchasesSource.includes("rememberConfigurationFailure(configurationEnvironmentKey(apiKey), error)") &&
    purchasesSource.includes("configurationFailureCache.get(configurationEnvironmentKey(apiKey))") &&
    purchasesSource.includes("const cachedConfigurationFailure = getCachedConfigurationFailure(attemptKey)") &&
    purchasesSource.includes("if (cachedConfigurationFailure) throw cachedConfigurationFailure") &&
    purchasesSource.includes("const configurationIssue = getPurchaseConfigurationIssue()") &&
    purchasesSource.includes("cacheConfigurationFailure(attemptKey, configurationIssue)") &&
    purchasesSource.includes("lastConfigurationFailure = null") &&
    purchasesSource.includes('withPurchasesTimeout(\n        "RevenueCat logIn"') &&
    purchasesSource.includes("Purchases.logIn(appUserID)") &&
    purchasesSource.includes("function isExpoGoRuntime()") &&
    purchasesSource.includes('import { NativeModules, Platform } from "react-native"') &&
    purchasesSource.includes("const nativeMobileWithoutPurchasesModule =") &&
    purchasesSource.includes('(Platform.OS === "ios" || Platform.OS === "android")') &&
    purchasesSource.includes("!NativeModules.RNPurchases") &&
    purchasesSource.includes("const revenueCatBrowserModeExpoGo = !NativeModules.RNPurchases") &&
    purchasesSource.includes("Boolean(globalThis?.expo?.modules?.ExpoGo)") &&
    purchasesSource.includes("return nativeMobileWithoutPurchasesModule ||") &&
    purchasesSource.includes("revenueCatBrowserModeExpoGo ||") &&
    purchasesSource.includes("Boolean(Constants.expoGoConfig)") &&
    purchasesSource.includes("REVENUECAT_TEST_STORE_API_KEY") &&
    purchasesSource.includes('if (isExpoGoRuntime() && REVENUECAT_TEST_STORE_API_KEY)') &&
    purchasesSource.includes('if (isExpoGoRuntime() && !REVENUECAT_TEST_STORE_API_KEY)') &&
    purchasesSource.includes('return "test_"') &&
    purchasesSource.includes("hasTestStoreKey") &&
    purchasesSource.includes('"expo_go_revenuecat_unavailable"') &&
    purchasesSource.includes("const normalizedError = normalizePurchasesError(err, apiKey)") &&
    purchasesSource.includes("const normalizedError = normalizePurchasesError(err)") &&
    purchasesSource.includes('code !== "expo_go_revenuecat_unavailable"') &&
    purchasesSource.includes('const config = appUserID ? { apiKey, appUserID } : { apiKey };') &&
    purchasesSource.includes('withPurchasesTimeout(\n      "RevenueCat configure"') &&
    purchasesSource.includes('withPurchasesTimeout(\n      "RevenueCat customer info"') &&
    purchasesSource.includes('withPurchasesTimeout(\n      "RevenueCat offerings"') &&
    purchasesSource.includes('withPurchasesTimeout(\n      "RevenueCat restore"') &&
    !purchasesSource.includes("withPurchasesTimeout(\n      \"RevenueCat purchase\""),
  "RevenueCat initialization must expose redacted diagnostics, use Test Store keys in Expo Go, cache configuration failures across user ids, avoid App Store-key Expo Go native SDK calls, avoid passing null appUserID into configure, and bound setup/offerings/status/restore SDK calls without timing out purchase sheets"
);

assert(
  appConfigSource.includes('"REVENUECAT_TEST_STORE_API_KEY"') &&
    appConfigSource.includes("EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY") &&
    appConfigSource.includes("REVENUECAT_TEST_STORE_API_KEY must start with test_") &&
    appConfigSource.includes("REVENUECAT_TEST_STORE_API_KEY must not be set for production builds") &&
    validateConfigSource.includes("REVENUECAT_TEST_STORE_API_KEY") &&
    validateConfigSource.includes("REVENUECAT_TEST_STORE_API_KEY must not be set for production builds") &&
    checkRevenueCatSource.includes('label: "Test Store"') &&
    checkRevenueCatSource.includes('prefix: "test_"') &&
    envExampleSource.includes("REVENUECAT_TEST_STORE_API_KEY=test_your-revenuecat-test-store-api-key"),
  "RevenueCat Test Store key must be documented, exported for local Expo Go use, and rejected from production builds"
);

const signedOutBlock = authSource.slice(
  authSource.indexOf('event === "SIGNED_OUT"'),
  authSource.indexOf("}\n      }\n    );", authSource.indexOf('event === "SIGNED_OUT"'))
);
const signedInBlock = authSource.slice(
  authSource.indexOf('event === "SIGNED_IN" && s?.user'),
  authSource.indexOf('if (event === "SIGNED_OUT"', authSource.indexOf('event === "SIGNED_IN" && s?.user'))
);
const signOutBlock = authSource.slice(
  authSource.indexOf("const signOut = useCallback"),
  authSource.indexOf("const deleteAccount = useCallback")
);
const deleteAccountBlock = authSource.slice(
  authSource.indexOf("const deleteAccount = useCallback"),
  authSource.indexOf("return (", authSource.indexOf("const deleteAccount = useCallback"))
);

assert(
  authSource.includes("logOutPurchases, getPurchaseConfigurationIssue } from \"./purchases\"") &&
    signOutBlock.includes("await logOutPurchases();") &&
    signOutBlock.indexOf("await logOutPurchases();") < signOutBlock.indexOf("supabase.auth.signOut()") &&
    deleteAccountBlock.includes("await logOutPurchases();") &&
    signedOutBlock.includes("await logOutPurchases();"),
  "auth sign-out, delete-account, and SIGNED_OUT handling must clear RevenueCat identity"
);

assert(
  authSource.includes("const startPurchaseStatusCheck = (userId, failurePrefix) => {") &&
    authSource.includes("const configurationIssue = getPurchaseConfigurationIssue()") &&
    authSource.includes('console.log("[AUTH] Purchases init skipped:", configurationIssue.code, configurationIssue.diagnostics)') &&
    authSource.includes('withTimeout(initializePurchases(userId), "PURCHASES_INIT", 5000)') &&
    authSource.includes('.then(() => withTimeout(checkProStatus(userId), "PRO_CHECK", 3000))') &&
    authSource.includes('.then((pro) => { if (mounted && typeof pro === "boolean") setIsPro(pro); })') &&
    authSource.includes(".catch((err) => console.log(failurePrefix, err.message))") &&
    signedInBlock.includes('startPurchaseStatusCheck(s.user.id, "[AUTH] RevenueCat init/pro check failed:")') &&
    !/initializePurchases\(s\.user\.id\)[\s\S]{0,180}\.catch\([\s\S]{0,180}\.then\(\(\) => checkProStatus\(\)/.test(signedInBlock),
  "SIGNED_IN purchase flow must skip known configuration failures and must not run checkProStatus after initializePurchases fails"
);

assert(
  authSource.includes("setIsPro(Boolean(data.is_pro));") &&
    !authSource.includes("if (data.is_pro) setIsPro(true);"),
  "profile hydration must mirror profiles.is_pro both ways so stale local Pro state cannot bypass client quota UI or auto-dismiss paywalls"
);

assert(
  authSource.includes('import { AppState } from "react-native";') &&
    authSource.includes("useCallback, useRef") &&
    authSource.includes("PROFILE_FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30_000") &&
    authSource.includes("const foregroundProfileRefreshRef = useRef({") &&
    authSource.includes("AppState.currentState") &&
    authSource.includes('AppState.addEventListener("change"') &&
    authSource.includes('nextAppState === "active"') &&
    authSource.includes('previousAppState !== "active"') &&
    authSource.includes("now - foregroundProfileRefreshRef.current.lastRefreshAt") &&
    authSource.includes('"PROFILE_FOREGROUND_REFRESH"') &&
    authSource.includes('.select("is_pro, scan_count")') &&
    authSource.includes("setIsPro(Boolean(data.is_pro))") &&
    authSource.includes("setScanCount(serverCount)") &&
    authSource.includes("subscription.remove()"),
  "signed-in foreground resumes must run a bounded profiles.is_pro/scan_count refresh so webhook/server entitlement changes are picked up before the next scan"
);

assert(
  authSource.includes("const PRO_STATUS_PROFILE_TIMEOUT_MS = 3000") &&
    /const refreshProStatus = useCallback\(async \(\) => \{[\s\S]{0,120}let purchasePro = null;[\s\S]{0,180}purchasePro = await checkProStatus\(user\?\.id \|\| null\);[\s\S]{0,160}if \(purchasePro === true\)[\s\S]{0,500}if \(user\?\.id\) \{[\s\S]{0,180}const \{ data, error \} = await withTimeout\([\s\S]{0,180}\.from\("profiles"\)[\s\S]{0,120}\.select\("is_pro"\)[\s\S]{0,120}\.eq\("id", user\.id\)[\s\S]{0,120}\.single\(\),[\s\S]{0,120}"PROFILE_PRO_REFRESH",[\s\S]{0,120}PRO_STATUS_PROFILE_TIMEOUT_MS[\s\S]{0,220}typeof data\?\.is_pro === "boolean"[\s\S]{0,220}setIsPro\(data\.is_pro\);[\s\S]{0,120}return data\.is_pro;[\s\S]{0,260}if \(typeof purchasePro === "boolean"\)[\s\S]{0,120}return purchasePro;[\s\S]{0,80}\}, \[user\?\.id\]\);/.test(authSource),
  "refreshProStatus must fall back to a bounded profiles.is_pro read for signed-in users when RevenueCat cannot answer, so Pro quota recovery can retry without an app restart or infinite refresh loader"
);

console.log("purchase entitlement guard passed");
