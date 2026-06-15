#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const legalSource = fs.readFileSync(path.join(root, "legal.js"), "utf8");
const publicPrivacy = fs.readFileSync(path.join(root, "docs/privacy.html"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`history photo privacy guard failed: ${message}`);
    process.exit(1);
  }
}

const saveHistoryStart = analysisSource.indexOf("function _saveHistory");
const saveHistoryBlock = analysisSource.slice(saveHistoryStart);

assert(
  saveHistoryBlock.includes("photoUri: null") &&
    !saveHistoryBlock.includes("photoUri: state.uri"),
  "completed history entries must not persist original local scan photo URIs"
);

assert(
  /function toSupabaseRow\(entry, userId\)[\s\S]{0,420}photo_uri:\s*null/.test(historySource) &&
    !/photo_uri:\s*entry\.photoUri/.test(historySource),
  "Supabase history rows must never sync local camera file URIs"
);

const fromSupabaseStart = historySource.indexOf("function fromSupabaseRow(row)");
const fromSupabaseEnd = historySource.indexOf("// --- Public API ---", fromSupabaseStart);
const fromSupabaseBlock = historySource.slice(fromSupabaseStart, fromSupabaseEnd);
assert(
  fromSupabaseStart !== -1 &&
    fromSupabaseEnd !== -1 &&
    fromSupabaseBlock.includes("photoUri: null") &&
    !fromSupabaseBlock.includes("photoUri: row.photo_uri"),
  "remote history reads must not expose obsolete synced photo_uri values back to the UI"
);

assert(
  legalSource.includes("not intentionally stored after processing or saved in scan history") &&
    legalSource.includes("not the original scan photos") &&
    publicPrivacy.includes("not intentionally stored after processing or saved in scan history") &&
    publicPrivacy.includes("not the original scan photos"),
  "privacy copy must match the no-scan-photo-history retention boundary"
);

assert(
  packageJson.includes('"test:history-photo-privacy": "node scripts/test-history-photo-privacy-guards.js"') &&
    packageJson.includes("npm run test:history-photo-privacy"),
  "history photo privacy guard must be wired into package scripts"
);

console.log("history photo privacy guard passed");
