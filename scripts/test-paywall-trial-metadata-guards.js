#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const paywallSource = fs.readFileSync(path.join(root, "screens/PaywallScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`paywall trial metadata guard failed: ${message}`);
    process.exit(1);
  }
}

for (const forbidden of [
  "hasTrial: true",
  "Try Free for 3 Days",
  "Try free for 3 days",
  "Cancel before day 3",
  "$2.50 / month",
  "$7.99/month",
]) {
  assert(!paywallSource.includes(forbidden), `hardcoded paywall claim remains: ${forbidden}`);
}

assert(
  paywallSource.includes("pkg?.product?.introPrice") &&
    paywallSource.includes("Number(introPrice.price) !== 0") &&
    paywallSource.includes("selectedTrial = getFreeTrialInfo(selectedPkg)"),
  "trial state must be derived from RevenueCat introPrice metadata"
);

assert(
  paywallSource.includes("product.pricePerMonthString") &&
    paywallSource.includes("Number(product.price) / 12") &&
    paywallSource.includes("product.currencyCode"),
  "annual monthly equivalent must be derived from RevenueCat price metadata"
);

assert(
  paywallSource.includes("periodNoun(product.subscriptionPeriod)") &&
    paywallSource.includes("billingCopy(selectedPkg)"),
  "non-trial billing copy must use the selected product period and price"
);

assert(
  paywallSource.includes("const ctaLabel = isQuotaSyncMismatch") &&
    paywallSource.includes('? "Refresh Subscription"') &&
    paywallSource.includes("offeringsError\n    ? \"Plans Unavailable\"") &&
    paywallSource.includes('!offeringsResolved\n    ? "Loading Plans..."') &&
    paywallSource.includes("? `Try Free for ${selectedTrial.durationLabel}`") &&
    paywallSource.includes(": \"Subscribe Now\"") &&
    /Cancel before the trial ends/.test(paywallSource),
  "trial CTA and trust copy must be metadata-driven and generic"
);

assert(
  packageJson.includes('"test:paywall-trial": "node scripts/test-paywall-trial-metadata-guards.js"') &&
    packageJson.includes("npm run test:paywall-trial"),
  "paywall trial metadata guard must be wired into package scripts"
);

console.log("paywall trial metadata guard passed");
