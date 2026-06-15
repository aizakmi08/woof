#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const componentsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/components.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`history retention guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  historySource.includes("const MAX_ENTRIES = 80") &&
    analysisSource.includes("const MAX_LOCAL_RESULTS = 240") &&
    analysisSource.includes("key-count based, not product-count based"),
  "local replayable result retention must allow about three alias keys per retained history row"
);

assert(
  /filtered\.slice\(0, MAX_LOCAL_RESULTS\)/.test(analysisSource) &&
    /filtered\.slice\(MAX_LOCAL_RESULTS\)/.test(analysisSource),
  "local result eviction must use the shared retention constant"
);

assert(
  !resultsSource.includes("Cached results expire after 7 days") &&
    !componentsSource.includes("Cached results expire after 7 days"),
  "history replay miss copy must not claim a stale 7-day policy"
);

assert(
  resultsSource.includes("Scan it again to refresh the analysis.") &&
    componentsSource.includes("Scan it again to refresh the analysis."),
  "history replay miss copy must offer a scan-again refresh path"
);

assert(
  resultsSource.includes("const HISTORY_RESULT_LOAD_TIMEOUT_MS = 10000") &&
    /const historyTimeout = setTimeout\(\(\) => \{[\s\S]{0,220}historyCacheController\.abort\(\);[\s\S]{0,180}This saved result is taking too long to load\. Scan it again to refresh the analysis\./.test(resultsSource) &&
    /finally \{[\s\S]{0,80}clearTimeout\(historyTimeout\);[\s\S]{0,20}\}/.test(resultsSource) &&
    /return \(\) => \{[\s\S]{0,80}clearTimeout\(historyTimeout\);[\s\S]{0,80}historyCacheController\.abort\(\);[\s\S]{0,20}\};/.test(resultsSource),
  "history replay cache loading must have a route-scoped hard timeout and cleanup instead of an infinite spinner"
);

assert(
  packageJson.includes('"test:history-retention": "node scripts/test-history-retention-guards.js"') &&
    packageJson.includes("npm run test:history-retention"),
  "history retention guard must be wired into package scripts"
);

console.log("history retention guard passed");
