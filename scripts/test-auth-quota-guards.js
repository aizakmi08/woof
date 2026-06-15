#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const authSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`auth quota guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  authSource.includes("parseStoredQuotaCount"),
  "local quota values must go through the sanitizer"
);

assert(
  authSource.includes("Math.min(scanCount + 1, FREE_SCAN_LIMIT)") &&
    authSource.includes("return newCount;"),
  "guest scan increments must be clamped to the free limit"
);

assert(
  authSource.includes("Math.min(humanFoodCountToday + 1, FREE_HUMAN_FOOD_PER_DAY)") &&
    authSource.includes("return next;"),
  "guest human-food increments must be clamped to the daily limit"
);

const incrementHumanFoodBlock = authSource.slice(
  authSource.indexOf("const incrementHumanFoodCount = useCallback"),
  authSource.indexOf("const canCheckHumanFood = useCallback")
);
const incrementScanBlock = authSource.slice(
  authSource.indexOf("const incrementScanCount = useCallback"),
  authSource.indexOf("const isGuest = !user")
);

assert(
  incrementHumanFoodBlock.includes("committed by the analyze Edge Function") &&
    incrementScanBlock.includes("committed by the analyze Edge Function"),
  "signed-in delivered quota mirrors must document server-owned Edge accounting"
);

assert(
  !incrementHumanFoodBlock.includes('supabase.rpc("increment_human_food_count"') &&
    !incrementScanBlock.includes('supabase.rpc("increment_scan_count"'),
  "signed-in delivered quota mirrors must not mutate server quota from the client"
);

assert(
  incrementHumanFoodBlock.includes("const mirrored = Math.min(humanFoodCountToday + 1, FREE_HUMAN_FOOD_PER_DAY)") &&
    incrementScanBlock.includes("const mirrored = Math.min(scanCount + 1, FREE_SCAN_LIMIT)"),
  "signed-in delivered quota mirrors must still update local UI state within free limits"
);

assert(
  !/for\s*\([^)]*local\s*-\s*(data\.scan_count|hfToday)/.test(authSource),
  "sign-in reconciliation must not replay unbounded local quota deltas"
);

assert(
  authSource.includes("parseStoredQuotaCount(localRaw, FREE_SCAN_LIMIT, \"scan\")") &&
    authSource.includes("const boundedDelta = Math.min(local - serverCount, FREE_SCAN_LIMIT - serverCount)") &&
    /for \(let i = 0; i < boundedDelta; i\+\+\)[\s\S]{0,220}increment_scan_count/.test(authSource),
  "pet-food guest carryover must clamp corrupted local counts before any server replay"
);

