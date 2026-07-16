import fs from "node:fs";

const failures = [];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  failures.push(message);
}

function requireSnippet(filePath, source, snippet, message) {
  if (!source.includes(snippet)) {
    fail(`${filePath}: ${message || `Missing ${snippet}`}`);
  }
}

function requireSnippets(filePath, source, snippets, area) {
  for (const snippet of snippets) {
    requireSnippet(filePath, source, snippet, `${area}: missing ${snippet}`);
  }
}

function requireRegex(filePath, source, regex, message) {
  if (!regex.test(source)) {
    fail(`${filePath}: ${message}`);
  }
}

function requireSnippetBefore(filePath, source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex >= secondIndex) {
    fail(`${filePath}: ${message}`);
  }
}

const packageJson = JSON.parse(readText("package.json"));
const workflow = readText(".github/workflows/ci.yml");
const releaseGates = readText("scripts/release-gates.mjs");
const appSource = readText("App.js");
const paywall = readText("screens/PaywallScreen.js");
const purchases = readText("services/purchases.js");
const revenuecatSync = readText("services/revenuecatSync.js");
const auth = readText("services/auth.js");
const experimentPlan = readText("REVENUECAT_EXPERIMENT_PLAN.md");
const testflightRunbook = readText("REVENUECAT_TESTFLIGHT_RUNBOOK.md");
const checklist = readText("DEPLOYMENT_CHECKLIST.md");
const kpiFramework = readText("KPI_FRAMEWORK.md");
const runbook = readText("WEEKLY_REVIEW_RUNBOOK.md");
const kpiSql = readText("supabase/migrations/065_kpi_reporting_views.sql");
const storeKitConfigPath = "native/ios/Woof.storekit";
const storeKitTestPath = "native/ios/WoofConfigurationTests.swift";
const storeKitPluginPath = "plugins/withWoofStoreKitTesting.js";
const generatedStoreKitSchemePath = "ios/woof.xcodeproj/xcshareddata/xcschemes/woof StoreKit.xcscheme";
const generatedStoreKitConfigPath = "ios/woof/Woof.storekit";
const storeKitConfig = JSON.parse(readText(storeKitConfigPath));
const storeKitTest = readText(storeKitTestPath);
const storeKitPlugin = readText(storeKitPluginPath);
const generatedStoreKitScheme = readText(generatedStoreKitSchemePath);
const generatedStoreKitConfig = fs.existsSync(generatedStoreKitConfigPath)
  ? JSON.parse(readText(generatedStoreKitConfigPath))
  : null;

const storeKitSubscriptions = (storeKitConfig.subscriptionGroups || [])
  .flatMap((group) => group.subscriptions || []);
const expectedStoreKitSubscriptions = [
  { productID: "woof_pro_weekly", displayPrice: "4.99", period: "P1W" },
  { productID: "woof_pro_monthly", displayPrice: "7.99", period: "P1M" },
  { productID: "woof_pro_annual", displayPrice: "29.99", period: "P1Y" },
];

if (packageJson.scripts?.["check:revenuecat"] !== "node scripts/check-revenuecat-readiness.mjs") {
  fail("package.json: check:revenuecat must run scripts/check-revenuecat-readiness.mjs");
}

requireSnippet(".github/workflows/ci.yml", workflow, "npm run check:revenuecat", "CI must run the RevenueCat readiness gate");
requireSnippet("scripts/release-gates.mjs", releaseGates, "scripts/check-revenuecat-readiness.mjs", "release preflight must run the RevenueCat readiness gate");
requireSnippet("DEPLOYMENT_CHECKLIST.md", checklist, "npm run check:revenuecat", "preflight command list must include check:revenuecat");

if (storeKitConfig.settings?._storefront !== "USA") {
  fail(`${storeKitConfigPath}: simulator storefront must be USA`);
}

if (storeKitConfig.settings?._timeRate !== 0) {
  fail(`${storeKitConfigPath}: committed subscription renewal rate must remain Real Time`);
}

if (generatedStoreKitConfig && generatedStoreKitConfig.settings?._timeRate !== 0) {
  fail(`${generatedStoreKitConfigPath}: generated subscription renewal rate must remain Real Time`);
}

