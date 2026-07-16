import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const JS_EXTENSIONS = new Set([".js", ".mjs"]);
const IGNORED_PATH_PARTS = new Set([
  ".git",
  "node_modules",
  ".expo",
  "dist",
  "web-build",
  "ios",
  "android",
]);

function gitFiles(args) {
  const output = execFileSync("git", args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function isIgnoredPath(filePath) {
  return filePath
    .split(path.sep)
    .some((part) => IGNORED_PATH_PARTS.has(part));
}

function isJavaScriptFile(filePath) {
  return JS_EXTENSIONS.has(path.extname(filePath));
}

const trackedFiles = gitFiles(["ls-files", "-z"]);
const untrackedFiles = gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]);
const filesToCheck = [...new Set([...trackedFiles, ...untrackedFiles])]
  .filter((file) => isJavaScriptFile(file) && !isIgnoredPath(file))
  .sort();

const failures = [];

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function checkHookDependencySelfReferences(file, source) {
  const hookRegex = /const\s+([A-Za-z_$][\w$]*)\s*=\s*use(?:Callback|Memo)\s*\([\s\S]*?,\s*\[([^\]]*)\]\s*\)/g;
  let match;

  while ((match = hookRegex.exec(source)) !== null) {
    const [, variableName, dependencies] = match;
    const dependencyNames = dependencies
      .split(",")
      .map((dependency) => dependency.trim().replace(/\?.*$/, ""))
      .filter(Boolean);

    if (dependencyNames.includes(variableName)) {
      failures.push({
        file,
        output: `Self-referential hook dependency '${variableName}' at line ${lineNumberForIndex(source, match.index)}`,
      });
    }
  }
}

function checkAppPriceTruth(file, source) {
  const isAppSurface = file.startsWith("screens/") || file === "legal.js";
  if (!isAppSurface) return;

  const hardCodedDollarMatch = source.match(/["'`]\$[0-9]/);
  if (hardCodedDollarMatch) {
    failures.push({
      file,
      output: `Hard-coded app price at line ${lineNumberForIndex(source, hardCodedDollarMatch.index)}. Render RevenueCat package prices, loading/unavailable states, or price-neutral upgrade copy instead.`,
    });
  }
}

function checkLetterSpacingValues(file, source) {
  if (file !== "theme.js" && !file.startsWith("screens/")) return;

  const letterSpacingRegex = /letterSpacing:\s*(-?[0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = letterSpacingRegex.exec(source)) !== null) {
    const numericValue = Number(match[1]);
    if (numericValue !== 0) {
      failures.push({
        file,
        output: `Non-zero letterSpacing '${match[1]}' at line ${lineNumberForIndex(source, match.index)}. Use 0 for app UI text.`,
      });
    }
  }
}

function checkDynamicTypeLayoutGuard() {
  const componentSource = readFileSync("components/AppText.js", "utf8");

  for (const needle of [
    "MAX_FONT_SIZE_MULTIPLIER = 1.4",
    "export const AppText",
    "export const AppTextInput",
    "maxFontSizeMultiplier={maxFontSizeMultiplier}",
  ]) {
    if (!componentSource.includes(needle)) {
      failures.push({
        file: "components/AppText.js",
        output: `Missing Dynamic Type layout guard: ${needle}`,
      });
    }
  }

  for (const file of [
    "App.js",
    "screens/AuthScreen.js",
    "screens/HomeScreen.js",
    "screens/OnboardingScreen.js",
    "screens/PaywallScreen.js",
    "screens/ProductSearchScreen.js",
    "screens/ProfileScreen.js",
    "screens/ResultsScreen/components.js",
    "screens/ResultsScreen/index.js",
    "screens/ScannerScreen.js",
    "screens/WebViewScreen.js",
  ]) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("AppText as Text")) {
      failures.push({ file, output: "App UI text must use the bounded Dynamic Type component." });
    }
    if (source.includes("allowFontScaling={false}") || source.includes("allowFontScaling: false")) {
      failures.push({
        file,
        output: "Dynamic Type must remain enabled; use a bounded multiplier for dense layouts.",
      });
    }
  }
}

function numericConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`));
  return match ? Number(match[1].replace(/_/g, "")) : null;
}

function checkScanTimeoutOrdering() {
  const edgeSource = readFileSync("supabase/functions/analyze/index.ts", "utf8");
  const analysisServiceSource = readFileSync("services/analysisService.js", "utf8");
  const claudeSource = readFileSync("services/claude.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");

  const edgeTimeout = numericConstant(edgeSource, "CLAUDE_TIMEOUT_MS");
  const serviceTimeout = numericConstant(analysisServiceSource, "ANALYSIS_TIMEOUT_MS");
  const clientTimeout = numericConstant(claudeSource, "CLIENT_ANALYSIS_TIMEOUT_MS");
  const resultTimeout = numericConstant(resultsSource, "RESULT_ANALYSIS_TIMEOUT_MS");

  for (const [file, name, value] of [
    ["supabase/functions/analyze/index.ts", "CLAUDE_TIMEOUT_MS", edgeTimeout],
    ["services/analysisService.js", "ANALYSIS_TIMEOUT_MS", serviceTimeout],
    ["services/claude.js", "CLIENT_ANALYSIS_TIMEOUT_MS", clientTimeout],
    ["screens/ResultsScreen/index.js", "RESULT_ANALYSIS_TIMEOUT_MS", resultTimeout],
  ]) {
    if (!Number.isFinite(value)) {
      failures.push({
        file,
        output: `Missing numeric ${name} constant for scan timeout ordering check.`,
      });
    }
  }

  if (![edgeTimeout, serviceTimeout, clientTimeout, resultTimeout].every(Number.isFinite)) {
    return;
  }

  for (const [file, name, value] of [
    ["services/analysisService.js", "ANALYSIS_TIMEOUT_MS", serviceTimeout],
    ["services/claude.js", "CLIENT_ANALYSIS_TIMEOUT_MS", clientTimeout],
    ["screens/ResultsScreen/index.js", "RESULT_ANALYSIS_TIMEOUT_MS", resultTimeout],
  ]) {
    if (value <= edgeTimeout) {
      failures.push({
        file,
        output: `${name} (${value}ms) must be greater than Edge CLAUDE_TIMEOUT_MS (${edgeTimeout}ms) so scan reversal can sync before client timeout.`,
      });
    }
  }
}

function checkClientCancellationReversalPath() {
  const analysisServiceSource = readFileSync("services/analysisService.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const scannerSource = readFileSync("screens/ScannerScreen.js", "utf8");

  for (const [file, source, required] of [
    [
      "services/analysisService.js",
      analysisServiceSource,
      [
        "export function cancelAnalysis",
        "entry.controller?.abort()",
        "_scheduleCleanup(resolvedKey)",
      ],
    ],
    [
      "screens/ResultsScreen/index.js",
      resultsSource,
      [
        "analysisService.cancelAnalysis",
        'navigation.addListener("beforeRemove"',
        '"scan_analysis_cancelled"',
      ],
    ],
  ]) {
    for (const needle of required) {
      if (!source.includes(needle)) {
        failures.push({
          file,
          output: `Missing cancellation reversal path marker: ${needle}`,
        });
      }
    }
  }

  for (const needle of [
    "const captureRunIdRef = useRef(0)",
    "const isCurrentCapture = () => captureRunIdRef.current === captureRunId",
    "captureRunIdRef.current += 1",
    "photo_capture_cancelled",
    "capture_stage",
    "missing_photo_uri",
    "optimization_missing_base64",
    "client_size_gate",
  ]) {
    if (!scannerSource.includes(needle)) {
      failures.push({
        file: "screens/ScannerScreen.js",
        output: `Missing photo capture cancellation marker: ${needle}`,
      });
    }
  }
}

function checkScannerPermissionFlow() {
  const scannerSource = readFileSync("screens/ScannerScreen.js", "utf8");

  for (const needle of [
    "const handleCameraPermissionPress = async () =>",
    "camera_permission_result",
    "camera_permission_settings_opened",
    "camera_permission_request_failed",
    "permission?.canAskAgain === false",
    "Woof needs camera access to check food items for your pet.",
    "Woof needs camera access to scan pet food labels and packaging.",
    "scannerInstructionText",
    "scannerTipText",
    "scanner_help_opened",
    "capture_tip",
    "Good light • label readable • hold steady",
    "Good light • fill the frame • hold steady",
    "instructionTipLight",
  ]) {
    if (!scannerSource.includes(needle)) {
      failures.push({
        file: "screens/ScannerScreen.js",
        output: `Missing scanner permission flow marker: ${needle}`,
      });
    }
  }
}

function checkScanFailureTelemetry() {
  const analysisServiceSource = readFileSync("services/analysisService.js", "utf8");
  const claudeSource = readFileSync("services/claude.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");

  for (const needle of [
    "errorStatus",
    "_errorStatus(err)",
    "ANALYSIS_TIMEOUT",
  ]) {
    if (!analysisServiceSource.includes(needle)) {
      failures.push({
        file: "services/analysisService.js",
        output: `Missing structured scan failure marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "buildStreamIncompleteError",
    "ANALYSIS_STREAM_INCOMPLETE",
    "scanUsageConfirmed",
    "!streamState.scanUsageConfirmed || !streamState.scanUsage",
    "woof_scan_usage",
  ]) {
    if (!claudeSource.includes(needle)) {
      failures.push({
        file: "services/claude.js",
        output: `Missing stream completion confirmation marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "function scanFailureCategory",
    "function scanFailureProperties",
    "failure_category",
    "error_code",
    "http_status",
    "scan_usage_reversed",
    "product_not_found",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Missing structured scan failure telemetry marker: ${needle}`,
      });
    }
  }
}

