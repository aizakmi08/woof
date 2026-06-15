#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const profileSource = fs.readFileSync(path.join(root, "screens/ProfileScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`manage subscription guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  profileSource.includes("const SUPPORT_EMAIL = \"woofapp.help@gmail.com\"") &&
    profileSource.includes("const SUBSCRIPTION_URLS =") &&
    profileSource.includes("https://apps.apple.com/account/subscriptions") &&
    profileSource.includes("https://play.google.com/store/account/subscriptions"),
  "Profile must keep explicit iOS and Android subscription management URLs"
);

assert(
  profileSource.includes("const showManageSubscriptionFallback = useCallback") &&
    profileSource.includes("Open Settings, tap your Apple ID, then Subscriptions") &&
    profileSource.includes("Open Google Play, tap your profile icon, then Payments & subscriptions") &&
    profileSource.includes("Email Support") &&
    profileSource.includes("mailto:${SUPPORT_EMAIL}?subject=Woof%20Subscription%20Help"),
  "Profile must show manual subscription instructions and support fallback"
);

assert(
  /const handleManageSubscription = useCallback\(async \(\) => \{[\s\S]{0,700}const supported = await Linking\.canOpenURL\(url\);[\s\S]{0,220}await Linking\.openURL\(url\);[\s\S]{0,180}catch \(err\) \{[\s\S]{0,120}showManageSubscriptionFallback\(\);/.test(
    profileSource
  ),
  "Manage subscription must await canOpenURL/openURL and fall back on failure"
);

assert(
  !/^\s*Linking\.openURL\(url\);/m.test(profileSource),
  "Manage subscription must not use an unawaited bare Linking.openURL(url)"
);

assert(
  /onPress=\{handleManageSubscription\}[\s\S]{0,220}accessibilityLabel=\{isPro \? "Manage subscription" : "Upgrade to Pro"\}[\s\S]{0,220}accessibilityHint=/.test(
    profileSource
  ),
  "Profile subscription button must use the hardened handler and accessible hint"
);

assert(
  packageJson.includes('"test:manage-subscription": "node scripts/test-manage-subscription-guards.js"') &&
    packageJson.includes("npm run test:manage-subscription"),
  "manage subscription guard must be wired into package scripts"
);

console.log("manage subscription guard passed");