if (storeKitSubscriptions.length !== expectedStoreKitSubscriptions.length) {
  fail(`${storeKitConfigPath}: expected exactly three Woof Pro subscriptions`);
}

for (const expected of expectedStoreKitSubscriptions) {
  const subscription = storeKitSubscriptions.find((item) => item.productID === expected.productID);
  if (!subscription) {
    fail(`${storeKitConfigPath}: missing ${expected.productID}`);
    continue;
  }
  if (subscription.displayPrice !== expected.displayPrice) {
    fail(`${storeKitConfigPath}: ${expected.productID} must cost $${expected.displayPrice}`);
  }
  if (subscription.recurringSubscriptionPeriod !== expected.period) {
    fail(`${storeKitConfigPath}: ${expected.productID} must use ${expected.period}`);
  }
  if (
    subscription.introductoryOffer?.paymentMode !== "free"
    || subscription.introductoryOffer?.subscriptionPeriod !== "P3D"
  ) {
    fail(`${storeKitConfigPath}: ${expected.productID} must include the three-day free introductory offer`);
  }
}

requireSnippets(storeKitTestPath, storeKitTest, [
  "import StoreKitTest",
  "testExpireMonthlySubscriptionWhenExplicitlyEnabled",
  'environment["WOOF_STOREKIT_EXPIRE_MONTHLY"] == "1"',
  'SKTestSession(configurationFileNamed: "Woof")',
  'expireSubscription(productIdentifier: "woof_pro_monthly")',
  "testStoreKitProductsMatchRevenueCatCatalog",
  'url(forResource: "Woof", withExtension: "storekit")',
  '"woof_pro_weekly": ("4.99", "P1W")',
  '"woof_pro_monthly": ("7.99", "P1M")',
  '"woof_pro_annual": ("29.99", "P1Y")',
  'XCTAssertEqual(introductoryOffer["subscriptionPeriod"] as? String, "P3D")',
], "native StoreKit catalog test");
requireSnippets(storeKitPluginPath, storeKitPlugin, [
  "withDangerousMod",
  "withXcodeProject",
  "Woof.storekit",
  "WoofConfigurationTests.swift",
  "com.apple.product-type.bundle.unit-test",
  "StoreKitConfigurationFileReference",
  "buildForArchiving = \"NO\"",
  "ensureNormalSchemeTest",
  "withoutStoreKit",
], "Expo StoreKit prebuild plugin");
requireSnippet(
  storeKitPluginPath,
  storeKitPlugin,
  'identifier = "../${name}/Woof.storekit"',
  "StoreKit scheme generator must use the Xcode project-relative configuration path"
);
requireSnippet(
  generatedStoreKitSchemePath,
  generatedStoreKitScheme,
  'identifier = "../woof/Woof.storekit"',
  "generated StoreKit scheme must resolve ios/woof/Woof.storekit"
);
if (!fs.existsSync(generatedStoreKitConfigPath)) {
  fail(`${generatedStoreKitConfigPath}: generated StoreKit configuration is missing`);
}
requireSnippet(
  "app.json",
  JSON.stringify(JSON.parse(readText("app.json"))),
  "./plugins/withWoofStoreKitTesting",
  "Expo config must run the StoreKit testing plugin"
);

requireSnippets("screens/PaywallScreen.js", paywall, [
  "const LOCAL_PAYWALL_VARIANT = \"monthly_default_v1\";",
  "const BLOCKED_REMOTE_COPY_PATTERN",
  "safeRemoteCopy",
  "metadataString",
  "safeMetadataId",
  "woof_paywall_variant",
  "paywall_variant",
  "woof_default_plan",
  "default_plan",
  "results_gate",
  "scan_limit",
  "post_scan_prompt",
  "home_banner",
  "profile",
  "getPaywallVariant(metadata)",
  "getDefaultPlanKey(metadata)",
  "hasPaywallMetadata(metadata)",
  "paywall_metadata_applied",
  "headline_overridden",
  "positioning_overridden",
], "safe Offering Metadata contract");

