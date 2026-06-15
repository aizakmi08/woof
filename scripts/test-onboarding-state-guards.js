#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "App.js"), "utf8");
const onboardingSource = fs.readFileSync(path.join(root, "screens/OnboardingScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`onboarding state guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  !appSource.includes("AsyncStorage.removeItem(ONBOARDING_KEY)"),
  "App must not erase completed onboarding during replay or crash recovery"
);

assert(
  /DeviceEventEmitter\.addListener\("@woof\/replay-onboarding"[\s\S]{0,120}setShowOnboarding\(true\)/.test(
    appSource
  ),
  "replay event should show onboarding without mutating completion storage"
);

assert(
  (onboardingSource.match(/AsyncStorage\.setItem\(ONBOARDING_KEY, "true"\)/g) || []).length >= 2,
  "skip and final completion must still persist completed onboarding"
);

assert(
  packageJson.includes('"test:onboarding-state": "node scripts/test-onboarding-state-guards.js"') &&
    packageJson.includes("npm run test:onboarding-state"),
  "onboarding state guard must be wired into package scripts"
);

console.log("onboarding state guard passed");
