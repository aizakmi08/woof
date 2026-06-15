#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/precompute-analysis-cache.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(root, "scripts/analysis-cache-schema.js"), "utf8");
const catalogPetTypeSource = fs.readFileSync(path.join(root, "scripts/catalog-pet-type.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`analysis precompute guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("ANALYZE_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("SUPABASE_SERVICE_KEY"),
  "precompute runner must load env quietly and support service-role analyze credentials"
);

assert(
  source.includes("!ANALYZE_SERVICE_KEY && !allowRateLimited") &&
    source.includes("Set ANALYZE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("--allow-rate-limited"),
  "precompute runner must refuse broad anonymous analyze runs unless explicitly allowed"
);

assert(
    source.includes("getFreshAnalysisKeys") &&
    source.includes("schemaValidAnalysis") &&
    source.includes("require(\"./analysis-cache-schema\")") &&
    schemaSource.includes("CURRENT_ANALYSIS_SCHEMA_VERSION = 2") &&
    schemaSource.includes("PET_CATEGORY_NAMES_V2") &&
    schemaSource.includes("analysis.categories.length !== PET_CATEGORY_NAMES_V2.length") &&
    schemaSource.includes("analysis.nutritionAnalysis") &&
    schemaSource.includes("analysis.nutrientDataCompleteness") &&
    schemaSource.includes("analysis.recallSeverity") &&
    schemaSource.includes("analysis.testingTransparency") &&
    source.includes("verified: false") &&
    source.includes("verified: true") &&
    source.includes("analysis_cache?select=") &&
    source.includes("const token = ANALYZE_SERVICE_KEY || SUPABASE_ANON_KEY") &&
    source.includes('mode: ANALYZE_SERVICE_KEY ? "service_role_rest" : "app_visible_rest"') &&
    source.includes("getCachedAnalysis") &&
    source.includes("function postgrestQuotedValue(value)") &&
    source.includes("async function getCachedAnalysesByKeys(cacheKeys)") &&
    source.includes("const keyFilter = encodeURIComponent(`(${keys.map(postgrestQuotedValue).join(\",\")})`)") &&
    source.includes("cache_key=in.${keyFilter}") &&
    source.includes("analysis_cache batch verify") &&
    source.includes("return new Map(rows.map((row) => [row.cache_key, row]));") &&
    source.includes("verifyCacheWrite") &&
    source.includes("async function verifyCacheWrite(cacheKey, cacheAliases = [])") &&
    source.includes("const aliasKeys = [...new Set((cacheAliases || []).map((key) => String(key || \"\").trim()).filter(Boolean))]") &&
    source.includes("const expectedKeys = [...new Set([cacheKey, ...aliasKeys].filter(Boolean))]") &&
    source.includes("let rows = new Map()") &&
    source.includes("rows = await getCachedAnalysesByKeys(expectedKeys)") &&
    source.includes("const primaryValid = schemaValidAnalysis(rows.get(cacheKey)?.analysis)") &&
    source.includes("verifiedAliases.length === aliasKeys.length") &&
    source.includes('reason: primaryValid ? "missing_or_invalid_cache_alias" : "missing_or_invalid_cache_row"') &&
    source.includes('if (!ANALYZE_SERVICE_KEY) return { verified: false, reason: "missing_service_key" }') &&
    source.includes("loadVerifiedReportKeys") &&
    source.includes("expires_at=gt."),
  "precompute runner must skip app-visible fresh schema-valid analysis_cache entries during planning while keeping primary and alias write verification service-key gated"
);

assert(
  source.includes("getProductRows") &&
    source.includes("product_data?select=") &&
    source.includes("ingredient_count=gte.5") &&
    source.includes("order=cache_key.asc") &&
    !source.includes("order=product_name.asc") &&
    source.includes("expires_at=gt.") &&
    source.includes("cleanIngredients"),
  "precompute runner must source only analysis-ready, unexpired product_data rows using indexed cache-key paging"
);

assert(
  source.includes("function normalizeCompleteFoodCatalogName(value)") &&
    source.includes("function isLikelyNonCompleteFoodCatalogRow(row)") &&
    source.includes("function completeFoodRows(rows)") &&
    source.includes("treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables") &&
    source.includes("/\\bsamples?\\b/.test(name) && /\\b(?:pack|variety|bundle)\\b/.test(name)") &&
    source.includes("const filteredRows = completeFoodRows(rows)") &&
    source.includes("const excludedNonCompleteFoodRows = rows.length - filteredRows.length") &&
    source.includes("const inputMatchSummary = inputTargetMatchSummary(filteredRows, inputTargets)") &&
    source.includes("const eligible = prioritizePrecomputeTargets(filteredRows.flatMap((row)") &&
    source.includes("Complete-food product rows: ${filteredRows.length}") &&
    source.includes("Excluded non-complete-food rows: ${excludedNonCompleteFoodRows}") &&
    source.includes("sourceAnalysisReadyRows: rows.length") &&
    source.includes("analysisReadyRows: filteredRows.length") &&
    source.includes("excludedNonCompleteFoodRows"),
  "precompute runner must exclude non-complete-food catalog rows from input matching, target expansion, logs, and exported readiness metrics"
);

assert(
  source.includes("/functions/v1/analyze") &&
    source.includes("mode: \"verified\"") &&
    source.includes("stream: false") &&
    source.includes("cacheKey: analysisCacheKey(row, petType)") &&
    source.includes("lookupType: \"name\"") &&
    source.includes("const cacheAliases = appVisibleCacheAliases(row, petType)") &&
    source.includes("...(cacheAliases.length > 0 ? { cacheAliases } : {})") &&
    source.includes("serverQuotaAccounting: false") &&
    source.includes("opffProduct") &&
    source.includes("ingredientsText") &&
    source.includes("nutrientPanel") &&
    source.includes("sourceTrustLevel"),
  "precompute runner must call analyze with the verified-data payload, no user quota accounting, and bounded app-visible cache aliases"
);

assert(
  source.includes("--dry-run") &&
    source.includes("--limit=") &&
    source.includes("--concurrency=N") &&
    source.includes("--delay-ms=") &&
    source.includes("--max-failures=") &&
    source.includes("--verify-delay-ms=") &&
    source.includes("--input=a,b") &&
    source.includes("--input-only") &&
    source.includes("--report=") &&
    source.includes("--resume-report") &&
    source.includes("--export-eligible=path.json") &&
    source.includes("--demand-days=N") &&
    source.includes("--demand-input=a,b") &&
    source.includes("--no-demand-priority") &&
    source.includes("--source=") &&
    source.includes("--pet-type=") &&
    source.includes("--force") &&
    source.includes("--no-verify-writes") &&
    source.includes("Fresh schema-valid analysis cache rows:") &&
    source.includes("freshCache.mode") &&
    source.includes("freshCacheMode") &&
    source.includes("fresh_cache_mode") &&
    source.includes("AbortSignal.timeout(120_000)"),
  "precompute runner must support dry-runs, bounded/paced batches, demand priority, filters, forced refreshes, and request timeouts"
);

assert(
  source.includes("PRECOMPUTE_PRIORITY_DESCRIPTION = \"recent_demand,market_brand,source_trust,published_nutrients,image,ingredient_count,pet_type_specificity,name\"") &&
    source.includes("const MAX_DEMAND_EVENT_ROWS = 50_000") &&
    source.includes("const DEMAND_EVENT_WEIGHTS = new Map") &&
    source.includes("[\"analysis_completed\", 6]") &&
    source.includes("[\"search_result_tapped\", 4]") &&
    source.includes("const demandDaysArg = process.argv.find((arg) => arg.startsWith(\"--demand-days=\"))") &&
    source.includes("const demandInputArgs = process.argv.filter((arg) => arg.startsWith(\"--demand-input=\"))") &&
    source.includes("const demandPriorityEnabled = !process.argv.includes(\"--no-demand-priority\")") &&
    source.includes("function stableKeyHash(value)") &&
    source.includes("Math.imul(hash, 16777619)") &&
    source.includes("function demandInputEntryWeight(entry)") &&
    source.includes("function demandInputEntryCacheKeys(entry)") &&
    source.includes("function loadDemandInputHashScores()") &&
    source.includes("const inputFiles = demandInputArgs.flatMap((arg) => arg.split(\"=\")[1].split(\",\"))") &&
    source.includes("entry?.appVisibleAnalysisKeys") &&
    source.includes("entry?.cacheAliases") &&
    source.includes("const hash = stableKeyHash(key)") &&
    source.includes("mode: localDemand.rows > 0 ? \"local_demand_input\" : \"missing_service_key\"") &&
    source.includes("local_demand_input_plus_service_role_product_events") &&
    source.includes("local_demand_input_plus_unavailable_") &&
    source.includes("invalidLocalRows") &&
    source.includes("function demandPriorityRowLabel(demand)") &&
    source.includes("rows/events") &&
    source.includes("async function getProductDemandHashScores()") &&
    source.includes("product_events?select=") &&
    source.includes("metadata.analysisCacheKeyHash") &&
    source.includes("metadata.cacheKeyHash") &&
    source.includes("let productDemandHashScores = new Map()") &&
    source.includes("function demandScoreForTarget(target)") &&
    source.includes("stableKeyHash(target.cacheKey)") &&
    source.includes("stableKeyHash(target.row?.cache_key)") &&
    source.includes("priorityB.demandScore - priorityA.demandScore") &&
    source.includes("MARKET_BRAND_PRECOMPUTE_PRIORITY = new Map") &&
    source.includes("[\"purina pro plan\", 0]") &&
    source.includes("[\"hill's science diet\", 0]") &&
    source.includes("[\"royal canin\", 0]") &&
    source.includes("[\"blue buffalo\", 0]") &&
    source.includes("[\"fancy feast\", 1]") &&
    source.includes("[\"pedigree\", 1]") &&
    source.includes("[\"wellness\", 2]") &&
    source.includes("[\"taste of the wild\", 3]") &&
    source.includes("[\"open farm\", 3]") &&
    source.includes("function normalizeMarketBrandText(value)") &&
    source.includes("function precomputeMarketBrandPriority(row)") &&
    source.includes("marketBrandRank: precomputeMarketBrandPriority(row)") &&
    source.includes("priorityA.marketBrandRank - priorityB.marketBrandRank") &&
    source.includes("SOURCE_PRECOMPUTE_PRIORITY = new Map") &&
    source.includes("[\"brand\", 0]") &&
    source.includes("[\"manufacturer\", 0]") &&
    source.includes("[\"web_verified\", 1]") &&
    source.includes("[\"amazon\", 3]") &&
    source.includes("function precomputeSourcePriority(source)") &&
    source.includes("function precomputePriority(target)") &&
    source.includes("function comparePrecomputeTargets(a, b)") &&
    source.includes("function prioritizePrecomputeTargets(targets)") &&
    source.includes("priorityA.sourceRank - priorityB.sourceRank") &&
    source.includes("Number(priorityB.hasPublishedNutrients) - Number(priorityA.hasPublishedNutrients)") &&
    source.includes("priorityB.ingredientCount - priorityA.ingredientCount") &&
    source.includes("const eligible = prioritizePrecomputeTargets(filteredRows.flatMap((row)") &&
    source.includes("Selection priority: ${PRECOMPUTE_PRIORITY_DESCRIPTION}") &&
    source.includes("selectionPriority: PRECOMPUTE_PRIORITY_DESCRIPTION") &&
    source.includes("selection_priority: PRECOMPUTE_PRIORITY_DESCRIPTION"),
  "precompute runner must prioritize first batches toward recent hashed demand and common in-store brands, then higher-confidence, richer, app-visible catalog targets instead of arbitrary product-name order"
);

assert(
  source.includes("const inputArgs = process.argv.filter((arg) => arg.startsWith(\"--input=\"))") &&
    source.includes("const inputOnly = process.argv.includes(\"--input-only\")") &&
    source.includes('usage("--input-only requires --input=path.json.")') &&
    source.includes("inputArgs.length === 0") &&
    source.includes("function loadInputTargetKeys()") &&
    source.includes("const inputFiles = inputArgs.flatMap((arg) => arg.split(\"=\")[1].split(\",\"))") &&
    source.includes("function parseJsonInputEntries(text, file)") &&
    source.includes("function parseJsonlInputEntries(text, file)") &&
    source.includes("function loadInputEntries(file)") &&
    source.includes("function inputEntryProductKeys(entry)") &&
    source.includes("function inputEntryIsTarget(entry)") &&
    source.includes("event !== \"catalog_backfill_result\"") &&
    source.includes("entry?.status === \"verified_saved\" || entry?.status === \"accepted\"") &&
    source.includes("if (/\\.jsonl$/i.test(file)) return parseJsonlInputEntries(text, file)") &&
    source.includes("if (trimmed.includes(\"\\n\")) return parseJsonlInputEntries(text, file)") &&
    source.includes("const entries = loadInputEntries(file)") &&
    source.includes("const stat = { path: file, entries: entries.length, valid: 0, invalid: 0, duplicate: 0, skipped: 0 }") &&
    source.includes("skipped++") &&
    source.includes("if (keys.has(key)) continue") &&
    source.includes("const productKeys = new Set()") &&
    source.includes("const expandableProductKeys = String(entry?.event || \"\").trim() === \"catalog_backfill_result\"") &&
    source.includes("if (productKeys.has(key)) continue") &&
    source.includes("productKeys.add(key)") &&
    source.includes("duplicate++") &&
    source.includes("inputs.push(stat)") &&
    source.includes('usage("--input JSON must be an array or an object with a targets array.")') &&
    source.includes("function inputEntryProductKey(entry)") &&
    source.includes("entry?.saved_cache_key") &&
    source.includes("entry?.target_cache_key") &&
    source.includes("entry?.cache_key") &&
    source.includes("function inputEntryAnalysisKey(entry)") &&
    source.includes("entry?.analysisCacheKey") &&
    source.includes("entry?.analysis_cache_key") &&
    source.includes("event !== \"catalog_backfill_result\" ? entry?.cache_key : \"\"") &&
    source.includes("entry?.attempted_pet_types") &&
    source.includes("entry?.productCacheKey") &&
    source.includes("entry?.product_cache_key") &&
    source.includes("/__(dog|cat)$/.test(legacyKey)") &&
    source.includes("analysisCacheKeyForPetType(productKey, petType)") &&
    source.includes("const inputTargets = loadInputTargetKeys()") &&
    source.includes("function inputTargetMatchSummary(rows, inputTargets)") &&
    source.includes("function inputTargetAllows(target, inputTargets)") &&
    source.includes("selectableTargets(row, { keys: new Set(), legacyPetTypesByKey: new Map() }, { includeCached: true })") &&
    source.includes("inputTargets.productKeys.has(target.row.cache_key)") &&
    source.includes("const inputMatchSummary = inputTargetMatchSummary(filteredRows, inputTargets)") &&
    source.includes("if (!inputTargetAllows(target, inputTargets))") &&
    source.includes("Input target filter:") &&
    source.includes("product keys") &&
    source.includes("inputTargets.inputs.length") &&
    source.includes("Input target current-catalog matches:") &&
    source.includes("matched: inputMatchSummary.matched") &&
    source.includes("matchedProductKeys: inputMatchSummary.matchedProductKeys") &&
    source.includes("productKeys: inputTargets.productKeys.size") &&
    source.includes("skipped: inputTargets.skipped") &&
    source.includes("duplicate: inputTargets.duplicate") &&
    source.includes("inputs: inputTargets.inputs") &&
    source.includes("stale: inputMatchSummary.stale") &&
    source.includes("No valid --input-only targets match the current product catalog") &&
    source.includes("!dryRun && inputOnly && inputMatchSummary && inputMatchSummary.matched === 0") &&
    source.includes("inputTargetFilter") &&
    source.includes("input_target_filter"),
  "precompute runner must accept exported eligible manifests and catalog backfill JSONL reports as exact analysis-cache-key filters, validate current-catalog matches, and fail closed for stale input-only write runs while still reading current product_data ingredients"
);

assert(
  source.includes("const MAX_PRECOMPUTE_CONCURRENCY = 8") &&
    source.includes("const concurrencyArg = process.argv.find((arg) => arg.startsWith(\"--concurrency=\"))") &&
    source.includes("const concurrency = concurrencyArg ? Number(concurrencyArg.split(\"=\")[1]) : 1") &&
    source.includes("concurrency > MAX_PRECOMPUTE_CONCURRENCY") &&
    source.includes("--concurrency must be an integer between 1 and ${MAX_PRECOMPUTE_CONCURRENCY}") &&
    source.includes("async function processSelectedRows(selected)") &&
    source.includes("async function waitForLaunchSlot()") &&
    source.includes("const launchAt = Math.max(nextLaunchAt, now)") &&
    source.includes("nextLaunchAt = launchAt + delayMs") &&
    source.includes("await waitForLaunchSlot();\n      if (stopRequested) break;") &&
    source.includes("const workerCount = Math.min(concurrency, selected.length)") &&
    source.includes("Promise.all(Array.from({ length: workerCount }, () => worker()))") &&
    source.includes("Concurrency: ${dryRun ? 0 : concurrency}") &&
    source.includes("delay_ms: delayMs"),
  "precompute runner must support capped concurrent analyze workers with globally paced launches and report metadata"
);

assert(
  source.includes("const exportEligibleArg = process.argv.find((arg) => arg.startsWith(\"--export-eligible=\"))") &&
    source.includes("const exportEligiblePath = exportEligibleArg ? path.resolve(process.cwd(), exportEligibleArg.split(\"=\")[1]) : null") &&
    source.includes("function summarizeRows(rows)") &&
    source.includes("function summarizeTargets(targets)") &&
    source.includes("function targetScope(target)") &&
    source.includes("function summarizeTargetScopes(targets)") &&
    source.includes("function appVisibleAnalysisKeys(target)") &&
    source.includes("function appVisibleCacheAliases(row, petType)") &&
    source.includes("analysisCacheBaseKeys(row)") &&
    source.includes(".filter((key) => key && key !== primaryKey)") &&
    source.includes(")].slice(0, 3)") &&
    source.includes("function precomputeTarget(target)") &&
    source.includes("function exportEligibleRows(targets, metadata)") &&
    source.includes("summary: {") &&
    source.includes("byTargetPetType: summarizeTargets(targets)") &&
    source.includes("byTargetScope: summarizeTargetScopes(targets)") &&
    source.includes("targets: targets.map(precomputeTarget)") &&
    source.includes("Eligible by pet type:") &&
    source.includes("Eligible target pet types:") &&
    source.includes("Eligible target scope:") &&
    source.includes("Top eligible sources:") &&
  source.includes("exportEligibleRows(eligible, {"),
  "precompute runner must export an auditable eligible-cache manifest with source, pet-type, and target-scope summaries"
);

assert(
  source.includes("cacheKey: row.cache_key") &&
    source.includes("analysisCacheKey: target.cacheKey") &&
    source.includes("appVisibleAnalysisKeys: appVisibleAnalysisKeys(target)") &&
    source.includes("productName: row.product_name") &&
    source.includes("brand: row.brand || \"\"") &&
    source.includes("petType: target.petType") &&
    source.includes("targetScope: targetScope(target)") &&
    source.includes("ingredientCount: cleanIngredients(row).length") &&
    source.includes("priority: precomputePriority(target)") &&
    source.includes("recentDemandScore: demandScoreForTarget(target)") &&
    !source.includes("ingredientText: row.ingredient_text") &&
    !source.includes("ingredientsText: row.ingredient_text"),
  "precompute eligible manifest must include app-visible cache aliases and planning metadata without exporting raw ingredient text"
);

assert(
    source.includes("require(\"./catalog-pet-type\")") &&
    catalogPetTypeSource.includes("function analysisBaseKeySpellingVariants(cacheKey)") &&
    catalogPetTypeSource.includes("const variants = new Set([key])") &&
    catalogPetTypeSource.includes("for (const existing of [...variants])") &&
    catalogPetTypeSource.includes("if (variants.size >= 32) break;") &&
    catalogPetTypeSource.includes('[/grain free/g, "grainfree"]') &&
    catalogPetTypeSource.includes('[/raw mix/g, "rawmix"]') &&
    catalogPetTypeSource.includes("function analysisBaseKeyVariants(...values)") &&
    catalogPetTypeSource.includes("normalized.flatMap((key) => analysisBaseKeySpellingVariants(key))") &&
    catalogPetTypeSource.includes("...analysisBaseKeyVariants(productName)") &&
    catalogPetTypeSource.includes("analysisBaseKeyVariants(`${brand} ${productName}`)") &&
    catalogPetTypeSource.includes("analysisBaseKeySpellingVariants,") &&
    catalogPetTypeSource.includes("analysisBaseKeyVariants,") &&
    source.includes("inferPetTypes") &&
    source.includes("inferPrimaryPetType") &&
    source.includes("analysisCacheBaseKeys") &&
    source.includes("analysisCacheKeyForPetType") &&
    source.includes("function analysisCacheKey(row, petType)") &&
    source.includes("return analysisCacheKeyForPetType(cacheKey, petType);") &&
    source.includes("legacyPetTypesByKey") &&
    source.includes("function targetHasFreshAnalysis(row, petType, cacheKey, freshCache)") &&
    source.includes("freshCache.keys.has(cacheKey)") &&
    source.includes("analysisCacheBaseKeys(row).some((baseKey)") &&
    source.includes("freshCache.keys.has(analysisCacheKeyForPetType(baseKey, petType))") &&
    source.includes("freshCache.legacyPetTypesByKey?.get(baseKey)?.has(petType)") &&
    source.includes("function appVisibleCacheAliases(row, petType)") &&
    source.includes("const primaryKey = analysisCacheKey(row, petType)") &&
    source.includes(")].slice(0, 3);") &&
    source.includes("function selectableTargets(row, freshCache, options = {})") &&
    source.includes("inferPetTypes(row, { includeAmbiguous: true })") &&
    source.includes("targets.push({ row, petType, cacheKey })") &&
    source.includes("const { row, petType, cacheKey } = target") &&
    source.includes("const cacheAliases = appVisibleCacheAliases(row, petType)") &&
    source.includes("cache_aliases: cacheAliases") &&
    source.includes("const verification = await verifyCacheWrite(cacheKey, cacheAliases)") &&
    source.includes("verified_aliases: verification.verifiedAliases || 0") &&
    source.includes("expected_aliases: verification.expectedAliases || 0") &&
    source.includes("if (!options.includeCached && !force && targetHasFreshAnalysis(row, petType, cacheKey, freshCache))") &&
    source.includes("selectableTargets(row, freshCache)") &&
    source.includes("product_cache_key: row.cache_key") &&
    source.includes("if (reportVerifiedKeys.has(target.cacheKey))"),
  "precompute runner must write, verify, resume, and export app-aligned species-specific analysis cache targets, including bounded spelling aliases, bounded Edge cache aliases, both species for ambiguous products, and legacy speciesless app-visible cache rows"
);

assert(
  source.includes("Write verification:") &&
    source.includes("verified cached") &&
    source.includes("Stopping early: failed/unverified count reached --max-failures=") &&
    source.includes("if (failed > 0 || unverified > 0) process.exit(1)"),
  "precompute runner must verify cache writes, stop early on repeated failures, and fail nonzero for unverified production writes"
);

assert(
  source.includes("const FATAL_ANALYZE_HTTP_STATUS = new Set([401, 403, 429, 503])") &&
    source.includes("function fatalAnalyzeFailureReason(result)") &&
    source.includes('return "analyze_auth"') &&
    source.includes('return "analyze_quota_or_auth"') &&
    source.includes('return "analyze_rate_limited"') &&
    source.includes('return "analyze_unavailable"') &&
    source.includes('status: fatalReason ? "fatal_failed" : "failed"') &&
    source.includes("fatal_reason: fatalReason || undefined") &&
    source.includes("if (fatalReason) {") &&
    source.includes("stopRequested = true;"),
  "precompute runner must stop immediately and report fatal analyze auth/quota/rate-limit/service failures instead of burning through batch attempts"
);

assert(
  source.includes("appendReport") &&
    source.includes("fs.appendFileSync") &&
    source.includes("precompute_start") &&
    source.includes("precompute_result") &&
    source.includes("precompute_done") &&
    source.includes("concurrency,") &&
    source.includes("status === \"verified_cached\"") &&
    source.includes("[skip report-verified]"),
  "precompute runner must write resumable JSONL reports and only resume from verified cached rows"
);

assert(
  packageJson.includes('"precompute:analysis": "node scripts/precompute-analysis-cache.js"') &&
    packageJson.includes('"test:analysis-precompute": "node scripts/test-analysis-precompute-guards.js"') &&
    packageJson.includes("npm run test:analysis-precompute"),
  "analysis precompute script and guard must be wired into package scripts and test:guards"
);

console.log("analysis precompute guard passed");