for (const blockedClaim of [
  "dogfoodadvisor",
  "catfoodadvisor",
  "customer reviews?",
  "review summaries",
  "recall alerts?",
  "recall history",
  "veterinary approved",
  "vet approved",
  "guaranteed safe",
  "medical diagnosis",
]) {
  requireSnippet("screens/PaywallScreen.js", paywall, blockedClaim, `remote metadata must reject unsupported claim class ${blockedClaim}`);
}

requireSnippets("screens/PaywallScreen.js", paywall, [
  "await initializePurchases(user.id)",
  "PAYWALL_PLACEMENT_BY_SOURCE",
  "getPaywallPlacementIdentifier(source)",
  "getOfferingFetchAnalytics",
  "const offeringResult = await getPaywallOffering(requestedPlacementIdentifier)",
  "const o = offeringResult.offering",
  "const metadata = getOfferingMetadata(o)",
  "getPackageAvailabilityAnalytics(o)",
  "paywall_offerings_loaded",
  "success: !!o",
  "offering_identifier",
  "expected_package_count",
  "available_plan_count",
  "missing_plan_count",
  "weekly_package_available",
  "monthly_package_available",
  "annual_package_available",
  "weekly_product_identifier",
  "monthly_product_identifier",
  "annual_product_identifier",
  "placement_identifier",
  "placement_requested",
  "placement_supported",
  "offering_fetch_mode",
  "placement_offering_returned",
  "placement_fallback_used",
  "debugExpanded",
  "getPaywallMetadataDebug",
  "{__DEV__ && (",
  "RevenueCat Debug",
  "[\"Configured\", debugRevenueCatStatus.configured ? \"yes\" : \"no\"]",
], "offering/package readiness telemetry");

requireSnippets("App.js", appSource, [
  "DEV_PAYWALL_PREVIEW_SOURCES",
  "getDevPaywallPreviewSource",
  "if (!__DEV__ || typeof window === \"undefined\") return null;",
  "woof_paywall_preview",
  "devPaywallPreviewSource",
  "skipAutomaticGuestSession={Boolean(devPaywallPreviewSource)}",
  "PaywallScreen",
  "Preview Chicken Kibble",
], "dev-only paywall preview route");

for (const source of ["results_gate", "scan_limit", "post_scan_prompt", "home_banner", "profile"]) {
  requireSnippet("App.js", appSource, `"${source}"`, `dev paywall preview must support ${source}`);
}

requireSnippets("screens/PaywallScreen.js", paywall, [
  "getIntroEligibilityByProductId(productIds)",
  "paywall_trial_eligibility_loaded",
  "annual_trial_configured",
  "annual_trial_can_claim",
  "annual_trial_eligibility_status",
  "annual_trial_label",
  "getPriceComparisons",
  "weeklyMonthlyEquivalent",
  "annualMonthlyEquivalent",
  "annualSavingsPercent",
  "Cancel before the trial ends",
  "[\"Apple Ads attribution\", debugRevenueCatStatus.apple_search_ads_attribution_status || \"unknown\"]",
], "store price and trial truthfulness");

requireSnippetBefore(
  "screens/PaywallScreen.js",
  paywall,
  "const selectedPrice = prices[selectedIndex];",
  "const planDisclosure = requiresDevelopmentBuild",
  "selected price must be initialized before the plan disclosure is calculated"
);
requireSnippetBefore(
  "screens/PaywallScreen.js",
  paywall,
  "const selectedPeriod = periods[selectedIndex];",
  "const planDisclosure = requiresDevelopmentBuild",
  "selected billing period must be initialized before the plan disclosure is calculated"
);

requireSnippets("screens/PaywallScreen.js", paywall, [
  "purchase_unavailable",
  "purchase_started",
  "purchase_completed",
  "purchase_entitlement_refreshed",
  "purchase_pending",
  "purchase_no_entitlement",
  "restore_started",
  "restore_completed",
  "restore_entitlement_refreshed",
  "restore_no_entitlement",
  "refreshProStatus({ source: \"purchase_success\" })",
  "refreshProStatus({ source: \"restore_success\" })",
  "getRevenueCatResultAnalytics(result)",
], "purchase/restore entitlement refresh telemetry");

