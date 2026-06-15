#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/migrate-analysis-cache-species-keys.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(root, "scripts/analysis-cache-schema.js"), "utf8");
const aliasMigrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations/045_promote_safe_analysis_cache_aliases.sql"),
  "utf8"
);
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`analysis cache species migration guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("ANALYSIS_CACHE_MIGRATION_KEY") &&
    source.includes("ANALYZE_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("SUPABASE_SERVICE_KEY"),
  "migration runner must load env quietly and support service-role cache migration credentials"
);

assert(
  source.includes("!dryRun && !SERVICE_KEY") &&
    source.includes("Set ANALYSIS_CACHE_MIGRATION_KEY") &&
    source.includes("--dry-run") &&
    source.includes("--limit=N") &&
    source.includes("--batch-size=N") &&
    source.includes("--report=path.jsonl") &&
    source.includes("--resume-report") &&
    source.includes("--force") &&
    source.includes("--no-verify-writes"),
  "migration runner must be dry-run capable, bounded, resumable, and refuse writes without a service key"
);

assert(
  source.includes("require(\"./analysis-cache-schema\")") &&
    source.includes("CURRENT_ANALYSIS_SCHEMA_VERSION") &&
    source.includes("schemaValidAnalysis") &&
    schemaSource.includes("CURRENT_ANALYSIS_SCHEMA_VERSION = 2") &&
    schemaSource.includes("function schemaValidAnalysis(analysis") &&
    schemaSource.includes("analysis.ingredients.length < 3") &&
    schemaSource.includes("requirePetType && analysis.petType !== \"dog\" && analysis.petType !== \"cat\"") &&
    schemaSource.includes("analysis.categories.length !== PET_CATEGORY_NAMES_V2.length") &&
    schemaSource.includes("analysis.nutritionAnalysis") &&
    schemaSource.includes("analysis.nutrientDataCompleteness") &&
    schemaSource.includes("analysis.recallSeverity") &&
    schemaSource.includes("analysis.testingTransparency") &&
    source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("analysisCacheBaseKeys") &&
    source.includes("analysisCacheKeyForPetType"),
  "migration runner must only promote app-compatible current-schema pet-food analysis rows into species-specific keys"
);

assert(
  source.includes("getProductRows") &&
    source.includes("product_data?select=") &&
    source.includes("ingredient_count=gte.5") &&
    source.includes("expires_at=gt.") &&
    source.includes("getFreshAnalysisRows") &&
    source.includes("analysis_cache?select=") &&
    source.includes("cache_key,lookup_type,analysis,data_source,opff_data,expires_at"),
  "migration runner must compare analysis-ready product rows with fresh analysis cache rows"
);

assert(
    source.includes("function selectCandidates(productRows, analysisRows, reportVerifiedKeys)") &&
    source.includes("const productByAliasKey = new Map()") &&
    source.includes("const ambiguousAliasKeys = new Set()") &&
    source.includes("for (const aliasKey of analysisCacheBaseKeys(product))") &&
    source.includes("ambiguousAliasKeys.add(aliasKey)") &&
    source.includes("productByAliasKey.delete(aliasKey)") &&
    source.includes("if (!sourceKey || /__(dog|cat)$/.test(sourceKey)) continue;") &&
    source.includes("if (ambiguousAliasKeys.has(sourceKey))") &&
    source.includes("const product = productsByKey.get(sourceKey) || productByAliasKey.get(sourceKey)") &&
    source.includes("const petType = source.analysis.petType") &&
    source.includes("const targetKey = analysisCacheKeyForPetType(product.cache_key, petType)") &&
    source.includes("if (!force && analysisByKey.has(targetKey))") &&
    source.includes("if (reportVerifiedKeys.has(targetKey))") &&
    source.includes('matchKey: sourceKey === product.cache_key ? "cache_key" : "app_visible_alias"'),
  "migration runner must promote validated exact or unique app-visible legacy alias keys to the analysis-stamped species target and avoid ambiguous aliases, existing targets, and resumed targets unless forced"
);

assert(
  source.includes("function summarizeMatchKeys(candidates)") &&
    source.includes("const eligibleMatchKeyCounts = summarizeMatchKeys(candidates)") &&
    source.includes("const selectedMatchKeyCounts = summarizeMatchKeys(selected)") &&
    source.includes("Eligible match keys:") &&
    source.includes("Selected match keys:") &&
    source.includes("selected_match_key_counts: selectedMatchKeyCounts") &&
    source.includes("eligible_match_key_counts: eligibleMatchKeyCounts"),
  "migration runner must summarize exact-vs-alias candidate counts in console and resumable JSONL run reports"
);

assert(
  source.includes("function migrationRow(candidate)") &&
    source.includes("cache_key: candidate.targetKey") &&
    source.includes("lookup_type: \"name\"") &&
    source.includes("analysis: candidate.source.analysis") &&
    source.includes("opff_data: candidate.source.opff_data || null") &&
    source.includes("expires_at: candidate.source.expires_at"),
  "migration runner must preserve analysis/opff payload and source expiry while writing name lookup species targets"
);

assert(
  source.includes("async function upsertRows(rows)") &&
    source.includes("analysis_cache?on_conflict=cache_key") &&
    source.includes("Prefer: \"resolution=merge-duplicates\"") &&
    source.includes("async function verifyCandidate(candidate)") &&
    source.includes("row.analysis.petType === candidate.petType") &&
    source.includes("schema_valid_pet_match") &&
    source.includes("if (result.failed > 0 || result.unverified > 0) process.exit(1)"),
  "migration runner must upsert by cache_key, verify pet-matched schema-valid targets, and fail nonzero for bad production writes"
);

assert(
  source.includes("loadVerifiedReportKeys") &&
    source.includes("analysis_cache_species_migration") &&
    source.includes("status === \"verified_migrated\"") &&
    source.includes("target_cache_key") &&
    source.includes("match_key: candidate.matchKey") &&
    source.includes("analysis_cache_species_migration_start") &&
    source.includes("analysis_cache_species_migration_done"),
  "migration runner must produce resumable JSONL reports keyed by verified target cache keys"
);

assert(
  aliasMigrationSource.includes("WITH valid_cache AS") &&
    aliasMigrationSource.includes("lookup_type IN ('name', 'barcode')") &&
    aliasMigrationSource.includes("(analysis->>'schemaVersion')::numeric >= 2") &&
    aliasMigrationSource.includes("lower(coalesce(analysis->>'petType', '')) IN ('dog', 'cat')") &&
    aliasMigrationSource.includes("product_targets AS") &&
    aliasMigrationSource.includes("coalesce(array_length(ingredients, 1), 0) >= 5") &&
    aliasMigrationSource.includes("public.normalize_product_catalog_name(coalesce(nullif(hidden.opff_data->>'productName', ''), hidden.analysis->>'productName'))") &&
    aliasMigrationSource.includes("unique_matches AS") &&
    aliasMigrationSource.includes("other.source_cache_key = candidate.source_cache_key") &&
    aliasMigrationSource.includes("target.cache_key || '__' || target.pet_type AS target_cache_key") &&
    aliasMigrationSource.includes("WHERE NOT EXISTS (") &&
    aliasMigrationSource.includes("existing.cache_key = unique_matches.target_cache_key") &&
    aliasMigrationSource.includes("ON CONFLICT (cache_key) DO NOTHING"),
  "safe alias migration must only copy unique normalized, current-schema, pet-compatible cache rows into missing product_data species keys without overwriting existing cache"
);

assert(
  packageJson.includes('"migrate:analysis-cache-species": "node scripts/migrate-analysis-cache-species-keys.js"') &&
    packageJson.includes('"test:analysis-cache-species-migration": "node scripts/test-analysis-cache-species-migration-guards.js"') &&
    packageJson.includes("npm run test:analysis-cache-species-migration"),
  "analysis cache species migration script and guard must be wired into package scripts and test:guards"
);

console.log("analysis cache species migration guard passed");