function checkScanCostAttributionTelemetry() {
  const analysisServiceSource = readFileSync("services/analysisService.js", "utf8");
  const claudeSource = readFileSync("services/claude.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");

  for (const [file, source, required] of [
    [
      "services/claude.js",
      claudeSource,
      [
        '"analysis_upload_started"',
        '"analysis_image_retry_suppressed"',
        "scan_id: payload?.scanId || null",
        "estimated_image_decoded_bytes",
        "estimated_request_bytes",
        "ANALYSIS_IMAGE_RETRY_SUPPRESSED",
        "Image payload already uploaded; skipping non-streaming fallback",
      ],
    ],
    [
      "services/analysisService.js",
      analysisServiceSource,
      [
        "scanId: state.scanId",
        "scanId: entry.scanId",
      ],
    ],
    [
      "screens/ResultsScreen/index.js",
      resultsSource,
      [
        "function scanIdFromAnalysis",
        "scan_id: scanId",
        "scan_id: event.scanId || event.scanUsage?.scan_id || null",
        "recovery_retry: true",
        "upload_retry_suppressed",
      ],
    ],
  ]) {
    for (const needle of required) {
      if (!source.includes(needle)) {
        failures.push({
          file,
          output: `Missing scan-cost attribution telemetry marker: ${needle}`,
        });
      }
    }
  }

  if (claudeSource.includes("attempt(s), falling back to non-streaming:")) {
    failures.push({
      file: "services/claude.js",
      output: "Image scan egress guard: do not reintroduce automatic non-streaming fallback after a failed image streaming upload.",
    });
  }
}

function checkCachedScanAccounting() {
  const analysisServiceSource = readFileSync("services/analysisService.js", "utf8");

  for (const needle of [
    "Photo cache hits wait for Edge scan usage before completing",
    "Completed entries are not reused for new scan attempts because that would bypass scan accounting",
    'if (entry && entry.status === "running")',
  ]) {
    if (!analysisServiceSource.includes(needle)) {
      failures.push({
        file: "services/analysisService.js",
        output: `Missing cached scan-accounting marker: ${needle}`,
      });
    }
  }

  for (const [needle, reason] of [
    [
      "cacheShortCircuited",
      "Photo cache hits must not abort the Edge stream before woof_scan_usage confirms scan accounting.",
    ],
    [
      "Cache hit early",
      "Photo cache hits must wait for Edge-returned scan usage before completion.",
    ],
    [
      'entry.status === "running" || entry.status === "complete"',
      "New barcode scan attempts must not reuse completed entries without consuming a scan.",
    ],
    [
      "Reusing completed analysis for:",
      "Completed in-memory photo results must not complete a new scan before Edge scan usage is confirmed.",
    ],
  ]) {
    if (analysisServiceSource.includes(needle)) {
      failures.push({
        file: "services/analysisService.js",
        output: `${reason} Forbidden marker found: ${needle}`,
      });
    }
  }
}

function checkPaywallPurchaseInitialization() {
  const paywallSource = readFileSync("screens/PaywallScreen.js", "utf8");
  const purchasesSource = readFileSync("services/purchases.js", "utf8");

  for (const [file, source, required] of [
    [
      "screens/PaywallScreen.js",
      paywallSource,
      [
        "initializePurchases",
        "await initializePurchases(user.id)",
        "purchases_initialized",
        "paywall_offerings_loaded",
        "package_count",
        "expected_package_count",
        "missing_plan_count",
        "weekly_package_available",
        "monthly_package_available",
        "annual_package_available",
        "success: !!o",
        "purchase_entitlement_refreshed",
        "restore_entitlement_refreshed",
        "purchase_no_entitlement",
        "purchase_pending",
        "restore_no_entitlement",
        "getRevenueCatResultAnalytics",
        "active_entitlement_count",
      ],
    ],
    [
      "services/purchases.js",
      purchasesSource,
      [
        "let resetPromise = null",
        "await resetPromise.catch",
        "return resetPromise",
        "function customerInfoSummary",
        "export function getRevenueCatResultAnalytics",
        "active_subscription_count",
        "has_pro_entitlement",
        "function isPaymentPendingError",
        "error_code",
      ],
    ],
  ]) {
    for (const needle of required) {
      if (!source.includes(needle)) {
        failures.push({
          file,
          output: `Missing RevenueCat initialization marker: ${needle}`,
        });
      }
    }
  }
}