requireSnippets("services/purchases.js", purchases, [
  "Purchases.configure",
  "Purchases.isConfigured()",
  "Purchases.getAppUserID()",
  "initialize_purchases_native_reuse",
  "Purchases.logIn(userId)",
  "Purchases.logOut()",
  "safePlacementIdentifier",
  "export async function getPaywallOffering",
  "Purchases.getCurrentOfferingForPlacement(normalizedPlacement)",
  "placement_fallback_current",
  "placementOfferingReturned",
  "placementFallbackUsed",
  "Purchases.getOfferings()",
  "return offerings.current",
  "export function getOfferingMetadata",
  "metadata || typeof metadata !== \"object\" || Array.isArray(metadata)",
  "p.packageType === \"WEEKLY\" || p.identifier === \"$rc_weekly\"",
  "p.packageType === \"MONTHLY\" || p.identifier === \"$rc_monthly\"",
  "p.packageType === \"ANNUAL\" || p.identifier === \"$rc_annual\"",
  "Purchases.checkTrialOrIntroductoryPriceEligibility",
  "Purchases.purchasePackage(pkg)",
  "Purchases.restorePurchases()",
  "if (!sdkConfigured)",
  "RevenueCatNotConfiguredError",
  "function customerInfoSummary",
  "export function getRevenueCatResultAnalytics",
  "has_pro_entitlement",
  "active_subscription_count",
  "let appleSearchAdsAttributionStatus",
  "requestAppleSearchAdsAttributionCollection",
  "Purchases.enableAdServicesAttributionTokenCollection",
  "apple_search_ads_attribution_status",
  "apple_search_ads_attribution_collection_requested",
  "apple_search_ads_attribution_collection_failed",
  "revenuecat_adservices",
  "reidentified",
], "RevenueCat SDK integration");

requireSnippets("services/revenuecatSync.js", revenuecatSync, [
  "const SYNC_FUNCTION_NAME = \"revenuecat-sync\"",
  "REVENUECAT_SYNC",
  "syncRevenueCatProfile",
  "reconcileRevenueCatProfile",
  "RECONCILE_DELAYS_MS",
  "revenuecat_profile_reconcile_started",
  "revenuecat_profile_reconcile_completed",
  "revenuecat_profile_reconcile_exhausted",
  "supabase.functions.invoke",
  "revenuecat_profile_sync_completed",
  "revenuecat_profile_sync_failed",
  "http_status",
  "sync_status",
  "function_error",
], "immediate server entitlement sync diagnostics");

requireSnippets("services/auth.js", auth, [
  "syncRevenueCatProfile({ source: sourceKey })",
  "reconcileRevenueCatProfile({ source: sourceKey })",
  "`${sourceKey}_sdk_inactive`",
  "profile_is_pro: true",
  "revenuecat_status_mismatch",
  "revenuecat_status_fallback_used",
  "account_link_revenuecat_reidentified",
  "initializePurchases(updatedUser.id)",
], "auth/account-link RevenueCat identity and fallback handling");

requireSnippets("REVENUECAT_EXPERIMENT_PLAN.md", experimentPlan, [
  "App paywall variant in the worktree: `monthly_default_v1`.",
  "Supported safe Offering Metadata keys in the app:",
  "`paywall_variant` or `woof_paywall_variant`",
  "`default_plan` or `woof_default_plan`",
  "Supported sources: `default`, `results_gate`, `scan_limit`, `post_scan_prompt`, `home_banner`, and `profile`.",
  "requests source-specific placements through `getCurrentOfferingForPlacement`",
  "`placement_identifier`, `placement_requested`, `placement_supported`, `offering_fetch_mode`, `placement_offering_returned`, and `placement_fallback_used`",
  "`placement_offering_return_rate`",
  "Development builds include an expandable RevenueCat Debug panel",
  "Keep this panel behind the direct `__DEV__` render guard.",
  "`?woof_paywall_preview=<source>`",
  "guarded by `__DEV__`",
  "RevenueCat `default` offering returns all three packages in TestFlight.",
  "RevenueCat Apple Ads Services integration is connected",
  "`apple_search_ads_attribution_collection_requested` appears on iOS TestFlight after RevenueCat initializes",
  "`public.kpi_apple_search_ads_attribution_daily.collection_failures=0`",
  "265_apple_search_ads_attribution_reporting.sql",
  "`paywall_offerings_loaded.success = true`",
  "`paywall_offerings_loaded` shows `missing_plan_count=0`",
  "`placement_offering_errors=0`",
  "`paywall_trial_eligibility_loaded`",
  "Sandbox purchase, restore, cancel, and expiration paths update RevenueCat, `profiles.is_pro`, immediate profile-sync analytics, entitlement-refresh analytics, and `revenuecat_events.subscriber_sync_status`.",
  "`purchase_unavailable` rises materially.",
  "`paywall_expected_package_load_failures`",
  "`placement_current_fallback_rate` stays high",
  "`revenuecat_profile_sync_failed` repeats",
  "`apple_search_ads_attribution_collection_failed` appears",
], "experiment evidence and stop conditions");

