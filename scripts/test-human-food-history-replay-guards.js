const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const migrationSource = [
  "027_human_food_history_payload.sql",
  "043_refresh_runtime_schema_contract.sql",
].map((file) => fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8")).join("\n");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`human-food history replay guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  migrationSource.includes("ADD COLUMN IF NOT EXISTS safety_level TEXT") &&
    migrationSource.includes("ADD COLUMN IF NOT EXISTS analysis_payload JSONB") &&
    migrationSource.includes("scan_history_safety_level_check"),
  "Supabase scan_history must store user-scoped human-food safety level and replay payload"
);

assert(
  migrationSource.includes("NOTIFY pgrst, 'reload schema'"),
  "runtime schema compatibility migration must request a PostgREST schema-cache reload for scan_history payload columns"
);

assert(
  /function toSupabaseRow\(entry, userId\)[\s\S]{0,520}safety_level:\s*entry\.safetyLevel \?\? entry\.analysisPayload\?\.safetyLevel \?\? null[\s\S]{0,140}analysis_payload:\s*entry\.scanMode === "human_food" \? entry\.analysisPayload \?\? null : null/.test(historySource),
  "history sync must write human-food safety metadata and payload to Supabase"
);

assert(
  /function fromSupabaseRow\(row\)[\s\S]{0,220}const analysisPayload[\s\S]{0,520}safetyLevel:\s*row\.safety_level \?\? analysisPayload\?\.safetyLevel \?\? null[\s\S]{0,80}analysisPayload/.test(historySource),
  "history reads must restore human-food safety metadata and replay payload"
);

const historyPayloadStart = analysisSource.indexOf("const humanFoodHistoryPayload = isHumanFood ? {");
const historyPayloadEnd = analysisSource.indexOf("} : null;", historyPayloadStart);
const historyPayloadBlock = analysisSource.slice(historyPayloadStart, historyPayloadEnd);
const requiredPayloadFields = [
  "foodName",
  "petType",
  "safetyLevel",
  "summary",
  "explanation",
  "symptoms",
  "portions",
  "preparation",
  "disclaimer",
  "toxicCompounds",
  "alternatives",
  "ageGuidance",
];
assert(
  historyPayloadStart !== -1 &&
    historyPayloadEnd !== -1 &&
    requiredPayloadFields.every((field) => historyPayloadBlock.includes(field)) &&
    analysisSource.includes("...(humanFoodHistoryPayload && { analysisPayload: humanFoodHistoryPayload })"),
  "human-food history entries must include a replayable validated analysis payload"
);

assert(
  /item\.scanMode === "human_food"[\s\S]{0,160}historyAnalysis:\s*item\.analysisPayload/.test(homeSource),
  "Home must pass human-food history payload into Results replay"
);

assert(
  /const \{[\s\S]{0,320}mode[\s\S]{0,80}base64[\s\S]{0,80}uri[\s\S]{0,80}cacheKey[\s\S]{0,320}historyAnalysis[\s\S]{0,80}\} = route\.params \|\| \{\};/.test(resultsSource) &&
    /scanMode === "human_food" && isReplayableHumanFoodHistoryPayload\(historyAnalysis, petType\)[\s\S]{0,180}setResult\(\{ \.\.\.historyAnalysis, petType: historyAnalysis\.petType \|\| petType \}\)/.test(resultsSource),
  "Results history mode must render the user-scoped human-food payload before cache fallback"
);

assert(
  packageJson.includes('"test:human-food-history-replay": "node scripts/test-human-food-history-replay-guards.js"') &&
    packageJson.includes("npm run test:human-food-history-replay"),
  "human-food history replay guard must be wired into package scripts"
);

console.log("human-food history replay guard passed");
