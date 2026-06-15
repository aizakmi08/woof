#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const auditSource = fs.readFileSync(path.join(root, "scripts/audit-product-catalog.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(root, "scripts/analysis-cache-schema.js"), "utf8");
const catalogPetTypeSource = fs.readFileSync(path.join(root, "scripts/catalog-pet-type.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const analysisCacheMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/039_public_read_analysis_cache.sql"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`product catalog audit guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  auditSource.includes("DEFAULT_MIN_ROWS = 12_000") &&
    auditSource.includes("DEFAULT_MIN_READY_ROWS = 10_000") &&
    auditSource.includes("PRODUCT_CATALOG_MIN_ROWS") &&
    auditSource.includes("PRODUCT_CATALOG_MIN_READY_ROWS") &&
    auditSource.includes("PRODUCT_CATALOG_MAX_DIRTY_DISPLAY_ROWS") &&
    auditSource.includes("DEFAULT_MAX_NON_PRODUCT_ROWS = 0") &&
    auditSource.includes("PRODUCT_CATALOG_MAX_NON_PRODUCT_ROWS") &&
    auditSource.includes("PRODUCT_CATALOG_MIN_ANALYSIS_CACHE_ROWS") &&
    auditSource.includes("DEFAULT_MIN_PUBLISHED_NUTRIENT_ROWS = 500") &&
    auditSource.includes("PRODUCT_CATALOG_MIN_NUTRIENT_ROWS") &&
    auditSource.includes("CURRENT_ANALYSIS_SCHEMA_VERSION") &&
    schemaSource.includes("CURRENT_ANALYSIS_SCHEMA_VERSION = 2"),
  "catalog audit must encode the 12k row target and configurable analysis-ready/display/cache/nutrient thresholds"
);

assert(
  auditSource.includes("PRODUCT_CATALOG_DB_URL") &&
    auditSource.includes("SUPABASE_DB_URL") &&
    auditSource.includes("DATABASE_URL") &&
    auditSource.includes("DEFAULT_LOCAL_DB_URL") &&
    auditSource.includes("SUPABASE_URL") &&
    auditSource.includes("SUPABASE_ANON_KEY") &&
    auditSource.includes("PRODUCT_CATALOG_SERVICE_KEY") &&
    auditSource.includes("ANALYSIS_CACHE_AUDIT_KEY") &&
    auditSource.includes("SUPABASE_SERVICE_ROLE_KEY"),
  "catalog audit must support explicit Postgres URLs, app Supabase REST configuration, and service-key cache verification"
);

for (const token of [
  "fetchRestRows",
  "summarizeRows",
  "mode: \"supabase_rest\"",
  "mode: \"postgres\"",
  "REST_PAGE_SIZE",
  "totalRows",
  "analysisReadyRows",
  "shortIngredientRows",
  "expiredRows",
  "publishedNutrientRows",
  "dirtyDisplayRows",
  "nonProductRows",
  "nonProductExamples",
  "analysisCacheRows",
  "freshAnalysisCacheRows",
  "rawFreshAnalysisCacheRows",
  "schemaValidFreshAnalysisCacheRows",
  "appVisibleAnalysisCacheRows",
  "publishedNutrientCoveragePercent",
  "cacheCoverageVerified",
  "cacheCoverageMode",
  "freshAnalysisCacheCoveragePercent",
  "duplicateNamePercent",
  "distinctCacheKeys !== metrics.totalRows",
]) {
  assert(auditSource.includes(token), `catalog audit must measure ${token}`);
}

assert(
  auditSource.includes("coalesce(array_length(ingredients, 1), 0) >= 5") &&
    auditSource.includes("ingredientCount >= 5") &&
    auditSource.includes("dirtyDisplayPattern") &&
    auditSource.includes("function isLikelyNonProductCatalogRow(row)") &&
    auditSource.includes("function normalizeAuditName(value)") &&
    auditSource.includes("ingredients? (?:amp |and )?nutritional value") &&
    auditSource.includes("ingredients? guide") &&
    auditSource.includes("(?:dog|cat|pet) (?:food|treat) trends?") &&
    auditSource.includes("treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables") &&
    auditSource.includes("\\bsamples?\\b") &&
    auditSource.includes("\\b(?:pack|variety|bundle)\\b") &&
    auditSource.includes("\\\\m(treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)\\\\M") &&
    auditSource.includes("\\\\msamples?\\\\M") &&
    auditSource.includes("\\\\m(pack|variety|bundle)\\\\M") &&
    auditSource.includes("non-product catalog rows") &&
    auditSource.includes("Likely non-product catalog rows") &&
    auditSource.includes("dirty display rows") &&
    auditSource.includes("^\\s*\\|+") &&
    auditSource.includes("\\(\\s*$") &&
    auditSource.includes("&#x?[0-9a-f]+;") &&
    auditSource.includes("restCount") &&
    auditSource.includes("analysis_cache?select=cache_key") &&
    auditSource.includes("require(\"./analysis-cache-schema\")") &&
    auditSource.includes("fetchFreshRestAnalysisCacheRows") &&
    auditSource.includes("schemaValidAnalysis") &&
    schemaSource.includes("PET_CATEGORY_NAMES_V2") &&
    schemaSource.includes("analysis.categories.length !== PET_CATEGORY_NAMES_V2.length") &&
    schemaSource.includes("analysis.nutritionAnalysis") &&
    schemaSource.includes("analysis.nutrientDataCompleteness") &&
    schemaSource.includes("analysis.recallSeverity") &&
    schemaSource.includes("analysis.testingTransparency") &&
    auditSource.includes("cachedAnalysisMatchesPetType") &&
    auditSource.includes("appVisibleAnalysisCoverage") &&
    auditSource.includes("require(\"./catalog-pet-type\")") &&
    auditSource.includes("inferPetTypes") &&
    auditSource.includes("inferPrimaryPetType") &&
    auditSource.includes("analysisCacheBaseKeys") &&
    auditSource.includes("analysisCacheKeyForPetType") &&
    auditSource.includes("analysisCacheKey(row, petType)") &&
    auditSource.includes("function appVisibleAnalysisCandidateKeys(row, petType)") &&
    auditSource.includes("analysisCacheBaseKeys(row)") &&
    auditSource.includes("const targetPetTypes = inferPetTypes(row, { includeAmbiguous: true })") &&
    auditSource.includes("const coveredTargets = targetPetTypes.every((petType) =>") &&
    auditSource.includes("const candidateKeys = appVisibleAnalysisCandidateKeys(row, petType)") &&
    auditSource.includes("cachedAnalysisMatchesPetType(freshAnalysisByKey.get(key), petType)") &&
    auditSource.includes("fresh analysis cache rows") &&
    auditSource.includes("analysis cache coverage is not verified") &&
    auditSource.includes("published nutrient rows") &&
    auditSource.includes("minPublishedNutrientRows") &&
    auditSource.includes('cacheCoverageMode = restServiceKey ? "service_role" : "app_visible_rest"') &&
    auditSource.includes("cache verified") &&
    auditSource.includes("expires_at > now()") &&
    auditSource.includes("GROUP BY source") &&
    auditSource.includes("HAVING count(*) > 1"),
  "catalog audit must measure analysis-ready rows, source mix, and duplicate product names in SQL and REST modes"
);

assert(
    auditSource.includes("function analysisCacheKey(row, petType)") &&
    auditSource.includes("return analysisCacheKeyForPetType(cacheKey, petType);") &&
    catalogPetTypeSource.includes("function normalizeAnalysisBaseKey(value)") &&
    catalogPetTypeSource.includes("function analysisBaseKeySpellingVariants(cacheKey)") &&
    catalogPetTypeSource.includes("function analysisBaseKeyVariants(...values)") &&
    catalogPetTypeSource.includes("function analysisCacheBaseKeys(row)") &&
    catalogPetTypeSource.includes("analysisBaseKeyVariants(`${brand} ${productName}`)") &&
    auditSource.includes("function validFreshAnalysisByKey(rows)") &&
    auditSource.includes("schemaValidFreshAnalysisCacheRows") &&
    auditSource.includes("const schemaValidFreshAnalysisCacheRows = freshAnalysisByKey.size") &&
    auditSource.includes("function loadSqlCoverageRows()") &&
    auditSource.includes("function loadSqlFreshAnalysisCacheRows()") &&
    auditSource.includes("'ingredient_count', coalesce(array_length(ingredients, 1), 0)") &&
    auditSource.includes("const sqlCoverageRows = loadSqlCoverageRows()") &&
    auditSource.includes("const freshAnalysisRows = loadSqlFreshAnalysisCacheRows()") &&
    auditSource.includes("const rawFreshAnalysisCacheRows = freshAnalysisRows.length") &&
    auditSource.includes("freshAnalysisCacheRows = appVisibleAnalysisCoverage(rows, freshAnalysisByKey)") &&
    auditSource.includes("freshAnalysisCacheRows = appVisibleAnalysisCoverage(sqlCoverageRows, freshAnalysisByKey)") &&
    !auditSource.includes("THEN cache_key || '__cat'") &&
    auditSource.includes("app-visible ready") &&
    auditSource.includes("raw fresh cache:"),
  "catalog audit cache target must count schema-valid app-visible per-product analysis aliases in REST and SQL modes, requiring all ambiguous-product species targets instead of raw cache rows"
);

assert(
  auditSource.includes("const exportNutrientTargetsArg = process.argv.find((arg) => arg.startsWith(\"--export-nutrient-targets=\"))") &&
    auditSource.includes("const exportNutrientResearchBatchesArg = process.argv.find((arg) => arg.startsWith(\"--export-nutrient-research-batches=\"))") &&
    auditSource.includes("NUTRIENT_TARGET_PRIORITY_DESCRIPTION = \"market_brand,source_trust,source_url,image,ingredient_count,pet_type_specificity,name\"") &&
    auditSource.includes("DEFAULT_NUTRIENT_RESEARCH_BATCH_SIZE = 25") &&
    auditSource.includes("DEFAULT_NUTRIENT_RESEARCH_BATCH_COUNT = 100") &&
    auditSource.includes("MARKET_BRAND_NUTRIENT_PRIORITY = new Map") &&
    auditSource.includes("[\"purina pro plan\", 0]") &&
    auditSource.includes("[\"hill's science diet\", 0]") &&
    auditSource.includes("[\"royal canin\", 0]") &&
    auditSource.includes("[\"blue buffalo\", 0]") &&
    auditSource.includes("[\"fancy feast\", 1]") &&
    auditSource.includes("[\"pedigree\", 1]") &&
    auditSource.includes("[\"wellness\", 2]") &&
    auditSource.includes("[\"open farm\", 3]") &&
    auditSource.includes("SOURCE_NUTRIENT_TARGET_PRIORITY = new Map") &&
    auditSource.includes("[\"brand\", 0]") &&
    auditSource.includes("[\"manufacturer\", 0]") &&
    auditSource.includes("[\"web_verified\", 1]") &&
    auditSource.includes("[\"amazon\", 3]") &&
    auditSource.includes("function nutrientTargetSourcePriority(source)") &&
    auditSource.includes("function normalizeNutrientMarketBrandText(value)") &&
    auditSource.includes("function nutrientTargetMarketBrandPriority(target)") &&
    auditSource.includes("function cleanNutrientTargetUrl(value)") &&
    auditSource.includes("!/^https?:\\/\\//i.test(trimmed)") &&
    auditSource.includes("return trimmed.slice(0, 500)") &&
    auditSource.includes("function nutrientTargetPriority(target)") &&
    auditSource.includes("marketBrandRank: nutrientTargetMarketBrandPriority(target)") &&
    auditSource.includes("priorityA.marketBrandRank - priorityB.marketBrandRank") &&
    auditSource.includes("hasSourceUrl: Boolean(target.sourceUrl)") &&
    auditSource.includes("Number(priorityB.hasSourceUrl) - Number(priorityA.hasSourceUrl)") &&
    auditSource.includes("function compareNutrientTargets(a, b)") &&
    auditSource.includes("function prioritizeNutrientTargets(targets)") &&
    auditSource.includes("function nutrientPanelResearchQueries(target)") &&
    auditSource.includes("function nutrientResearchBatchKey(target)") &&
    auditSource.includes("function buildNutrientResearchBatches(targets, batchSize, batchCount)") &&
    auditSource.includes("function exportNutrientResearchBatches(targets, metrics)") &&
    auditSource.includes("--nutrient-research-batch-size") &&
    auditSource.includes("--nutrient-research-batch-count") &&
    auditSource.includes('batchId: `nutrient_research_${String(index + 1).padStart(3, "0")}`') &&
    auditSource.includes("totalBatchTargets: batches.reduce((sum, batch) => sum + batch.targets.length, 0)") &&
    auditSource.includes("guaranteed analysis ${petType} food") &&
    auditSource.includes("calories protein fat fiber moisture") &&
    auditSource.includes("nutrient panel as fed dry matter") &&
    auditSource.includes("function buildNutrientTargets(rows)") &&
    auditSource.includes("return prioritizeNutrientTargets(rows") &&
    auditSource.includes("function exportNutrientTargets(rows, metrics)") &&
    auditSource.includes("missingPublishedNutrientRows: targets.length") &&
    auditSource.includes("selectionPriority: NUTRIENT_TARGET_PRIORITY_DESCRIPTION") &&
    auditSource.includes("summary: summarizeNutrientTargets(targets)") &&
    auditSource.includes("cacheKey: row.cache_key") &&
    auditSource.includes("productName: row.product_name") &&
    auditSource.includes("brand: row.brand || \"\"") &&
    auditSource.includes("petType: inferPrimaryPetType(row) || \"ambiguous\"") &&
    auditSource.includes("targetPetTypes: inferPetTypes(row, { includeAmbiguous: true })") &&
    auditSource.includes("ingredientCount: Number(row.ingredient_count || 0)") &&
    auditSource.includes("hasImage: Boolean(row.image_url)") &&
    auditSource.includes("imageUrl: cleanNutrientTargetUrl(row.image_url)") &&
    auditSource.includes("sourceUrl: cleanNutrientTargetUrl(row.source_url)") &&
    auditSource.includes("researchQueries: nutrientPanelResearchQueries(target)") &&
    auditSource.includes("withRemoteImage") &&
    auditSource.includes("withSourceUrl") &&
    auditSource.includes("priority: nutrientTargetPriority(target)") &&
    auditSource.includes("exportNutrientResearchBatches(targets, metrics)") &&
    auditSource.includes("exportNutrientTargets(lastFetchedRows, metrics)") &&
    !auditSource.includes("ingredients: row.ingredients") &&
    !auditSource.includes("ingredientText: row.ingredient_text") &&
    !auditSource.includes("imageUrl: row.image_url || \"\""),
  "catalog audit must export a prioritized redacted nutrient-panel target manifest without raw ingredient text or embedded image payloads"
);

assert(
  analysisCacheMigration.includes('DROP POLICY IF EXISTS "Authenticated users can read cache"') &&
    analysisCacheMigration.includes('CREATE POLICY "Anyone can read pet analysis cache"') &&
    analysisCacheMigration.includes("TO anon, authenticated") &&
    analysisCacheMigration.includes("lookup_type IN ('name', 'barcode')") &&
    analysisCacheMigration.includes("expires_at > NOW()"),
  "catalog cache coverage must reflect app-visible shared pet-food cache rows for both guest and signed-in users"
);

assert(
  auditSource.includes('require("dotenv").config({ quiet: true })') &&
    auditSource.includes("const warnOnly = process.argv.includes(\"--warn-only\")") &&
    auditSource.includes("process.exit(warnOnly ? 0 : 1)") &&
    auditSource.includes("if (failures.length > 0 && !warnOnly)"),
  "catalog audit must load env quietly, support warn-only local measurement, and strict release failure"
);

assert(
  packageJson.includes('"audit:catalog": "node scripts/audit-product-catalog.js --warn-only"') &&
    packageJson.includes('"check:catalog": "node scripts/audit-product-catalog.js"') &&
    packageJson.includes('"test:product-catalog-audit": "node scripts/test-product-catalog-audit-guards.js"') &&
    packageJson.includes("npm run test:product-catalog-audit"),
  "catalog audit scripts and guard must be wired into package scripts and test:guards"
);

console.log("product catalog audit guard passed");