function checkProfileRestorePurchases() {
  const profileSource = readFileSync("screens/ProfileScreen.js", "utf8");
  const paywallSource = readFileSync("screens/PaywallScreen.js", "utf8");
  const purchasesSource = readFileSync("services/purchases.js", "utf8");

  for (const needle of [
    "const handleRestorePurchases = async () =>",
    "restorePurchases",
    "getRevenueCatResultAnalytics",
    "await initializePurchases(user.id)",
    "refreshProStatus({",
    "source: \"profile_restore\"",
    "restore_entitlement_refreshed",
    "restore_no_entitlement",
    "Restore Purchases",
  ]) {
    if (!profileSource.includes(needle)) {
      failures.push({
        file: "screens/ProfileScreen.js",
        output: `Missing Profile restore purchase marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "const handleSubscriptionPress = async () =>",
    "await Linking.openURL(url)",
    "subscription_manage_opened",
    "subscription_manage_failed",
    "Could Not Open Subscriptions",
  ]) {
    if (!profileSource.includes(needle)) {
      failures.push({
        file: "screens/ProfileScreen.js",
        output: `Missing Profile subscription management marker: ${needle}`,
      });
    }
  }

  for (const [file, source, needle] of [
    [
      "screens/PaywallScreen.js",
      paywallSource,
      "Checks App Store or Google Play purchases for an active Woof Pro subscription",
    ],
    [
      "screens/PaywallScreen.js",
      paywallSource,
      "App Store Connect or Google Play Console subscription setup",
    ],
    [
      "services/purchases.js",
      purchasesSource,
      "signed in to the App Store or Google Play",
    ],
  ]) {
    if (!source.includes(needle)) {
      failures.push({
        file,
        output: `Missing cross-platform subscription copy marker: ${needle}`,
      });
    }
  }
}

function checkPaywallRequestInstrumentation() {
  const homeSource = readFileSync("screens/HomeScreen.js", "utf8");
  const profileSource = readFileSync("screens/ProfileScreen.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");

  for (const [file, source, required] of [
    [
      "screens/HomeScreen.js",
      homeSource,
      [
        "const navigatePaywall = (source, properties = {}) =>",
        "paywall_requested",
        'source_surface: "home_scan_cta"',
        'source_surface: "home_human_food_cta"',
        'source_surface: "home_banner"',
        "FreeScanStatus",
        "free_scan_status_tapped",
        'const HOME_FREE_SCAN_STATUS_SOURCE_SURFACE = "home_free_scan_status"',
        "source_surface: HOME_FREE_SCAN_STATUS_SOURCE_SURFACE",
        "remaining_scans",
      ],
    ],
    [
      "screens/ProfileScreen.js",
      profileSource,
      [
        "paywall_requested",
        'source: "profile"',
        'source_surface: "profile_subscription_row"',
      ],
    ],
    [
      "screens/ResultsScreen/index.js",
      resultsSource,
      [
        "const navigatePaywall = (source) =>",
        "paywall_requested",
        "score: result?.overallScore ?? null",
      ],
    ],
  ]) {
    for (const needle of required) {
      if (!source.includes(needle)) {
        failures.push({
          file,
          output: `Missing paywall request instrumentation marker: ${needle}`,
        });
      }
    }
  }
}

function checkPaywallDismissalInstrumentation() {
  const paywallSource = readFileSync("screens/PaywallScreen.js", "utf8");

  for (const needle of [
    "paywallOpenedAtRef",
    "paywallExitTrackedRef",
    "paywallCloseReasonRef",
    "paywallCloseOutcomeRef",
    "getPaywallExitAnalytics",
    "trackPaywallExit",
    "paywall_closed",
    "paywall_dismissed",
    "duration_ms",
    "exit_reason",
    "close_outcome",
    "navigation.addListener(\"beforeRemove\"",
  ]) {
    if (!paywallSource.includes(needle)) {
      failures.push({
        file: "screens/PaywallScreen.js",
        output: `Missing paywall dismissal instrumentation marker: ${needle}`,
      });
    }
  }
}

function checkPaywallSourceIntentInstrumentation() {
  const paywallSource = readFileSync("screens/PaywallScreen.js", "utf8");

  for (const needle of [
    "PAYWALL_CONTEXT_BY_SOURCE",
    "getPaywallContext",
    "sourceContextStrip",
    "sourceContextLabel",
    "sourceContextDetail",
    "source_intent",
    "source_context_label",
    "result_details",
    "scan_continuity",
    "shopping_confidence",
    "For this scan",
    "Free scan limit",
    "Account upgrade",
  ]) {
    if (!paywallSource.includes(needle)) {
      failures.push({
        file: "screens/PaywallScreen.js",
        output: `Missing paywall source-intent marker: ${needle}`,
      });
    }
  }
}

function checkUserScopedScanCountStorage() {
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "const SCAN_COUNT_KEY_PREFIX",
    "function scanCountStorageKey",
    "persistScanCount(userId",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing user-scoped scan-count storage marker: ${needle}`,
      });
    }
  }

  if (/AsyncStorage\.getItem\(\s*LEGACY_SCAN_COUNT_KEY/.test(authSource)) {
    failures.push({
      file: "services/auth.js",
      output: "Do not load the legacy global scan count before a user is known; server profile scan count is authoritative.",
    });
  }
}

function checkRevenueCatSyncDiagnostics() {
  const syncSource = readFileSync("services/revenuecatSync.js", "utf8");

  for (const needle of [
    "extractFunctionErrorDetails",
    "response.clone().json()",
    "http_status",
    "function_error",
    "sync_status",
  ]) {
    if (!syncSource.includes(needle)) {
      failures.push({
        file: "services/revenuecatSync.js",
        output: `Missing RevenueCat sync diagnostic marker: ${needle}`,
      });
    }
  }
}

function checkAccountLinkRevenueCatReidentify() {
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "account_link_revenuecat_reidentified",
    "await initializePurchases(updatedUser.id)",
    "purchases_initialized",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing account-link RevenueCat re-identification marker: ${needle}`,
      });
    }
  }

  if (!/refreshProStatus\s*=\s*useCallback\s*\(\s*async\s*\(\s*\{\s*source\s*=\s*"manual_refresh"\s*,\s*userId\s*=\s*user\?\.id\s*\}/s.test(authSource)) {
    failures.push({
      file: "services/auth.js",
      output: "refreshProStatus must accept an explicit userId for just-completed auth transitions.",
    });
  }

  if (!/await\s+refreshProStatus\s*\(\s*\{\s*source:\s*`account_link_\$\{provider\}`\s*,\s*userId:\s*updatedUser\.id\s*\}\s*\)/s.test(authSource)) {
    failures.push({
      file: "services/auth.js",
      output: "Account-link Pro refresh must use updatedUser.id instead of the stale user closure.",
    });
  }

  if (!/await\s+refreshProStatus\s*\(\s*\{\s*source:\s*"sign_in_google"\s*,\s*userId:\s*updatedUser\.id\s*\}\s*\)/s.test(authSource)) {
    failures.push({
      file: "services/auth.js",
      output: "Google sign-in Pro refresh must use updatedUser.id instead of the stale user closure.",
    });
  }
}

function checkRevenueCatSdkActivePrecedence() {
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "revenuecat_status_mismatch",
    "sdk_is_pro: true",
    "server_sync_is_pro: false",
    "sync_status: syncState.status",
    "reconcileRevenueCatProfile({ source: sourceKey })",
    "profile_is_pro: true",
    "`${sourceKey}_sdk_inactive`",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing RevenueCat SDK-active precedence marker: ${needle}`,
      });
    }
  }
}

