#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const edgeSource = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`human-food schema guard failed: ${message}`);
    process.exit(1);
  }
}

for (const field of ["summary", "explanation", "symptoms", "portions", "preparation", "disclaimer"]) {
  assert(
    analysisSource.includes(`missing ${field}`) &&
      edgeSource.includes(`obj.${field}`),
    `human-food ${field} must be required on client and edge`
  );
}

assert(
  analysisSource.includes("missing ageGuidance") &&
    edgeSource.includes("age.puppiesOrKittens") &&
    edgeSource.includes("age.adults") &&
    edgeSource.includes("age.seniors") &&
    edgeSource.includes("age.note"),
  "human-food age guidance must be required on client and edge"
);

assert(
  /analysis\.petType = petType;[\s\S]{0,120}_guardCompletedAnalysis\(state, tempId, analysis, "human_food"\)/.test(analysisSource),
  "client human-food completion must stamp requested petType before validation and persistence"
);

assert(
  /if \(analysis && mode === "human_food" && petType\) \{[\s\S]{0,80}analysis\.petType = petType;/.test(edgeSource),
  "edge must stamp requested petType onto human-food analysis before validation/cache"
);

assert(
  /mode === "human_food" && !isValid[\s\S]{0,140}Incomplete human-food safety response/.test(edgeSource),
  "non-streaming edge human-food schema failures must return a retryable error"
);

const writeToCacheStart = edgeSource.indexOf("async function writeToCache(");
const writeToCacheEnd = edgeSource.indexOf("// ── Main handler", writeToCacheStart);
const writeToCacheBody = edgeSource.slice(writeToCacheStart, writeToCacheEnd);
const humanFoodSkip = writeToCacheBody.indexOf('if (mode === "human_food")');
const sharedCacheWrite = writeToCacheBody.indexOf('.from("analysis_cache")');

assert(
  writeToCacheStart >= 0 &&
    humanFoodSkip >= 0 &&
    writeToCacheBody.includes("Skipping shared cache write for human_food") &&
    writeToCacheBody.slice(humanFoodSkip, sharedCacheWrite).includes("return;") &&
    humanFoodSkip < sharedCacheWrite,
  "human-food safety answers must not be written into shared analysis_cache"
);

assert(
  !edgeSource.includes("normalizeHumanFoodCacheKey"),
  "human-food shared cache key helper must not be reintroduced"
);

console.log("human-food schema guard passed");
