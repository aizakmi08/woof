#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(
  path.join(root, "services/analysisService.js"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`history ledger guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  !analysisSource.includes("recentHistorySaves"),
  "history saves must not be suppressed by product/cache key timestamps"
);

assert(
  !/Date\.now\(\) - lastSave < 60000/.test(analysisSource),
  "history saves must not skip repeated scans within a fixed time window"
);

assert(
  (() => {
    const body = analysisSource.slice(analysisSource.indexOf("function _saveHistory"));
    const historySavedCheck = body.indexOf("if (state.historySaved || state.historySaveQueued)");
    const queuedSet = body.indexOf("state.historySaveQueued = true;");
    const addHistory = body.indexOf("addHistoryEntry(entry)");
    const historySavedSet = body.indexOf("state.historySaved = true;");
    return historySavedCheck !== -1 &&
      queuedSet > historySavedCheck &&
      addHistory > queuedSet &&
      historySavedSet > addHistory;
  })(),
  "history saves may only dedupe the same analysis instance by queueing that state before deferred addHistoryEntry"
);

assert(
  /dateScanned: new Date\(\)\.toISOString\(\),[\s\S]{0,80}cacheKey,/.test(analysisSource),
  "each completed scan history entry must still get a fresh timestamp for the same cache key"
);

console.log("history ledger guard passed");