function checkGuestAuthEntry() {
  const authScreenSource = readFileSync("screens/AuthScreen.js", "utf8");
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "auth_viewed",
    "guest_option_available",
    "Continue as Guest",
    "Guest mode temporarily unavailable",
    'accessibilityRole="alert"',
    "providerErrorCopy",
    "Apple Sign-In Unavailable",
    "guest_continue_started",
    "guest_continue_completed",
    "guest_continue_failed",
    "startAnonymousSession({ automatic: false })",
    "Guest Mode Unavailable",
  ]) {
    if (!authScreenSource.includes(needle)) {
      failures.push({
        file: "screens/AuthScreen.js",
        output: `Missing manual guest auth marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "startAnonymousSession({ automatic: true })",
    "anonymous_sign_in_started",
    "anonymous_signed_in",
    "anonymous_sign_in_failed",
    "source: automatic ? \"automatic_start\" : \"manual_continue\"",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing automatic/manual anonymous auth marker: ${needle}`,
      });
    }
  }
}

function checkOAuthCallbackSessionExchange() {
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "const code = queryParams.get(\"code\") || hashParams.get(\"code\")",
    "supabase.auth.exchangeCodeForSession(code)",
    "hashParams.get(\"access_token\") || queryParams.get(\"access_token\")",
    "hashParams.get(\"refresh_token\") || queryParams.get(\"refresh_token\")",
    "supabase.auth.setSession",
    "Authentication callback did not include a session.",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing OAuth callback session exchange marker: ${needle}`,
      });
    }
  }
}

function checkShareAcquisitionLoop() {
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const componentsSource = readFileSync("screens/ResultsScreen/components.js", "utf8");
  const envSource = readFileSync("config/env.js", "utf8");
  const appConfigSource = readFileSync("app.config.js", "utf8");

  for (const needle of [
    "WOOF_SHARE_URL",
    "share_url_attached",
    "share_url_host",
    "Scan your pet food with Woof:",
    "shareUrlDisplay(WOOF_SHARE_URL)",
    "function shareWasDismissed",
    "share_dismissed",
    "share_action",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Missing share acquisition marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "shareUrl",
    "Get Woof:",
    "shareLinkText",
  ]) {
    if (!componentsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/components.js",
        output: `Missing share card acquisition marker: ${needle}`,
      });
    }
  }

  for (const [file, source] of [
    ["config/env.js", envSource],
    ["app.config.js", appConfigSource],
  ]) {
    if (!source.includes("WOOF_SHARE_URL") || !source.includes("https://apps.apple.com/app/id6760733899")) {
      failures.push({
        file,
        output: "Share acquisition URL must be configured with the live App Store URL fallback.",
      });
    }
  }
}

function checkAppReviewLoop() {
  const reviewSource = readFileSync("services/reviewPrompt.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const componentsSource = readFileSync("screens/ResultsScreen/components.js", "utf8");
  const profileSource = readFileSync("screens/ProfileScreen.js", "utf8");

  for (const needle of [
    "APP_STORE_REVIEW_URL",
    "itms-apps://itunes.apple.com/app/viewContentsUserReviews/id6760733899?action=write-review",
    "https://apps.apple.com/app/apple-store/id6760733899?action=write-review",
    "primary: __DEV__ ? APP_STORE_WEB_URL : APP_STORE_REVIEW_URL",
    "fallback: __DEV__ ? null : APP_STORE_WEB_URL",
    "PLAY_STORE_REVIEW_URL",
    "MIN_GOOD_SCORE",
    "PROMPT_COOLDOWN_MS",
    'reason: "development_build"',
    'error_name: "development_build"',
    "function reviewStorageKey",
    "function reviewStorageKeys",
    "review_state_scoped",
    "clearReviewPromptStorage",
    "app_review_prompt_viewed",
    "app_review_requested",
    "app_review_opened",
    "app_review_open_failed",
  ]) {
    if (!reviewSource.includes(needle)) {
      failures.push({
        file: "services/reviewPrompt.js",
        output: `Missing app review loop marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "maybeShowReviewPrompt(reviewContext())",
    "userId: user?.id || null",
    "showPostScanPrompt",
    "showFirstScanToast",
    "ReviewPrompt",
    "openStoreReview(reviewContext())",
    "Could Not Open App Store",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Missing result review prompt marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "ReviewPrompt",
    "Rate Woof",
    "Help more pet parents find Woof",
  ]) {
    if (!componentsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/components.js",
        output: `Missing review prompt UI marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "handleRateWoof",
    "openStoreReview",
    "Rate Woof",
    "Could Not Open App Store",
    "Support the app with a quick rating",
  ]) {
    if (!profileSource.includes(needle)) {
      failures.push({
        file: "screens/ProfileScreen.js",
        output: `Missing profile review marker: ${needle}`,
      });
    }
  }

  const authSource = readFileSync("services/auth.js", "utf8");
  for (const needle of [
    "clearReviewPromptStorage",
    "clearReviewPromptStorage(deletedUserId)",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing account-scoped review cleanup marker: ${needle}`,
      });
    }
  }
}

