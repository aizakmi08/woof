#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const componentsSource = fs.readFileSync(
  path.join(root, "screens/ResultsScreen/components.js"),
  "utf8"
);
const resultsSource = fs.readFileSync(
  path.join(root, "screens/ResultsScreen/index.js"),
  "utf8"
);
const errorsSource = fs.readFileSync(
  path.join(root, "services/errors.js"),
  "utf8"
);
const stylesSource = fs.readFileSync(
  path.join(root, "screens/ResultsScreen/styles.js"),
  "utf8"
);
const quotaErrorBlock = componentsSource.slice(
  componentsSource.indexOf('classified.kind === "quota"'),
  componentsSource.indexOf('classified.kind === "product_not_found"')
);
const upgradeErrorHandlerBlock = resultsSource.slice(
  resultsSource.indexOf("const handleUpgradeFromError"),
  resultsSource.indexOf("const handleSignInAgain")
);
const retryHandlerBlock = resultsSource.slice(
  resultsSource.indexOf("const handleRetry"),
  resultsSource.indexOf("const handleUpgradeFromError")
);
const petTypeHandlerBlock = resultsSource.slice(
  resultsSource.indexOf("const handleChoosePetType"),
  resultsSource.indexOf("const handleCaptureLabel")
);
const useEstimateHandlerBlock = resultsSource.slice(
  resultsSource.indexOf("const handleUseEstimate"),
  resultsSource.indexOf("const handleTakePhoto")
);
const serviceErrorEventBlock = resultsSource.slice(
  resultsSource.indexOf('} else if (event.type === "error")'),
  resultsSource.indexOf("trackEvent(\"analysis_failed\"", resultsSource.indexOf('} else if (event.type === "error")'))
);
const serviceEventBlock = resultsSource.slice(
  resultsSource.indexOf("const unsub = analysisService.subscribe"),
  resultsSource.indexOf("const currentKey = serviceKeyRef.current", resultsSource.indexOf("const unsub = analysisService.subscribe"))
);
const watchdogBlock = resultsSource.slice(
  resultsSource.indexOf("// Last-resort UI guard"),
  resultsSource.indexOf("// Error haptic")
);

