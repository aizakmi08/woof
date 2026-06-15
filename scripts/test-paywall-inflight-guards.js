#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const paywallSource = fs.readFileSync(
  path.join(root, "screens/PaywallScreen.js"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`paywall inflight guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  paywallSource.includes("const mountedRef = useRef(true)") &&
    /useEffect\(\(\) => \(\) => \{[\s\S]{0,80}mountedRef\.current = false;[\s\S]{0,20}\}, \[\]\);/.test(paywallSource),
  "Paywall must track mounted state and clear it on unmount"
);

assert(
  /const safeGoBack = \(\) => \{[\s\S]{0,180}dismissedRef\.current = true;[\s\S]{0,120}navigation\.goBack\(\);[\s\S]{0,20}\};/.test(paywallSource),
  "Paywall navigation must use a dismissed/mounted safeGoBack helper"
);

assert(
  /const handleDismiss = \(\) => \{[\s\S]{0,80}if \(isLoading\) return;[\s\S]{0,120}safeGoBack\(\);/.test(paywallSource),
  "Paywall dismiss must no-op while purchase or restore is loading"
);

assert(
  /<Pressable[\s\S]{0,120}onPress=\{handleDismiss\}[\s\S]{0,120}disabled=\{isLoading\}[\s\S]{0,260}accessibilityState=\{\{ disabled: isLoading \}\}/.test(paywallSource),
  "Paywall close button must be disabled and accessible while loading"
);

assert(
  /const handlePurchase = async \(\) => \{[\s\S]{0,80}if \(isLoading\) return;[\s\S]*?const result = await purchasePackage\(selectedPkg, user\?\.id \|\| null\);[\s\S]{0,80}if \(!mountedRef\.current\) return;[\s\S]*?await refreshProStatus\(\);[\s\S]{0,80}if \(!mountedRef\.current\) return;[\s\S]*?safeGoBack\(\);/.test(paywallSource),
  "purchase completion must guard mounted state before state updates, refresh aftermath, and navigation"
);

assert(
  /const handleRestore = async \(\) => \{[\s\S]{0,80}if \(isLoading\) return;[\s\S]*?const result = await restorePurchases\(user\?\.id \|\| null\);[\s\S]{0,80}if \(!mountedRef\.current\) return;[\s\S]*?await refreshProStatus\(\);[\s\S]{0,80}if \(!mountedRef\.current\) return;[\s\S]*?safeGoBack\(\);/.test(paywallSource),
  "restore completion must guard mounted state before state updates, refresh aftermath, and navigation"
);

assert(
  /finally \{[\s\S]{0,80}if \(mountedRef\.current\) \{[\s\S]{0,160}setPurchasing\(false\);[\s\S]{0,20}\}/.test(paywallSource) &&
    /finally \{[\s\S]{0,80}if \(mountedRef\.current\) \{[\s\S]{0,80}setRestoring\(false\);[\s\S]{0,20}\}/.test(paywallSource),
  "purchase and restore loading state must reset only while mounted"
);

console.log("paywall inflight guard passed");
