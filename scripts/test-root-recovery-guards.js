#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "App.js"), "utf8");
const themeSource = fs.readFileSync(path.join(root, "theme.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`root recovery guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  !appSource.includes("Colors.bg"),
  "root ErrorBoundary must not reference missing Colors.bg token"
);

assert(
  appSource.includes("backgroundColor: Colors.background") &&
    appSource.includes("color: Colors.buttonText"),
  "root ErrorBoundary fallback must use real readable color tokens"
);

const retryStart = appSource.indexOf("handleRetry = () =>");
const retryEnd = appSource.indexOf("render() {", retryStart);
assert(retryStart !== -1 && retryEnd !== -1, "root ErrorBoundary retry handler must be present");

const retryBlock = appSource.slice(retryStart, retryEnd);

assert(
  !retryBlock.includes("ONBOARDING_KEY") && !retryBlock.includes("@woof_onboarding_complete"),
  "root recovery must not clear or mutate completed onboarding state"
);

assert(
  retryBlock.includes('AsyncStorage.removeItem("@woof_theme_preference")') &&
    retryBlock.includes("recover from corrupted local state without losing completed onboarding"),
  "root recovery should limit reset behavior to non-critical local preferences"
);

assert(
  /background:\s*"#[0-9A-Fa-f]{6}"/.test(themeSource) &&
    /buttonText:\s*"#[0-9A-Fa-f]{6}"/.test(themeSource),
  "theme must define the tokens used by root recovery"
);

console.log("root recovery guard passed");