function assert(condition, message) {
  if (!condition) {
    console.error(`results error guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /const \{[\s\S]{0,260}mode[\s\S]{0,80}base64[\s\S]{0,80}uri[\s\S]{0,80}barcode[\s\S]{0,80}cacheKey[\s\S]{0,260}\} = route\.params \|\| \{\};/.test(resultsSource),
  "Results must defensively handle missing route params"
);

assert(
  resultsSource.includes("const hasRenderableResult = Boolean(result && (") &&
    resultsSource.includes("? (result.foodName || result.summary || result.safetyLevel)") &&
    resultsSource.includes(": (result.productName || result.scorePending === true || result.overallScore != null)") &&
    resultsSource.includes("const isLoading = !hasRenderableResult && !error && !done && !isPausedForInput") &&
    !resultsSource.includes("const isLoading = result === null"),
  "Results must keep empty startup objects in the loading skeleton until a meaningful preview, score, prompt, or error exists"
);

assert(
  resultsSource.includes("function runningAnalysisStatus(mode, existing)") &&
    resultsSource.includes('if (mode === "human_food") return "Checking food safety...";') &&
    resultsSource.includes('if (existing?.result?.scorePending === true) return "Scoring verified ingredients...";') &&
    resultsSource.includes("return `Analyzing ${existing.result.productName}...`;") &&
    /if \(existing\.status === "running"\) \{[\s\S]{0,220}setStreaming\(true\);[\s\S]{0,120}setIsSlowLoading\(false\);[\s\S]{0,140}setLoadingStatus\(runningAnalysisStatus\(fallbackMode \|\| existing\.mode \|\| mode, existing\)\);/.test(resultsSource) &&
    /if \(active && active\.status === "running"\) \{[\s\S]{0,360}setIsSlowLoading\(false\);[\s\S]{0,120}setLoadingStatus\(runningAnalysisStatus\(scanMode \|\| mode, active\)\);/.test(resultsSource),
  "Results must reset stale slow-loading state and show context-specific loading copy when reattaching to an already-running analysis"
);

assert(
  /export function ErrorState\(\{[^}]*onUpgrade/s.test(componentsSource),
  "ErrorState must accept an explicit onUpgrade handler"
);

assert(
  /export function ErrorState\(\{[^}]*onScanProduct/s.test(componentsSource),
  "ErrorState must accept an explicit scan-product handler"
);

assert(
  /export function ErrorState\(\{[^}]*onSignInAgain/s.test(componentsSource),
  "ErrorState must accept an explicit sign-in recovery handler"
);

assert(
  /export function ErrorState\(\{[^}]*isPro = false/s.test(componentsSource),
  "ErrorState must accept the current Pro state for quota mismatch recovery"
);

assert(
  quotaErrorBlock.includes('buttonLabel = "Upgrade to Pro";') &&
    quotaErrorBlock.includes("buttonAction = onUpgrade;"),
  "quota errors must route the free-user Upgrade CTA to onUpgrade"
);

assert(
  quotaErrorBlock.includes("if (isPro)") &&
    quotaErrorBlock.includes("Subscription Sync Needed") &&
    quotaErrorBlock.includes('buttonLabel = "Refresh & Retry";') &&
    quotaErrorBlock.includes("buttonAction = onUpgrade;"),
  "quota errors for locally active Pro users must show subscription refresh/retry recovery instead of an upgrade CTA"
);

assert(
  !/classified\.kind === "quota"[\s\S]{0,220}buttonAction = onScanAnother;/.test(componentsSource),
  "quota errors must not route to the scan-another/home handler"
);

assert(
  resultsSource.includes("const handleUpgradeFromError") &&
    resultsSource.includes('source: "quota_error"') &&
    /<ErrorState[\s\S]{0,260}onUpgrade=\{handleUpgradeFromError\}/.test(resultsSource),
  "Results must pass a Paywall navigation handler into ErrorState"
);

assert(
  retryHandlerBlock.includes('if (mode === "history" && cacheKey)') &&
    retryHandlerBlock.includes("...(scanMode && { scanMode })") &&
    retryHandlerBlock.includes("...(petType && { petType })") &&
    retryHandlerBlock.includes("...(historyAnalysis && { historyAnalysis })") &&
    !retryHandlerBlock.includes("...(scanMode && { scanMode, petType, historyAnalysis })"),
  "history retry must preserve inferred pet type and saved analysis payload even when scanMode is absent"
);

assert(
  resultsSource.includes("const prestartReplacementAnalysis = useCallback((params, label) => {") &&
    resultsSource.includes("analysisService.startAnalysis({ ...params, isPro });") &&
    resultsSource.includes("analysis prestart failed") &&
    /}, \[isPro\]\);/.test(resultsSource),
  "Results replacement flows must have a shared isPro-aware analysis prestart helper"
);

assert(
  /if \(mode === "barcode" && barcode\) \{[\s\S]{0,160}prestartReplacementAnalysis\(\{ mode: "barcode", barcode, petType \}, "Retry barcode"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(retryHandlerBlock) &&
    /if \(mode === "search" && preProductName\) \{[\s\S]{0,260}prestartReplacementAnalysis\(\{[\s\S]{0,160}mode: "search"[\s\S]{0,160}selectedCacheKey: cacheKey[\s\S]{0,160}selectedProductData: catalogSnapshot[\s\S]{0,160}\}, "Retry search"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(retryHandlerBlock) &&
    /if \(mode === "human_food" && preFoodName && !base64\) \{[\s\S]{0,180}prestartReplacementAnalysis\(\{ mode: "human_food", foodName: preFoodName, petType \}, "Retry human-food text"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(retryHandlerBlock) &&
    /if \(\(mode === "photo" \|\| mode === "human_food" \|\| mode === "photo_with_ingredients"\) && base64\) \{[\s\S]{0,260}prestartReplacementAnalysis\(\{[\s\S]{0,120}mode,[\s\S]{0,120}base64,[\s\S]{0,120}ingredientBase64,[\s\S]{0,160}productName: preProductName[\s\S]{0,180}\}, "Retry photo"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(retryHandlerBlock) &&
    retryHandlerBlock.includes("prestartReplacementAnalysis]"),
  "retryable Results inputs must pre-start the replacement analysis before route remount"
);

assert(
    upgradeErrorHandlerBlock.includes("const handleUpgradeFromError = async () =>") &&
    upgradeErrorHandlerBlock.includes("if (isPro)") &&
    upgradeErrorHandlerBlock.includes("await refreshProStatus()") &&
    upgradeErrorHandlerBlock.includes("if (refreshed === true)") &&
    upgradeErrorHandlerBlock.includes("handleRetry()") &&
    upgradeErrorHandlerBlock.includes("Subscription Check Failed") &&
    upgradeErrorHandlerBlock.includes("return;") &&
    /<ErrorState[\s\S]{0,380}isPro=\{isPro\}/.test(resultsSource),
  "active-Pro quota errors must refresh subscription state, retry confirmed-Pro scans, and avoid navigating to an auto-dismissing paywall"
);

assert(
  resultsSource.includes("const proQuotaAutoRetryRef = useRef(false)") &&
    resultsSource.includes("const uiTerminalRef = useRef(false)") &&
    resultsSource.includes("proQuotaRecoveryAttempted = false") &&
    resultsSource.includes("const isProRef = useRef(isPro)") &&
    resultsSource.includes("const refreshProStatusRef = useRef(refreshProStatus)") &&
    resultsSource.includes("const handleRetryRef = useRef(null)") &&
    resultsSource.includes("isProRef.current = isPro") &&
    resultsSource.includes("refreshProStatusRef.current = refreshProStatus") &&
    resultsSource.includes("handleRetryRef.current = handleRetry") &&
    resultsSource.includes("proQuotaAutoRetryRef.current = Boolean(proQuotaRecoveryAttempted)") &&
    serviceErrorEventBlock.includes('const classified = classifyError(event.error);') &&
    serviceErrorEventBlock.includes("const currentIsPro = isProRef.current") &&
    serviceErrorEventBlock.includes("const currentRefreshProStatus = refreshProStatusRef.current") &&
    serviceErrorEventBlock.includes("const currentHandleRetry = handleRetryRef.current") &&
    serviceErrorEventBlock.includes('classified.kind === "quota" && currentIsPro && currentRefreshProStatus && currentHandleRetry && !proQuotaAutoRetryRef.current') &&
    serviceErrorEventBlock.includes("proQuotaAutoRetryRef.current = true") &&
    serviceErrorEventBlock.includes('setLoadingStatus("Refreshing subscription...")') &&
    !serviceErrorEventBlock.includes('"Checking subscription..."') &&
    serviceErrorEventBlock.includes("currentRefreshProStatus()") &&
    serviceErrorEventBlock.includes("if (refreshed === true)") &&
    serviceErrorEventBlock.includes("currentHandleRetry({ proQuotaRecoveryAttempted: true })") &&
    serviceErrorEventBlock.includes('console.log("[RESULTS] Auto Pro quota recovery failed:"') &&
    serviceErrorEventBlock.includes("setError(event.error)") &&
    serviceErrorEventBlock.includes("return;"),
  "locally active Pro quota errors must auto-refresh and retry once using current subscription/retry refs before surfacing the quota error"
);

assert(
  resultsSource.includes("uiTerminalRef.current = false") &&
    /if \(event\.type === "phase"\) \{[\s\S]{0,80}if \(uiTerminalRef\.current\) return;/.test(serviceEventBlock) &&
    /else if \(event\.type === "update"\) \{[\s\S]{0,80}if \(uiTerminalRef\.current\) return;/.test(serviceEventBlock) &&
    /else if \(event\.type === "complete"\) \{[\s\S]{0,120}if \(uiTerminalRef\.current\) return;[\s\S]{0,520}setDone\(true\);[\s\S]{0,80}uiTerminalRef\.current = true;/.test(serviceEventBlock) &&
    /else if \(event\.type === "error"\) \{[\s\S]{0,80}if \(uiTerminalRef\.current\) return;/.test(serviceEventBlock) &&
    serviceErrorEventBlock.includes("uiTerminalRef.current = true") &&
    watchdogBlock.includes("analysisService.cancelAnalysis(currentKey, \"results_watchdog_timeout\")") &&
    watchdogBlock.includes("uiTerminalRef.current = true") &&
    watchdogBlock.includes('setError("Analysis is taking too long. Please try again.")'),
  "Results must drop late service events after terminal UI states so timeouts/errors cannot be resurrected into infinite loading"
);

assert(
  /classified\.kind === "auth"[\s\S]{0,160}buttonLabel = "Sign In Again";[\s\S]{0,120}buttonAction = onSignInAgain \|\| onScanAnother;/.test(componentsSource) &&
    !componentsSource.includes("supabase.auth.signOut()"),
  "auth errors must route Sign In Again to an explicit Results-provided handler, not silently sign out"
);

assert(
  resultsSource.includes("const handleSignInAgain = async () =>") &&
    resultsSource.includes("await signOut();") &&
    /navigation\.navigate\("Auth", \{[\s\S]{0,180}source: "session_expired"[\s\S]{0,120}returnTo: "Results"/.test(resultsSource) &&
    /<ErrorState[\s\S]{0,360}onSignInAgain=\{handleSignInAgain\}/.test(resultsSource),
  "Results auth recovery must clear stale auth, open Auth, and preserve the current Results screen for retry"
);

assert(
  errorsSource.includes("PRODUCT_NOT_FOUND_PATTERNS") &&
    errorsSource.includes('kind: "product_not_found"') &&
    errorsSource.includes('action: "scan_product"') &&
    /retryable:\s*false/.test(errorsSource),
  "product-not-found search misses must be classified as non-retryable scan actions"
);

assert(
  errorsSource.includes("/subscription sync unavailable/i") &&
    errorsSource.includes("/quota check unavailable/i") &&
    errorsSource.includes("SERVER_PATTERNS") &&
    errorsSource.includes('kind: "server"'),
  "subscription/quota sync outages must classify as retryable server errors instead of quota upgrade prompts"
);

assert(
  /classified\.kind === "product_not_found"[\s\S]{0,220}buttonLabel = "Scan Product";[\s\S]{0,140}buttonAction = onScanProduct \|\| onScanAnother;/.test(componentsSource),
  "product-not-found errors must route the primary CTA to Scan Product"
);

assert(
  resultsSource.includes("const handleScanProduct") &&
    /navigation\.replace\("Scanner", \{ petType \}\)/.test(resultsSource) &&
    /<ErrorState[\s\S]{0,320}onScanProduct=\{handleScanProduct\}/.test(resultsSource),
  "Results must replace failed catalog-miss screens with the Scanner route"
);

assert(
  resultsSource.includes("firstScanToastScheduledRef") &&
    /<FirstScanToast\s+visible=\{showFirstScanToast\}/.test(resultsSource) &&
    resultsSource.includes("styles.firstScanToastOverlay"),
  "first-scan toast must be mounted from the Results success layout"
);

assert(
  /useEffect\(\(\) => \{\s*if \(!showFirstScanToast\) return;[\s\S]{0,160}AsyncStorage\.setItem\("@woof_first_scan_toast_shown", "true"\)/.test(resultsSource),
  "first-scan toast flag must be persisted after the toast becomes visible"
);

assert(
  stylesSource.includes("firstScanToastOverlay") &&
    stylesSource.includes('position: "absolute"') &&
    stylesSource.includes('alignItems: "center"'),
  "first-scan toast overlay style must keep the toast out of the scroll layout"
);

assert(
  resultsSource.includes("committedScanCount") &&
    resultsSource.includes("await incrementScanCount()") &&
    resultsSource.includes("setCommittedScanCount(committedCount)"),
  "post-scan prompt must be driven by the committed scan count returned by incrementScanCount"
);

assert(
  /if \(committedScanCount < 2\) return;/.test(resultsSource) &&
    !/const scansUsed = 3 - remainingScans\(\);/.test(resultsSource),
  "post-scan prompt must not read stale remainingScans timing"
);

assert(
    retryHandlerBlock.includes('if (mode === "history" && cacheKey)') &&
    retryHandlerBlock.includes("...(scanMode && { scanMode })") &&
    retryHandlerBlock.includes("...(petType && { petType })") &&
    retryHandlerBlock.includes("...(historyAnalysis && { historyAnalysis })") &&
    retryHandlerBlock.includes("[navigation, mode, cacheKey, scanMode, petType, historyAnalysis, barcode, preProductName"),
  "history retries must preserve replay payloads so human-food history can reload without cache/network lookup"
);

assert(
  /needsPetType\.mode === "search"[\s\S]{0,260}prestartReplacementAnalysis\(\{[\s\S]{0,160}mode: "search"[\s\S]{0,160}selectedCacheKey: needsPetType\.cacheKey \|\| cacheKey[\s\S]{0,220}\}, "Pet-type search"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(petTypeHandlerBlock) &&
    /needsPetType\.mode === "barcode"[\s\S]{0,160}prestartReplacementAnalysis\(\{[\s\S]{0,120}mode: "barcode"[\s\S]{0,120}barcode: needsPetType\.barcode \|\| barcode[\s\S]{0,120}petType: selectedPetType[\s\S]{0,120}\}, "Pet-type barcode"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(petTypeHandlerBlock) &&
    /needsPetType\.mode === "photo_with_ingredients"[\s\S]{0,260}prestartReplacementAnalysis\(\{[\s\S]{0,120}mode: "photo_with_ingredients"[\s\S]{0,120}base64,[\s\S]{0,120}ingredientBase64,[\s\S]{0,160}petType: selectedPetType[\s\S]{0,120}\}, "Pet-type label photo"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(petTypeHandlerBlock) &&
    /prestartReplacementAnalysis\(\{[\s\S]{0,120}mode: "photo"[\s\S]{0,120}base64,[\s\S]{0,120}petType: selectedPetType[\s\S]{0,120}\}, "Pet-type photo"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(petTypeHandlerBlock),
  "pet-type recovery confirmations must pre-start the selected-species replacement analysis before Results remount"
);

assert(
  /const handleUseEstimate = useCallback\(\(\) => \{[\s\S]{0,120}if \(!needsLabel \|\| !base64\) return;[\s\S]{0,160}setNeedsLabel\(null\);[\s\S]{0,220}prestartReplacementAnalysis\(\{[\s\S]{0,120}mode: "photo_with_ingredients"[\s\S]{0,120}base64,[\s\S]{0,160}productName: needsLabel\.productName[\s\S]{0,120}brand: needsLabel\.brand[\s\S]{0,120}petType: needsLabel\.petType[\s\S]{0,120}\}, "Inline estimate"\);[\s\S]{0,120}navigation\.replace\("Results"/.test(useEstimateHandlerBlock),
  "inline estimate recovery must pre-start identified-product analysis before replacing Results"
);

assert(
  retryHandlerBlock.includes('if (mode === "search" && preProductName)') &&
    retryHandlerBlock.includes("catalogSnapshot, petType") &&
    retryHandlerBlock.includes("[navigation, mode, cacheKey, scanMode, petType, historyAnalysis, barcode, preProductName, preBrand, preFoodName, base64, uri, ingredientBase64, catalogSnapshot, prestartReplacementAnalysis]"),
  "search retries must preserve the validated catalog snapshot so retry does not redo the exact product_data lookup"
);

assert(
  retryHandlerBlock.includes('if (mode === "barcode" && barcode)') &&
    /navigation\.replace\("Results", \{[\s\S]{0,180}mode,[\s\S]{0,120}barcode,[\s\S]{0,120}\.\.\.\(petType && \{ petType \}\)[\s\S]{0,220}\.\.\.\(cacheKey && \{ cacheKey \}\)[\s\S]{0,180}\}\);/.test(retryHandlerBlock) &&
    retryHandlerBlock.indexOf('if (mode === "barcode" && barcode)') < retryHandlerBlock.indexOf('if (mode === "search" && preProductName)'),
  "barcode retries must preserve the scanned barcode and selected pet type so Pro quota recovery retries the same in-store scan instead of popping home"
);

assert(
  /mode === "human_food" && preFoodName && !base64[\s\S]{0,140}foodName: preFoodName/.test(resultsSource),
  "text-only human-food retries must preserve the original food name"
);

assert(
  /\(mode === "photo" \|\| mode === "human_food" \|\| mode === "photo_with_ingredients"\) && base64[\s\S]{0,220}foodName: preFoodName/.test(resultsSource),
  "photo human-food retries must also preserve the original food name when present"
);

console.log("results error guard passed");