assert(
  authSource.includes("parseStoredQuotaCount(raw, FREE_HUMAN_FOOD_PER_DAY, \"human_food\")") &&
    !/for\s*\([^)]*increment_human_food_count/.test(authSource) &&
    /if \(!data\.is_pro && local > serverCount\) \{[\s\S]{0,180}increment_human_food_count/.test(authSource),
  "human-food guest carryover must be clamped and limited to one server increment"
);

assert(
  !/from\(["']profiles["']\)\s*\.\s*update\s*\(\s*\{[^}]*\b(is_pro|scan_count|human_food_count|human_food_count_date)\b/s.test(authSource),
  "client code must not directly update entitlement or quota columns"
);

assert(
  /const resetScanCount = useCallback\(async \(\) => \{[\s\S]{0,80}if \(!DEV_MODE\) return;[\s\S]{0,220}AsyncStorage\.setItem\(SCAN_COUNT_KEY, "0"\)/.test(authSource),
  "resetScanCount must be explicitly no-op outside development builds"
);

assert(
  /const resetHumanFoodQuota = useCallback\(async \(\) => \{[\s\S]{0,80}if \(!DEV_MODE\) return;[\s\S]{0,220}AsyncStorage\.multiRemove\(\[HUMAN_FOOD_COUNT_KEY, HUMAN_FOOD_DATE_KEY\]\)/.test(authSource),
  "resetHumanFoodQuota must be explicitly no-op outside development builds"
);

assert(
  !/event\s*===\s*["']SIGNED_OUT["'][\s\S]{0,240}setScanCount\s*\(\s*0\s*\)/.test(authSource),
  "sign-out must not reset the in-memory guest scan quota to zero"
);

assert(
  /function withTimeout\(promise, label, timeoutMs\) \{[\s\S]{0,220}setTimeout\(\(\) => reject\(new Error\(`\$\{label\}_TIMEOUT`\)\), timeoutMs\)[\s\S]{0,180}\.finally\(\(\) => clearTimeout\(timeout\)\)/.test(authSource),
  "auth timeout helper must clear its timer after success or failure"
);

assert(
  authSource.includes("await quotaHydration") && authSource.includes("setLoading(false)"),
  "startup must wait for quota hydration before clearing auth loading"
);

{
  const initialSessionStart = authSource.indexOf("// Get initial session");
  const authChangeStart = authSource.indexOf("const { data: { subscription } } = supabase.auth.onAuthStateChange", initialSessionStart);
  const initialSessionBlock = authSource.slice(initialSessionStart, authChangeStart);
  const profileAwaitIndex = initialSessionBlock.indexOf("await profileTask;");
  const purchasesIndex = initialSessionBlock.indexOf("startPurchaseStatusCheck(s.user.id, \"[AUTH] Purchases/pro check failed:\")");
  const loadingIndex = initialSessionBlock.indexOf("setLoading(false)");
  assert(
    initialSessionBlock.includes("Profile/quota hydration gates app readiness") &&
      initialSessionBlock.includes("const startPurchaseStatusCheck = (userId, failurePrefix) => {") &&
      initialSessionBlock.includes("const configurationIssue = getPurchaseConfigurationIssue()") &&
      initialSessionBlock.includes('console.log("[AUTH] Purchases init skipped:", configurationIssue.code, configurationIssue.diagnostics)') &&
      initialSessionBlock.includes('withTimeout(initializePurchases(userId), "PURCHASES_INIT", 5000)') &&
      initialSessionBlock.includes('.then(() => withTimeout(checkProStatus(userId), "PRO_CHECK", 3000))') &&
      initialSessionBlock.includes("const startAnonymousPurchasesInit = () => {") &&
      initialSessionBlock.includes('console.log("[AUTH] Guest purchases init skipped:", configurationIssue.code, configurationIssue.diagnostics)') &&
      initialSessionBlock.includes("initializePurchases(null).catch(() => {})") &&
      initialSessionBlock.includes("startAnonymousPurchasesInit();") &&
      initialSessionBlock.includes("const profileTask = withTimeout(fetchProfile(s.user.id), \"PROFILE\", 5000)") &&
      purchasesIndex !== -1 &&
      profileAwaitIndex !== -1 &&
      loadingIndex !== -1 &&
      purchasesIndex < profileAwaitIndex &&
      profileAwaitIndex < loadingIndex &&
      !initialSessionBlock.includes("const withTimeout =") &&
      !/await Promise\.allSettled\([\s\S]{0,120}initializePurchases\(s\.user\.id\)/.test(initialSessionBlock),
    "initial signed-in startup must not block auth loading on RevenueCat init/pro checks"
  );
}

{
  const signInStart = authSource.indexOf('if (event === "SIGNED_IN" && s?.user)');
  const signedOutStart = authSource.indexOf('if (event === "SIGNED_OUT")', signInStart);
  const signInBlock = authSource.slice(signInStart, signedOutStart);
  const signInPurchasesIndex = signInBlock.indexOf('startPurchaseStatusCheck(s.user.id, "[AUTH] RevenueCat init/pro check failed:")');
  const signInProfileAwaitIndex = signInBlock.indexOf("await profileTask;");
  assert(
    signInBlock.includes('const profileTask = withTimeout(fetchProfile(s.user.id), "PROFILE", 5000)') &&
      signInPurchasesIndex !== -1 &&
      signInProfileAwaitIndex !== -1 &&
      signInPurchasesIndex < signInProfileAwaitIndex &&
      !signInBlock.includes("Promise.all([") &&
      !signInBlock.includes('"AUTH"') &&
      !/new Promise\([\s\S]{0,160}setTimeout\([\s\S]{0,120}AUTH_TIMEOUT/.test(signInBlock),
    "signed-in auth hydration must not block readiness on RevenueCat init/pro checks"
  );
}

assert(
  authSource.includes("hasDevScanBypass: devBypass") &&
    /value=\{\{[\s\S]{0,260}\bisPro,[\s\S]{0,80}hasDevScanBypass: devBypass/.test(authSource) &&
    !authSource.includes("isPro: devBypass || isPro") &&
    authSource.includes("must not masquerade as") &&
    authSource.includes("server-side profile/RevenueCat state"),
  "development scan bypass must stay separate from the real Pro entitlement"
);

console.log("auth quota guard passed");