requireSnippets("REVENUECAT_TESTFLIGHT_RUNBOOK.md", testflightRunbook, [
  "Supabase migrations `058`-`070` are applied.",
  "`revenuecat-webhook` and `revenuecat-sync`",
  "`REVENUECAT_WEBHOOK_AUTH`",
  "`REVENUECAT_REST_API_KEY`",
  "`npm run edge:verify-live`",
  "`$rc_weekly`, `$rc_monthly`, and `$rc_annual`",
  "Fresh iOS sandbox account eligible for introductory offers.",
  "Anonymous guest user that later saves with Apple or Google.",
  "`revenuecat_offering_packages`",
  "`revenuecat_webhook_sync`",
  "`revenuecat_purchase_restore`",
  "`paywall_offerings_loaded`",
  "`apple_search_ads_attribution_collection_requested`",
  "public.kpi_apple_search_ads_attribution_daily",
  "public.kpi_paid_acquisition_readiness_daily",
  "`expected_package_count=3`",
  "`missing_plan_count=0`",
  "`placement_identifier=scan_limit`",
  "`paywall_trial_eligibility_loaded`",
  "`purchase_entitlement_refreshed`",
  "`is_pro=true`",
  "`purchase_no_entitlement`",
  "`revenuecat_profile_sync_completed`",
  "`restore_entitlement_refreshed`",
  "`restore_no_entitlement`",
  "`subscriber_sync_status = 'synced'`",
  "`account_link_revenuecat_reidentified`",
  "`apple_search_ads_attribution`",
  "public.kpi_paywall_source_daily",
  "public.kpi_revenuecat_daily",
  "public.revenuecat_events",
  "`npm run check:evidence -- --strict`",
  "Do not start RevenueCat experiments",
], "RevenueCat TestFlight runbook");

requireSnippets("DEPLOYMENT_CHECKLIST.md", checklist, [
  "Use `REVENUECAT_EXPERIMENT_PLAN.md`",
  "Use `REVENUECAT_TESTFLIGHT_RUNBOOK.md`",
  "Complete `REVENUECAT_TESTFLIGHT_RUNBOOK.md`",
  "Paywall loads the RevenueCat offering and packages.",
  "request the expected placement identifier",
  "expand the paywall RevenueCat Debug panel",
  "`?woof_paywall_preview=<source>`",
  "guarded behind `__DEV__`",
  "only safe `paywall_variant`, `default_plan`, headline, and positioning hints apply",
  "Purchase and restore call `revenuecat-sync`",
  "RevenueCat Apple Ads AdServices token collection",
  "`paywall_offerings_loaded` includes `purchases_initialized`, `revenuecat_configured`, package count, expected package count, missing plan count, weekly/monthly/annual availability, success state, offering identifier, placement identifier",
  "`paywall_trial_eligibility_loaded` with configured, eligibility status, trial label, and claim state",
  "`paywall_metadata_applied` after a controlled RevenueCat Offering Metadata test",
  "`purchase_no_entitlement` should be absent",
  "`revenuecat_status_mismatch` should be absent",
  "`purchase_entitlement_refreshed` and `restore_entitlement_refreshed` with `is_pro=true`",
], "release checklist RevenueCat evidence");

