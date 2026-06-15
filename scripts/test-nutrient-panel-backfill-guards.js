#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-nutrient-panels.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/040_update_product_nutrient_panel_rpc.sql"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`nutrient panel backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  migration.includes("CREATE OR REPLACE FUNCTION public.update_product_nutrient_panel") &&
    migration.includes("SECURITY DEFINER") &&
    migration.includes("SET search_path = public") &&
    migration.includes("p_cache_key TEXT") &&
    migration.includes("p_nutrient_panel JSONB") &&
    migration.includes("basis NOT IN ('as-fed', 'dry-matter')") &&
    migration.includes("nutrient_count < 2") &&
    migration.includes("field_value < 0 OR field_value > 100") &&
    migration.includes("field_value < 0 OR field_value > 10000") &&
    migration.includes("SET nutrient_panel = p_nutrient_panel") &&
    migration.includes("has_published_nutrients = TRUE") &&
    migration.includes("AND ingredient_count >= 5") &&
    migration.includes("AND expires_at > NOW()") &&
    migration.includes("RETURN FOUND"),
  "migration must provide a narrow validated nutrient-panel update RPC that preserves the ingredient contract"
);

assert(
  migration.includes("REVOKE ALL ON FUNCTION public.update_product_nutrient_panel(TEXT, JSONB)") &&
    migration.includes("FROM PUBLIC, anon, authenticated") &&
    migration.includes("GRANT EXECUTE ON FUNCTION public.update_product_nutrient_panel(TEXT, JSONB)") &&
    migration.includes("TO service_role"),
  "nutrient-panel update RPC must be service-role only"
);

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("NUTRIENT_PANEL_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("SUPABASE_SERVICE_KEY") &&
    source.includes("!NUTRIENT_PANEL_SERVICE_KEY && !allowRateLimited"),
  "nutrient panel runner must load env quietly and require service-role credentials for write runs"
);

assert(
  source.includes("const MAX_NUTRIENT_BACKFILL_CONCURRENCY = 8") &&
    source.includes("--concurrency=N") &&
    source.includes("const concurrencyArg = process.argv.find((arg) => arg.startsWith(\"--concurrency=\"))") &&
    source.includes("concurrency > MAX_NUTRIENT_BACKFILL_CONCURRENCY") &&
    source.includes("async function processSelectedTargets(selected)") &&
    source.includes("Promise.all(Array.from({ length: workerCount }, () => worker()))") &&
    source.includes("const launchAt = Math.max(nextLaunchAt, now)") &&
    source.includes("nextLaunchAt = launchAt + delayMs") &&
    source.includes("await waitForLaunchSlot();\n      if (stopRequested) break;"),
  "nutrient panel runner must support capped concurrent workers with globally paced launches"
);

assert(
  source.includes("function normalizePanelResult(rawPanel, sourceUrl)") &&
    source.includes("function normalizeEntryResult(entry)") &&
    source.includes("[\"as-fed\", \"dry-matter\"].includes(basis)") &&
    source.includes("reason: \"missing_nutrient_panel\"") &&
    source.includes("reason: \"invalid_or_missing_basis\"") &&
    source.includes("reason: `invalid_percentage_${field}`") &&
    source.includes("reason: `invalid_calorie_${field}`") &&
    source.includes("reason: \"nutrient_panel_too_sparse\"") &&
    source.includes("function cleanUrl(value)") &&
    source.includes("/^https?:\\/\\//i.test(trimmed)") &&
    source.includes("function summarizeTargets(targets)") &&
    source.includes("function exportTargets(targets, metadata)") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("cacheKey: target.cacheKey") &&
    source.includes("productName: target.productName || \"\"") &&
    source.includes("brand: target.brand || \"\"") &&
    source.includes("nutrientPanel: target.nutrientPanel") &&
    source.includes("--export-targets=path.json") &&
    source.includes("Target export:") &&
    source.includes("Eligible by nutrient basis:") &&
    !source.includes("ingredients: entry.ingredients") &&
    !source.includes("ingredientText: entry.ingredient_text"),
  "nutrient panel runner must validate redacted nutrient-panel input, export normalized batch targets, and avoid raw ingredient payloads"
);

assert(
  source.includes("Invalid reason summary:") &&
    source.includes("duplicateValidEntries") &&
    source.includes("invalidReasons") &&
    source.includes("EMPTY_NUTRIENT_TARGET_HINT") &&
    source.includes("No validated nutrient panels were selected") &&
    source.includes("if (selected.length === 0)") &&
    source.includes("process.exit(1)"),
  "nutrient panel runner must explain skipped inputs and fail closed on empty write runs"
);

assert(
  source.includes("/rest/v1/rpc/update_product_nutrient_panel") &&
    source.includes("p_cache_key: target.cacheKey") &&
    source.includes("p_nutrient_panel: target.nutrientPanel") &&
    source.includes("AbortSignal.timeout(30_000)") &&
    source.includes("getProductNutrientRow") &&
    source.includes("has_published_nutrients,nutrient_panel") &&
    source.includes("panelMatches(target.nutrientPanel, row.nutrient_panel)") &&
    source.includes("published_nutrients_ready") &&
    source.includes("if (failed > 0 || unverified > 0) process.exit(1)"),
  "nutrient panel runner must write through the RPC, verify readback, and fail nonzero for unverified writes"
);

assert(
  source.includes("const FATAL_NUTRIENT_HTTP_STATUS = new Set([401, 403, 429, 503])") &&
    source.includes("function fatalNutrientFailureReason(result)") &&
    source.includes("return \"nutrient_auth\"") &&
    source.includes("return \"nutrient_rate_limited\"") &&
    source.includes("return \"nutrient_unavailable\"") &&
    source.includes("status: fatalReason ? \"fatal_failed\" : \"failed\"") &&
    source.includes("fatal_reason: fatalReason || undefined") &&
    source.includes("let stopRequested = false") &&
    source.includes("while (!stopRequested)") &&
    source.includes("stopRequested = true;"),
  "nutrient panel runner must stop launching writes after fatal auth, rate-limit, or availability failures"
);

assert(
  source.includes("loadVerifiedReportKeys") &&
    source.includes("nutrient_panel_start") &&
    source.includes("nutrient_panel_result") &&
    source.includes("nutrient_panel_done") &&
    source.includes("status === \"verified_saved\"") &&
    source.includes("concurrency,") &&
    source.includes("delay_ms: delayMs"),
  "nutrient panel runner must write resumable JSONL audit reports"
);

assert(
  packageJson.includes('"backfill:nutrients": "node scripts/backfill-nutrient-panels.js"') &&
    packageJson.includes('"test:nutrient-panel-backfill": "node scripts/test-nutrient-panel-backfill-guards.js"') &&
    packageJson.includes("npm run test:nutrient-panel-backfill"),
  "nutrient panel backfill script and guard must be wired into package scripts and test:guards"
);

console.log("nutrient panel backfill guard passed");