function checkGuestSavePromptState() {
  const guestSavePromptSource = readFileSync("services/guestSavePrompt.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "GUEST_SAVE_PROMPT_KEY_PREFIX",
    "function guestSavePromptStorageKey",
    "hasSeenGuestSavePrompt",
    "markGuestSavePromptSeen",
    "clearGuestSavePromptStorage",
  ]) {
    if (!guestSavePromptSource.includes(needle)) {
      failures.push({
        file: "services/guestSavePrompt.js",
        output: `Missing guest-save prompt state marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "hasSeenGuestSavePrompt(user?.id || null)",
    "markGuestSavePromptSeen(user?.id || null)",
    "prompt_state_scoped",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Missing user-scoped guest-save prompt marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "clearGuestSavePromptStorage",
    "clearGuestSavePromptStorage(deletedUserId)",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing guest-save prompt cleanup marker: ${needle}`,
      });
    }
  }
}

function checkResultPromptState() {
  const promptStateSource = readFileSync("services/resultPromptState.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const authSource = readFileSync("services/auth.js", "utf8");

  for (const needle of [
    "FIRST_SCAN_TOAST_KEY_PREFIX",
    "POST_SCAN_PROMPT_KEY_PREFIX",
    "function resultPromptStorageKey",
    "hasSeenFirstScanToast",
    "markFirstScanToastSeen",
    "hasSeenPostScanPrompt",
    "markPostScanPromptSeen",
    "clearResultPromptState",
  ]) {
    if (!promptStateSource.includes(needle)) {
      failures.push({
        file: "services/resultPromptState.js",
        output: `Missing result prompt state marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "hasSeenFirstScanToast(user?.id || null)",
    "markFirstScanToastSeen(user?.id || null)",
    "hasSeenPostScanPrompt(user?.id || null)",
    "markPostScanPromptSeen(user?.id || null)",
    "prompt_state_scoped",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Missing user-scoped result prompt marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "clearResultPromptState",
    "clearResultPromptState(deletedUserId)",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({
        file: "services/auth.js",
        output: `Missing result prompt cleanup marker: ${needle}`,
      });
    }
  }
}

function checkSupportContactLoop() {
  const profileSource = readFileSync("screens/ProfileScreen.js", "utf8");

  for (const needle of [
    "handleContactSupport",
    "support_contact_tapped",
    "support_contact_opened",
    "support_contact_failed",
    "woofapp.help@gmail.com",
    "Contact Support",
    "Get help with scans, account, or Pro",
    "Mail",
  ]) {
    if (!profileSource.includes(needle)) {
      failures.push({
        file: "screens/ProfileScreen.js",
        output: `Missing support contact marker: ${needle}`,
      });
    }
  }
}

function checkLegalWebViewRecovery() {
  const webViewSource = readFileSync("screens/WebViewScreen.js", "utf8");

  for (const needle of [
    "startInLoadingState",
    "renderLoading",
    "Loading {title || \"page\"}",
    "renderError",
    "Page unavailable",
    "webViewRef.current?.reload()",
    "Try loading this page again",
  ]) {
    if (!webViewSource.includes(needle)) {
      failures.push({
        file: "screens/WebViewScreen.js",
        output: `Missing legal WebView recovery marker: ${needle}`,
      });
    }
  }
}

function checkHistoryCompareRetentionLoop() {
  const homeSource = readFileSync("screens/HomeScreen.js", "utf8");
  const historySource = readFileSync("services/history.js", "utf8");
  const analysisSource = readFileSync("services/analysisService.js", "utf8");
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const resultComponentsSource = readFileSync("screens/ResultsScreen/components.js", "utf8");
  const durableHistoryMigration = readFileSync(
    "supabase/migrations/296_durable_human_food_history_results.sql",
    "utf8"
  );

  for (const needle of [
    "HistoryTools",
    "FilteredHistoryEmptyState",
    "filterHistoryItems",
    "history_search_started",
    "history_search_submitted",
    "history_search_cleared",
    "history_filter_changed",
    "history_filters_cleared",
    "history_list_expanded",
    "history_list_collapsed",
    "home_history_search",
    "home_history_filter",
    "accessible={false}",
    'accessibilityLabel={`Show ${filter.label} scans`}',
    "accessibilityState={{ selected }}",
    "Show all",
    "CompareRecentCard",
    "CompareRecentModal",
    "isComparableHistoryItem",
    "selectDistinctComparableHistory",
    "comparableHistoryIdentity",
    "history_compare_opened",
    "history_compare_closed",
    "history_compare_result_opened",
    "history_item_opened",
    "home_compare_card",
    "home_compare_modal",
    "Compare recent scans",
    "pts apart",
  ]) {
    if (!homeSource.includes(needle)) {
      failures.push({
        file: "screens/HomeScreen.js",
      output: `Missing history retention marker: ${needle}`,
      });
    }
  }

  for (const [file, source, needles] of [
    ["services/history.js", historySource, [
      "HISTORY_LIST_COLUMNS",
      "boundedResultSnapshot",
      "getHistoryResultSnapshot",
      "result_snapshot",
    ]],
    ["services/analysisService.js", analysisSource, ["resultSnapshot: state.result"]],
    ["screens/HomeScreen.js", homeSource, ["historyEntryId", "historyResultSnapshot"]],
    ["screens/ResultsScreen/index.js", resultsSource, [
      "supabase_history_snapshot",
      "verified_catalog_rebuild",
      "history_result_rescan_tapped",
      "handleHistoryRecovery",
    ]],
    ["screens/ResultsScreen/components.js", resultComponentsSource, [
      "Saved Result Unavailable",
      "Scan Food Again",
      "Scan Product Again",
    ]],
    ["supabase/migrations/296_durable_human_food_history_results.sql", durableHistoryMigration, [
      "result_snapshot JSONB",
      "scan_mode = 'human_food'",
      "pg_column_size(result_snapshot) <= 131072",
    ]],
  ]) {
    for (const needle of needles) {
      if (!source.includes(needle)) {
        failures.push({ file, output: `Missing durable history marker: ${needle}` });
      }
    }
  }
}

function checkProfileScrollableLayout() {
  const profileSource = readFileSync("screens/ProfileScreen.js", "utf8");

  for (const needle of [
    "ScrollView",
    "contentContainerStyle={styles.scrollContent}",
    "keyboardShouldPersistTaps=\"handled\"",
    "scrollContent",
    "subscriptionCopy",
    "minWidth: 0",
  ]) {
    if (!profileSource.includes(needle)) {
      failures.push({
        file: "screens/ProfileScreen.js",
        output: `Missing Profile scroll layout marker: ${needle}`,
      });
    }
  }

  const footerBlock = profileSource.match(/footer:\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
  if (/\bflex:\s*1\b/.test(footerBlock)) {
    failures.push({
      file: "screens/ProfileScreen.js",
      output: "Profile footer must not use flex: 1 because it can push account actions off-screen inside the scroll container.",
    });
  }
}

function checkEntitlementEnvironmentParity() {
  const authSource = readFileSync("services/auth.js", "utf8");
  const entitlementSource = readFileSync("services/entitlements.js", "utf8");
  const homeSource = readFileSync("screens/HomeScreen.js", "utf8");

  for (const [file, source, needle] of [
    ["services/auth.js", authSource, "DEV_MODE"],
    ["services/entitlements.js", entitlementSource, "DEV_MODE"],
    ["services/entitlements.js", entitlementSource, 'reason: "dev_mode"'],
    ["screens/HomeScreen.js", homeSource, "DEV MODE • Unlimited scans"],
  ]) {
    if (source.includes(needle)) {
      failures.push({
        file,
        output: `Development builds must use production entitlement rules; remove: ${needle}`,
      });
    }
  }

  for (const needle of [
    "return isPro || scanCount < FREE_SCAN_LIMIT",
    "if (isPro) return Infinity",
  ]) {
    if (!authSource.includes(needle)) {
      failures.push({ file: "services/auth.js", output: `Missing real entitlement marker: ${needle}` });
    }
  }

  if (!entitlementSource.includes('supabase.rpc("consume_scan"')) {
    failures.push({
      file: "services/entitlements.js",
      output: "All builds must enforce cached-scan usage through consume_scan.",
    });
  }
}

function checkScanFirstOnboarding() {
  const appSource = readFileSync("App.js", "utf8");
  const onboardingSource = readFileSync("screens/OnboardingScreen.js", "utf8");

  for (const needle of [
    "<AuthProvider",
    "<OnboardingScreen onComplete={handleOnboardingComplete} />",
    "initialRouteName={initialRouteName}",
    "setInitialRouteName(nextRoute)",
  ]) {
    if (!appSource.includes(needle)) {
      failures.push({
        file: "App.js",
        output: `Missing scan-first app boot marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "onboarding_scan_now_tapped",
    "completion_method: completionMethod",
    "nextRoute: \"Scanner\"",
    "Scan the front label",
    "No barcode required",
    "Search works too",
    "verified ingredient list",
    "Scan Front Label",
    "How Woof works",
  ]) {
    if (!onboardingSource.includes(needle)) {
      failures.push({
        file: "screens/OnboardingScreen.js",
        output: `Missing scan-first onboarding marker: ${needle}`,
      });
    }
  }
}

function checkModeAwareScanRetry() {
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const componentsSource = readFileSync("screens/ResultsScreen/components.js", "utf8");

  for (const needle of [
    "const handleRetry = () =>",
    'trackEvent("scan_retry_tapped"',
    'resetToScanner({ mode: "human_food", petType })',
    'mode: "ingredient_capture"',
    "acquisitionQuery,",
    "candidateProduct,",
    "labelIdentification,",
    "sourceSurface,",
    "resetToScanner({ fallbackToPhoto: true })",
    "onRetry={handleRetry}",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Missing mode-aware scan retry marker: ${needle}`,
      });
    }
  }

  for (const needle of [
    "scanPhotoErrorMessage",
    "We couldn't read enough food details from that photo.",
    "We couldn't read a complete ingredients list from that photo.",
    "The connection was interrupted.",
  ]) {
    if (!componentsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/components.js",
        output: `Missing human-food error recovery marker: ${needle}`,
      });
    }
  }
}

function checkVerifiedIngredientsStayVisible() {
  const resultsSource = readFileSync("screens/ResultsScreen/index.js", "utf8");
  const componentsSource = readFileSync("screens/ResultsScreen/components.js", "utf8");

  for (const needle of [
    "Exact source-backed ingredients stay available to every user.",
    "ingredients={result.ingredients}",
    "!hasFullResultAccess && done && hasScore && !showPostScanPrompt",
  ]) {
    if (!resultsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/index.js",
        output: `Verified results must expose the complete ingredient list: missing ${needle}`,
      });
    }
  }

  for (const needle of [
    "const canExpand = total > COLLAPSED_COUNT;",
    "Go deeper with Woof Pro",
    "Unlimited scans, ingredient explanations",
    "Get unlimited scans and detailed ingredient explanations",
  ]) {
    if (!componentsSource.includes(needle)) {
      failures.push({
        file: "screens/ResultsScreen/components.js",
        output: `Missing verified-ingredient visibility marker: ${needle}`,
      });
    }
  }

  for (const forbidden of ["fadeLastItem", "ghostContainer", "ghostCard"]) {
    if (componentsSource.includes(forbidden) || resultsSource.includes(forbidden)) {
      failures.push({
        file: "screens/ResultsScreen/components.js",
        output: `Verified ingredient truth must not look hidden or still loading: remove ${forbidden}`,
      });
    }
  }
}

for (const file of filesToCheck) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures.push({
      file,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
    });
  }

  const source = readFileSync(file, "utf8");
  checkHookDependencySelfReferences(file, source);
  checkAppPriceTruth(file, source);
  checkLetterSpacingValues(file, source);
}

checkScanTimeoutOrdering();
checkDynamicTypeLayoutGuard();
checkClientCancellationReversalPath();
checkScannerPermissionFlow();
checkScanFailureTelemetry();
checkScanCostAttributionTelemetry();
checkCachedScanAccounting();
checkPaywallPurchaseInitialization();
checkProfileRestorePurchases();
checkPaywallRequestInstrumentation();
checkPaywallDismissalInstrumentation();
checkPaywallSourceIntentInstrumentation();
checkUserScopedScanCountStorage();
checkRevenueCatSyncDiagnostics();
checkAccountLinkRevenueCatReidentify();
checkRevenueCatSdkActivePrecedence();
checkGuestAuthEntry();
checkOAuthCallbackSessionExchange();
checkShareAcquisitionLoop();
checkAppReviewLoop();
checkGuestSavePromptState();
checkResultPromptState();
checkSupportContactLoop();
checkLegalWebViewRecovery();
checkHistoryCompareRetentionLoop();
checkProfileScrollableLayout();
checkEntitlementEnvironmentParity();
checkScanFirstOnboarding();
checkModeAwareScanRetry();
checkVerifiedIngredientsStayVisible();

if (failures.length > 0) {
  console.error("JavaScript syntax check failed:");
  for (const failure of failures) {
    console.error(`\n${failure.file}`);
    if (failure.output) {
      console.error(failure.output);
    }
  }
  process.exit(1);
}

console.log(`JavaScript syntax, hook dependency, UI text, app price truth, scan timeout, cancellation, structured scan failure telemetry, scan-cost attribution telemetry, cached scan accounting, paywall/Profile purchase restore, paywall request/dismissal/source-intent instrumentation, scan-count storage, RevenueCat sync diagnostic, account-link RevenueCat, SDK-active entitlement precedence, guest auth entry, OAuth callback exchange, share acquisition, app review loop, guest-save prompt state, support contact loop, legal WebView recovery, history compare retention loop, Profile scroll layout, scan-first onboarding, mode-aware retry, verified ingredient visibility, and entitlement environment parity check passed (${filesToCheck.length} files checked)`);