requireSnippets("KPI_FRAMEWORK.md", kpiFramework, [
  "Paywall package-load rate",
  "Placement offering return rate",
  "paywall_request_to_expected_package_load_rate",
  "placement_current_fallback_rate",
  "paywall_weekly_package_missing",
  "Subscription sync quality",
  "purchase_no_entitlement",
  "restore_no_entitlement",
  "revenuecat_status_mismatch",
  "Apple Search Ads attribution readiness",
  "public.kpi_apple_search_ads_attribution_daily",
  "public.kpi_paid_acquisition_readiness_daily",
], "RevenueCat KPI definitions");

requireSnippets("WEEKLY_REVIEW_RUNBOOK.md", runbook, [
  "paywall_expected_package_loads",
  "paywall_expected_package_load_failures",
  "paywall_request_to_expected_package_load_rate",
  "placement_offering_return_rate",
  "restore_entitlement_refresh_pro_rate",
  "Fix entitlement sync before experiments",
  "Fix RevenueCat/package loading first",
  "Fix RevenueCat placement setup first",
  "Fix Apple Search Ads attribution before spend",
  "kpi_apple_search_ads_attribution_daily",
  "kpi_paid_acquisition_readiness_daily",
], "weekly RevenueCat review rules");

requireSnippets("supabase/migrations/065_kpi_reporting_views.sql", kpiSql, [
  "paywall_offerings_loaded",
  "paywall_expected_package_loads",
  "paywall_expected_package_load_failures",
  "paywall_weekly_package_missing",
  "paywall_monthly_package_missing",
  "paywall_annual_package_missing",
  "placement_offering_requests",
  "placement_offering_returns",
  "placement_current_fallbacks",
  "placement_offering_errors",
  "placement_offering_return_rate",
  "placement_current_fallback_rate",
  "purchase_no_entitlement",
  "purchase_unavailable",
  "restore_entitlement_refreshed",
  "revenuecat_status_mismatch",
  "kpi_paywall_source_daily",
], "RevenueCat reporting view coverage");

requireRegex(
  "screens/PaywallScreen.js",
  paywall,
  /function getPackageAvailabilityAnalytics\(offering\)[\s\S]+expected_package_count[\s\S]+missing_plan_count[\s\S]+weekly_package_available[\s\S]+monthly_package_available[\s\S]+annual_package_available/,
  "getPackageAvailabilityAnalytics must emit expected package coverage for all sellable plans"
);

requireRegex(
  "services/purchases.js",
  purchases,
  /export async function getOfferings\(\)[\s\S]+Purchases\.getOfferings\(\)[\s\S]+return offerings\.current/,
  "getOfferings must use the current RevenueCat offering fallback"
);

requireRegex(
  "services/purchases.js",
  purchases,
  /export async function getPaywallOffering\(placementIdentifier = null\)[\s\S]+Purchases\.getCurrentOfferingForPlacement\(normalizedPlacement\)[\s\S]+const currentOffering = await getOfferings\(\)[\s\S]+placement_fallback_current/,
  "getPaywallOffering must request placement offerings and fall back to current offering"
);

requireRegex(
  "services/auth.js",
  auth,
  /if \(status\.isPro\)[\s\S]+syncRevenueCatProfile\(\{ source: sourceKey \}\)[\s\S]+revenuecat_status_mismatch[\s\S]+reconcileRevenueCatProfile\(\{ source: sourceKey \}\)[\s\S]+return true/,
  "SDK-active Pro entitlement must take precedence while scheduling bounded server reconciliation"
);

requireRegex(
  "services/auth.js",
  auth,
  /if \(status\.checked\)[\s\S]+isActiveProfilePro\(fallbackProfile\)[\s\S]+profile_is_pro: true[\s\S]+syncRevenueCatProfile\([\s\S]+sdk_inactive[\s\S]+return syncState\.is_pro/,
  "SDK-inactive status must reconcile a stale Pro profile through the authenticated server"
);

if (failures.length > 0) {
  console.error("RevenueCat readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("RevenueCat readiness check passed: paywall metadata, package telemetry, entitlement sync, KPI/runbook, and release docs are aligned.");
