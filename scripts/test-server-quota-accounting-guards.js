#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const analyzeEdge = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`server quota accounting guard failed: ${message}`);
    process.exit(1);
  }
}

for (const snippet of [
  "imageBase64: base64Image, serverQuotaAccounting: true",
  "opffProduct, serverQuotaAccounting: true",
  "foodName: input.foodName.trim(), petType, serverQuotaAccounting: true",
  "imageBase64: input, petType, serverQuotaAccounting: true",
]) {
  assert(
    claudeSource.includes(snippet),
    `primary analyze request must opt into server quota accounting: ${snippet}`
  );
}

assert(
  !/body: JSON\.stringify\(\{[\s\S]{0,120}mode: "identify"[\s\S]{0,180}serverQuotaAccounting/.test(claudeSource) &&
    !/mode: "ocr_ingredients"[\s\S]{0,180}serverQuotaAccounting/.test(claudeSource) &&
    !/mode: "ingredients_lookup"[\s\S]{0,180}serverQuotaAccounting/.test(claudeSource),
  "helper requests must not opt into completed-scan quota accounting"
);

assert(
  resultsSource.includes("await incrementHumanFoodCount()") &&
    resultsSource.includes("await incrementScanCount()"),
  "Results must still mirror delivered quota locally after a completed result"
);

assert(
  /Pre-call cache HIT:[\s\S]{0,260}await commitCompletedQuota\([\s\S]{0,260}return jsonResponse/.test(analyzeEdge),
  "schema-valid Edge pre-call cache hits must commit completed quota before returning to new clients"
);

assert(
  analyzeEdge.includes('logAuditEvent("completed_quota_accounting"') &&
    analyzeEdge.includes('outcome: "committed"') &&
    analyzeEdge.includes('reason: !serverQuotaAccounting') &&
    !/completed_quota_accounting[\s\S]{0,500}user\.id/.test(analyzeEdge),
  "completed quota accounting must emit redacted audit markers without user identifiers"
);

assert(
  /if \(isHumanFood\) \{[\s\S]{0,80}if \(!result\.foodName\) return;[\s\S]{0,80}\} else \{[\s\S]{0,80}if \(!result\.productName\) return;[\s\S]{0,120}const score = Number\(result\.overallScore\);[\s\S]{0,120}!Number\.isFinite\(score\) \|\| score < 1 \|\| score > 100[\s\S]{0,80}return;[\s\S]{0,120}setScanCounted\(true\)/.test(resultsSource),
  "Results must not mirror a delivered pet-food scan locally unless it has a valid overallScore"
);

assert(
  packageJson.includes('"test:server-quota-accounting": "node scripts/test-server-quota-accounting-guards.js"') &&
    packageJson.includes("npm run test:server-quota-accounting"),
  "server quota accounting guard must be wired into package scripts"
);

console.log("server quota accounting guard passed");
