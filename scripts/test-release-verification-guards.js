#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const runbook = fs.readFileSync(path.join(root, "docs/release-verification.md"), "utf8");
const analyzeEdge = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`release verification guard failed: ${message}`);
    process.exit(1);
  }
}

for (const heading of [
  "## Runtime Schema Contract",
  "## User OCR Catalog Ingestion",
  "## RevenueCat And App Store Sandbox",
  "## Completed Quota Accounting",
  "## Edge CORS Configuration",
  "## App Store Listing",
]) {
  assert(runbook.includes(heading), `runbook must include ${heading}`);
}

for (const requiredText of [
  '[ANALYZE_AUDIT]',
  'event: "user_ocr_catalog_ingestion"',
  'event: "completed_quota_accounting"',
  'serverQuotaAccounting: true',
  'reason: "client_opt_out"',
  "scan_history.analysis_payload",
  "log_product_event",
  "NOTIFY pgrst",
  "ALLOWED_CORS_ORIGINS",
  "June 8, 2026",
]) {
  assert(runbook.includes(requiredText), `runbook missing required verification text: ${requiredText}`);
}

assert(
  /logAuditEvent\("user_ocr_catalog_ingestion"[\s\S]{0,900}outcome: "saved"/.test(analyzeEdge) &&
    /logAuditEvent\("completed_quota_accounting"[\s\S]{0,900}outcome: "committed"/.test(analyzeEdge),
  "Edge audit markers must remain available for production verification"
);

assert(
  !/(userId|accountId):\s*user\.(id|email)/.test(analyzeEdge) &&
    !/(productName:\s*productName|cacheKey:\s*resolvedKey|ingredientText:\s*ingredientText)/.test(analyzeEdge),
  "verification audit markers must stay redacted"
);

assert(
  packageJson.includes('"test:release-verification": "node scripts/test-release-verification-guards.js"') &&
    packageJson.includes("npm run test:release-verification"),
  "release verification guard must be wired into package scripts"
);

console.log("release verification guard passed");
