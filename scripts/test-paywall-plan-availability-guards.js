#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const paywallSource = fs.readFileSync(path.join(root, "screens/PaywallScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`paywall plan availability guard failed: ${message}`);
    process.exit(1);
  }
}

for (const forbidden of [
  'weeklyPkg?.product?.priceString || "$4.99"',
  'monthlyPkg?.product?.priceString || "$7.99"',
  'annualPkg?.product?.priceString || "$29.99"',
]) {
  assert(!paywallSource.includes(forbidden), `hardcoded unavailable plan price remains: ${forbidden}`);
}

assert(
  paywallSource.includes("function displayPrice(pkg, offeringsResolved)") &&
    paywallSource.includes('return offeringsResolved ? "Unavailable" : "Loading";') &&
    paywallSource.includes("function annualMonthlyEquivalent(pkg, offeringsResolved)") &&
    paywallSource.includes('if (!pkg && offeringsResolved) return "Unavailable in this build";') &&
    paywallSource.includes("function planSubtitle(pkg, fallback, offeringsResolved = false)") &&
    paywallSource.includes("function planPeriodLabel(pkg, fallback, offeringsResolved)") &&
    paywallSource.includes('return !pkg && offeringsResolved ? "not available" : fallback;') &&
    paywallSource.includes("const offeringsResolved = Boolean(offerings || offeringsError)") &&
    paywallSource.includes("const weeklyPrice = displayPrice(weeklyPkg, offeringsResolved)") &&
    paywallSource.includes("const monthlyPrice = displayPrice(monthlyPkg, offeringsResolved)") &&
    paywallSource.includes("const annualPrice = displayPrice(annualPkg, offeringsResolved)") &&
    paywallSource.includes("annualMonthlyEquivalent(annualPkg, offeringsResolved)") &&
    paywallSource.includes('planPeriodLabel(annualPkg, "per year", offeringsResolved)') &&
    paywallSource.includes('planSubtitle(monthlyPkg, "Billed monthly", offeringsResolved)') &&
    paywallSource.includes('planSubtitle(weeklyPkg, "Billed weekly", offeringsResolved)'),
  "paywall must show loading only before offerings resolve and unavailable copy after RevenueCat errors or missing packages"
);

assert(
  /if \(!offerings \|\| selectedPkg\) return;[\s\S]{0,120}const nextIndex = \[2, 1, 0\]\.find\(\(index\) => pkgByIndex\[index\]\);[\s\S]{0,80}setSelectedIndex\(nextIndex\)/.test(
    paywallSource
  ),
  "paywall must auto-select an available package when the selected plan is unavailable"
);

assert(
  paywallSource.includes("const ctaDisabled = isLoading || (!isQuotaSyncMismatch && !selectedPkg)") &&
    paywallSource.includes("offeringsError\n    ? \"Plans Unavailable\"") &&
    paywallSource.includes('!offeringsResolved\n    ? "Loading Plans..."') &&
    paywallSource.includes('!selectedPkg\n      ? "Plan Unavailable"') &&
    paywallSource.includes("disabled={ctaDisabled}") &&
    paywallSource.includes("accessibilityState={{ disabled: ctaDisabled }}"),
  "paywall CTA must be disabled and clearly labeled when no selected package is purchasable"
);

assert(
  paywallSource.includes("getPurchaseConfigurationIssue") &&
    paywallSource.includes("const [offeringsError, setOfferingsError] = useState(() => getPurchaseConfigurationIssue())") &&
    paywallSource.includes("const configurationIssue = getPurchaseConfigurationIssue()") &&
    paywallSource.includes("[PAYWALL] offerings skipped:") &&
    paywallSource.includes("purchaseConfigMessage(offeringsError)") &&
    paywallSource.includes("purchaseConfigDetail(offeringsError)") &&
    paywallSource.includes("Purchases are unavailable in Expo Go") &&
    paywallSource.includes('error?.code === "revenuecat_operation_timeout"') &&
    paywallSource.includes("Subscriptions are taking too long to load") &&
    paywallSource.includes("REVENUECAT_TEST_STORE_API_KEY") &&
    paywallSource.includes("Expo Go runtime detected") &&
    paywallSource.includes("RevenueCat rejected the ${platform} public SDK key"),
  "paywall must surface RevenueCat, Expo Go, and Test Store configuration errors immediately instead of staying in a vague loading state"
);

assert(
  paywallSource.includes("function blocksRestorePurchases(error)") &&
    paywallSource.includes('code === "expo_go_revenuecat_unavailable"') &&
    paywallSource.includes('code === "missing_revenuecat_api_key"') &&
    paywallSource.includes('code === "invalid_revenuecat_api_key_prefix"') &&
    paywallSource.includes("/native store is not available/i.test(message)") &&
    paywallSource.includes("const restoreDisabled = isLoading || blocksRestorePurchases(offeringsError)") &&
    paywallSource.includes("Alert.alert(\"Restore Unavailable\", purchaseConfigMessage(offeringsError))") &&
    paywallSource.includes("disabled={restoreDisabled}") &&
    paywallSource.includes("accessibilityState={{ disabled: restoreDisabled }}") &&
    paywallSource.includes('blocksRestorePurchases(offeringsError) ? "Restore Unavailable" : "Restore Purchases"'),
  "paywall must disable restore for hard RevenueCat configuration failures instead of sending users into a restore call that cannot succeed"
);

assert(
  paywallSource.includes('const isQuotaSyncMismatch = isPro && source === "quota_error"') &&
    /if \(isPro && !isQuotaSyncMismatch[\s\S]{0,180}safeGoBack\(\);/.test(paywallSource) &&
    paywallSource.includes('isQuotaSyncMismatch\n    ? "Refresh Subscription"') &&
    paywallSource.includes("if (isQuotaSyncMismatch)") &&
    paywallSource.includes("const refreshed = await refreshProStatus()") &&
    paywallSource.includes("Go back and retry the scan so the server can re-check your access") &&
    paywallSource.includes("Your Pro access is active on this device, but the scan server returned a free-limit response"),
  "quota-error paywalls for locally active Pro users must stay open as subscription-sync recovery instead of auto-dismissing or offering another purchase"
);

for (const [label, pkgName] of [
  ["Weekly", "weeklyPkg"],
  ["Monthly", "monthlyPkg"],
  ["Annual", "annualPkg"],
]) {
  assert(
    paywallSource.includes(`disabled={isLoading || (offeringsResolved && !${pkgName})}`) &&
      paywallSource.includes(`offeringsResolved && !${pkgName} && styles.pricingRowUnavailable`) &&
      paywallSource.includes(`accessibilityLabel="${label} plan"`),
    `${label} row must be disabled and marked unavailable when RevenueCat omits its package`
  );
}

assert(
  packageJson.includes('"test:paywall-plan-availability": "node scripts/test-paywall-plan-availability-guards.js"') &&
    packageJson.includes("npm run test:paywall-plan-availability"),
  "paywall plan availability guard must be wired into package scripts"
);

console.log("paywall plan availability guard passed");
