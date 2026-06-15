#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const analysisCacheMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/039_public_read_analysis_cache.sql"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`cache prewarm guard failed: ${message}`);
    process.exit(1);
  }
}

const prefetchBody = cacheSource.slice(
  cacheSource.indexOf("export async function prefetchAnalyses"),
  cacheSource.indexOf("/**\n * Look up a cached analysis by cache key.")
);
const getCachedBody = cacheSource.slice(
  cacheSource.indexOf("export async function getCachedAnalysis"),
  cacheSource.indexOf("async function _getCachedAnalysisFromDb")
);
const dbCachedBody = cacheSource.slice(
  cacheSource.indexOf("async function _getCachedAnalysisFromDb"),
  cacheSource.indexOf("\n}", cacheSource.indexOf("async function _getCachedAnalysisFromDb")) + 2
);

assert(
  prefetchBody.includes("Cache positive, schema-valid hits only") &&
    prefetchBody.includes("if (!_isUsableCachedAnalysis(row.analysis))") &&
    !prefetchBody.includes("result: { hit: false }"),
  "prewarm must not store negative warm-cache entries"
);

assert(
  /const keys = \[\.\.\.new Set\([\s\S]{0,180}\.map\(\(k\) => k\.trim\(\)\)[\s\S]{0,80}\.filter\(Boolean\)[\s\S]{0,80}\)\];/.test(prefetchBody),
  "prewarm keys must be trimmed and deduplicated before querying analysis_cache"
);

assert(
  /request = _startQueryDeadline\("Analysis cache prewarm", \{[\s\S]{0,120}timeoutMs: ANALYSIS_CACHE_QUERY_TIMEOUT_MS/.test(prefetchBody) &&
    /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)[\s\S]{0,80}\.abortSignal\(request\.signal\)/.test(prefetchBody) &&
    cacheSource.includes("const _analysisPrewarmInflightKeys = new Set()") &&
    cacheSource.includes("const _analysisPrewarmInflightResults = new Map()") &&
    cacheSource.includes("_analysisPrewarmInflightKeys.clear();") &&
    cacheSource.includes("_analysisPrewarmInflightResults.clear();") &&
    prefetchBody.includes("!_analysisPrewarmInflightKeys.has(k)") &&
    prefetchBody.includes("fresh.forEach((key) => _analysisPrewarmInflightKeys.add(key));") &&
    prefetchBody.includes("const keyedPrewarmPromises = new Map();") &&
    prefetchBody.includes("_analysisPrewarmInflightResults.set(key, keyedPromise)") &&
    prefetchBody.includes("_analysisPrewarmInflightResults.get(key) === keyedPrewarmPromises.get(key)") &&
    /finally \{[\s\S]{0,100}fresh\.forEach\(\(key\) => _analysisPrewarmInflightKeys\.delete\(key\)\);[\s\S]{0,80}request\?\.cleanup\?\.\(\);/.test(prefetchBody),
  "prewarm analysis cache queries must be bounded by the same client DB deadline pattern as cache lookups"
);

assert(
  /entry\.result\?\.hit === true[\s\S]{0,240}return _cloneAnalysisCacheResult\(entry\.result\);[\s\S]{0,80}_warmCache\.delete\(cacheKey\);[\s\S]{0,360}_awaitInflightPrewarm[\s\S]{0,220}Math\.min\([\s\S]{0,120}ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS[\s\S]{0,520}_awaitInflightAnalysisCacheResult[\s\S]{0,220}ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS[\s\S]{0,420}return _getCachedAnalysisFromDb\(cacheKey, \{/.test(getCachedBody),
  "warm cache misses or stale entries must wait briefly for in-flight prewarm and overlapping analysis-cache reads, then fall through to a fresh DB check"
);

assert(
  cacheSource.includes("const PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS = 350") &&
    cacheSource.includes("function _productDataRowFromSnapshot(row)") &&
    cacheSource.includes("export function rememberProductDataSnapshots(rows)") &&
    cacheSource.includes("row.productCacheKey") &&
    cacheSource.includes("row.productName") &&
    cacheSource.includes("row.nutritionalInfo") &&
    cacheSource.includes("row.nutrientPanel") &&
    cacheSource.includes("row.hasPublishedNutrients") &&
    cacheSource.includes("_rememberWarmProductData(row.cache_key || normalized.productCacheKey, normalized, warmedAt)") &&
    cacheSource.includes("_rememberWarmProductDataAliases(normalized, warmedAt)") &&
    homeSource.includes("rememberProductDataSnapshots(prewarmRows)") &&
    homeSource.includes("const productDataPrewarmRows = prewarmRows.filter((row) => !buildSearchRowCatalogSnapshot(row, row.cache_key))") &&
    homeSource.includes("productDataPrewarmRows.length > 0") &&
    homeSource.includes("prefetchProductDataByCacheKeys(productDataPrewarmRows.map((row) => row.cache_key))") &&
    cacheSource.includes("const prewarmAwaitTimeoutMs = Number.isFinite(options.prewarmWaitMs)") &&
    cacheSource.includes(": PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS") &&
    /_awaitInflightProductDataPrewarm\([\s\S]{0,80}cacheKey,[\s\S]{0,80}options,[\s\S]{0,180}Math\.min\([\s\S]{0,120}_remainingQueryBudget\(lookupStartedAt, lookupTimeoutMs\),[\s\S]{0,80}prewarmAwaitTimeoutMs/.test(cacheSource) &&
    homeSource.includes("const SEARCH_TAP_PREWARM_AWAIT_MS = 1200") &&
    homeSource.includes("prewarmWaitMs: SEARCH_TAP_PREWARM_AWAIT_MS"),
  "exact product-data lookups must use direct search-snapshot warm seeding plus a short default in-flight prewarm wait while allowing search taps to spend more of their bounded validation budget on the existing prewarm"
);

assert(
  cacheSource.includes("async function _awaitAnyInflightProductDataPrewarm(") &&
    cacheSource.includes("cacheKeys = null") &&
    cacheSource.includes("const targetKeys = Array.isArray(cacheKeys) ? cacheKeys.map(normalizeCacheKey).filter(Boolean) : null;") &&
    cacheSource.includes("targetKeys.map((key) => _productDataPrewarmInflightResults.get(key)).filter(Boolean)") &&
    cacheSource.includes("if (inflight.length === 0 || timeoutMs <= 0) return;") &&
    cacheSource.includes("Promise.allSettled(inflight)") &&
    cacheSource.includes("options.signal.addEventListener(\"abort\", abortHandler, { once: true })") &&
    /let bestWarm = _bestWarmProductDataCandidate\(keys, candidateKeys, brandName, querySig, queryVariants\);[\s\S]{0,180}const overlappingPrewarmKeys = keys\.filter\(\(key\) => _productDataPrewarmInflightResults\.has\(key\)\);[\s\S]{0,120}overlappingPrewarmKeys\.length > 0[\s\S]{0,260}_awaitAnyInflightProductDataPrewarm\([\s\S]{0,160}Math\.min\(remainingLookupBudget\(\), PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS\),[\s\S]{0,80}overlappingPrewarmKeys[\s\S]{0,220}bestWarm = _bestWarmProductDataCandidate\(keys, candidateKeys, brandName, querySig, queryVariants\);/.test(cacheSource),
  "name/photo product-data lookups must briefly re-check validated warm aliases only when candidate keys overlap an in-flight visible-row prewarm"
);

assert(
  cacheSource.includes("function _incrementCacheHit(cacheKey)") &&
    cacheSource.includes("const CACHE_HIT_RPC_TIMEOUT_MS = 1_500") &&
    cacheSource.includes("const CACHE_HIT_RPC_MAX_INFLIGHT = 2") &&
    cacheSource.includes("const CACHE_HIT_RPC_SCHEMA_RETRY_MS = 60_000") &&
    cacheSource.includes("let cacheHitRpcInflight = 0") &&
    cacheSource.includes("let cacheHitRpcRetryAt = 0") &&
    cacheSource.includes("cacheHitRpcInflight >= CACHE_HIT_RPC_MAX_INFLIGHT") &&
    cacheSource.includes("Date.now() < cacheHitRpcRetryAt") &&
    cacheSource.includes('request = _startQueryDeadline("Cache hit telemetry"') &&
    cacheSource.includes("timeoutMs: CACHE_HIT_RPC_TIMEOUT_MS") &&
    cacheSource.includes('supabase\n      .rpc("increment_cache_hit"') &&
    cacheSource.includes(".abortSignal(request.signal)") &&
    cacheSource.includes("function _isCacheHitRpcUnavailable(err)") &&
    cacheSource.includes('err?.code === "PGRST202"') &&
    cacheSource.includes("/increment_cache_hit/i.test(message)") &&
    cacheSource.includes("cacheHitRpcRetryAt = Date.now() + CACHE_HIT_RPC_SCHEMA_RETRY_MS") &&
    cacheSource.includes("cacheHitRpcRetryAt = 0") &&
    cacheSource.includes("cacheHitRpcInflight = Math.max(0, cacheHitRpcInflight - 1)") &&
    cacheSource.includes("function _cacheResultFromRow(row)") &&
    cacheSource.includes("function _rememberWarmAnalysis(cacheKey, result, warmedAt = Date.now())") &&
    /entry\.result\?\.hit === true[\s\S]{0,160}_incrementCacheHit\(cacheKey\)[\s\S]{0,100}return _cloneAnalysisCacheResult\(entry\.result\)/.test(getCachedBody) &&
    cacheSource.includes('console.log("[CACHE] HIT for key:", normalizedCacheKey);') &&
    cacheSource.includes("_incrementCacheHit(normalizedCacheKey);"),
  "warm cache hits and DB cache hits must record bounded non-blocking cache-hit telemetry"
);

assert(
  cacheSource.includes("function _cloneJsonish(value)") &&
    /function _cacheResultFromRow\(row\) \{[\s\S]{0,120}analysis: _cloneJsonish\(row\.analysis\)[\s\S]{0,120}opffData: row\.opff_data \? _cloneJsonish\(row\.opff_data\) : null/.test(cacheSource) &&
    /function _rememberWarmAnalysis\(cacheKey, result, warmedAt = Date\.now\(\)\) \{[\s\S]{0,180}result: _cloneAnalysisCacheResult\(result\)/.test(cacheSource) &&
    /function _cloneAnalysisCacheResult\(result\) \{[\s\S]{0,160}analysis: _cloneJsonish\(result\.analysis\)[\s\S]{0,120}opffData: result\.opffData \? _cloneJsonish\(result\.opffData\) : null/.test(cacheSource) &&
    /WARM HIT for key:[\s\S]{0,140}hits\.set\(key, _cloneAnalysisCacheResult\(entry\.result\)\)/.test(cacheSource) &&
    /WARM HIT for key:[\s\S]{0,140}return _cloneAnalysisCacheResult\(entry\.result\)/.test(cacheSource),
  "analysis cache warm, DB, and in-flight hits must clone payloads so replay callers cannot mutate shared cache objects"
);

assert(
  analysisCacheMigration.includes('CREATE POLICY "Anyone can read pet analysis cache"') &&
    analysisCacheMigration.includes("TO anon, authenticated") &&
    analysisCacheMigration.includes("lookup_type IN ('name', 'barcode')") &&
    analysisCacheMigration.includes("expires_at > NOW()") &&
    analysisCacheMigration.includes("SECURITY DEFINER") &&
    analysisCacheMigration.includes("SET search_path = public") &&
    analysisCacheMigration.includes("GRANT EXECUTE ON FUNCTION public.increment_cache_hit(TEXT)") &&
    analysisCacheMigration.includes("TO anon, authenticated"),
  "shared pet-food analysis cache must be readable by guests and hit telemetry must be a bounded security-definer RPC"
);

assert(
    /const result = _cacheResultFromRow\(row\);[\s\S]{0,120}_rememberWarmAnalysis\(row\.cache_key, result, now\);[\s\S]{0,120}warmedResults\.set\(row\.cache_key, result\);/.test(prefetchBody) &&
    /const result = _cacheResultFromRow\(row\);[\s\S]{0,120}dbHits\.set\(row\.cache_key, result\);[\s\S]{0,120}_rememberWarmAnalysis\(row\.cache_key, result\)/.test(cacheSource) &&
    /const result = _cacheResultFromRow\(\{ cache_key: normalizedCacheKey, \.\.\.data \}\);[\s\S]{0,120}_rememberWarmAnalysis\(normalizedCacheKey, result\);[\s\S]{0,80}return result;/.test(cacheSource),
  "schema-valid DB cache hits must be remembered in warm cache for same-session reuse"
);

assert(
  cacheSource.includes("const ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS = 350") &&
    cacheSource.includes("async function _awaitInflightPrewarm(cacheKey, options = {}, timeoutMs = ANALYSIS_CACHE_QUERY_TIMEOUT_MS)") &&
    cacheSource.includes("_analysisPrewarmInflightResults.get(cacheKey)") &&
    cacheSource.includes("options.signal.addEventListener(\"abort\", abortHandler, { once: true })") &&
    cacheSource.includes("return result?.hit === true ? _cloneAnalysisCacheResult(result) : null") &&
    /export async function getCachedAnalysis\(cacheKey, options = \{\}\) \{[\s\S]*?const lookupStartedAt = Date\.now\(\);[\s\S]*?const prewarmResult = await _awaitInflightPrewarm\([\s\S]*?Math\.min\([\s\S]*?_remainingQueryBudget\(lookupStartedAt, lookupTimeoutMs\),[\s\S]*?ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS[\s\S]*?PREWARM IN-FLIGHT HIT for key:[\s\S]*?return _getCachedAnalysisFromDb\(cacheKey, \{[\s\S]*?timeoutMs: _remainingQueryBudget\(lookupStartedAt, lookupTimeoutMs\)/.test(cacheSource) &&
    /export async function getCachedAnalyses\(cacheKeys, options = \{\}\) \{[\s\S]*?let dbKeys = \[\];[\s\S]*?const lookupStartedAt = Date\.now\(\);[\s\S]*?const prewarmKeys = dbKeys\.filter\(\(key\) => _analysisPrewarmInflightResults\.has\(key\)\);[\s\S]*?_awaitInflightPrewarm\([\s\S]*?Math\.min\([\s\S]*?_remainingQueryBudget\(lookupStartedAt, batchTimeoutMs\),[\s\S]*?ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS[\s\S]*?PREWARM IN-FLIGHT HIT for key:[\s\S]*?dbKeys = dbKeys\.filter\(\(key\) => !hits\.has\(key\)\);[\s\S]*?timeoutMs: _remainingQueryBudget\(lookupStartedAt, batchTimeoutMs\)/.test(cacheSource),
  "analysis cache lookups must wait only briefly for in-flight prewarm before preserving caller budget for direct DB reads"
);

assert(
  /export async function getCachedAnalyses\(cacheKeys, options = \{\}\)/.test(cacheSource) &&
    /const keys = \[\.\.\.new Set\([\s\S]{0,180}\.map\(\(k\) => k\.trim\(\)\)[\s\S]{0,80}\.filter\(Boolean\)/.test(cacheSource) &&
    cacheSource.includes('request = _startQueryDeadline("Analysis cache batch lookup"') &&
    cacheSource.includes(".in(\"cache_key\", dbKeys)") &&
    cacheSource.includes("dbHits.set(row.cache_key, result)") &&
    cacheSource.includes("_incrementCacheHit(row.cache_key)") &&
    cacheSource.includes("return hits"),
  "analysis cache fallback keys must support one bounded batched lookup instead of sequential per-key misses"
);

assert(
    cacheSource.includes("const _analysisCacheBatchInflight = new Map()") &&
    cacheSource.includes("const _analysisCacheSingleInflight = new Map()") &&
    cacheSource.includes("const _analysisCacheKeyInflightResults = new Map()") &&
    cacheSource.includes("_analysisCacheBatchInflight.clear();") &&
    cacheSource.includes("_analysisCacheSingleInflight.clear();") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.clear();") &&
    cacheSource.includes("function _normalizeAnalysisInflightKeys(cacheKeys)") &&
    /function _normalizeAnalysisInflightKeys\(cacheKeys\) \{[\s\S]{0,180}\.map\(\(key\) => key\.trim\(\)\)[\s\S]{0,80}\.filter\(Boolean\)[\s\S]{0,80}\)\]\.sort\(\);/.test(cacheSource) &&
    cacheSource.includes("function _analysisBatchInflightKey(cacheKeys, timeoutMs = ANALYSIS_CACHE_QUERY_TIMEOUT_MS)") &&
    cacheSource.includes("_normalizeAnalysisInflightKeys(cacheKeys).join(\"\\u001f\")") &&
    cacheSource.includes("function _analysisSingleInflightKey(cacheKey, timeoutMs = ANALYSIS_CACHE_QUERY_TIMEOUT_MS)") &&
    cacheSource.includes('const key = typeof cacheKey === "string" ? cacheKey.trim() : "";') &&
    cacheSource.includes("function _normalizeAnalysisCacheKey(cacheKey)") &&
    cacheSource.includes("function _cloneAnalysisCacheResult(result)") &&
    cacheSource.includes("async function _awaitInflightAnalysisCacheResult(cacheKey, options = {}, timeoutMs = ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS)") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.get(key)") &&
    cacheSource.includes("return result?.hit === true ? _cloneAnalysisCacheResult(result) : null") &&
    (() => {
      const overlap = cacheSource.indexOf("const overlappingInflightKeys = dbKeys.filter((key) => _analysisCacheKeyInflightResults.has(key));");
      const awaitOverlap = cacheSource.indexOf("await _awaitInflightAnalysisCacheResult(", overlap);
      const overlapHit = cacheSource.indexOf("ANALYSIS IN-FLIGHT KEY HIT for key:", awaitOverlap);
      const filterAfterOverlap = cacheSource.indexOf("dbKeys = dbKeys.filter((key) => !hits.has(key));", overlapHit);
      const batchInflight = cacheSource.indexOf("const inflightKey = _analysisBatchInflightKey(dbKeys, batchTimeoutMs);", filterAfterOverlap);
      const identicalHit = cacheSource.indexOf("Analysis cache IN-FLIGHT HIT (batch)", batchInflight);
      return overlap !== -1 &&
        awaitOverlap !== -1 &&
        overlapHit !== -1 &&
        filterAfterOverlap !== -1 &&
        batchInflight !== -1 &&
        identicalHit !== -1 &&
        overlap < awaitOverlap &&
        awaitOverlap < overlapHit &&
        overlapHit < filterAfterOverlap &&
        filterAfterOverlap < batchInflight &&
        batchInflight < identicalHit;
    })() &&
    cacheSource.includes("const lookupPromise = (async () => {") &&
    cacheSource.includes("const keyInflightPromises = new Map();") &&
    cacheSource.includes("_analysisCacheBatchInflight.set(inflightKey, lookupPromise)") &&
    cacheSource.includes("const keyPromise = lookupPromise.then((results) => results.get(key) || null)") &&
    cacheSource.includes("keyInflightPromises.set(key, keyPromise)") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.set(key, keyPromise)") &&
    cacheSource.includes("_analysisCacheBatchInflight.get(inflightKey) === lookupPromise") &&
    cacheSource.includes("_analysisCacheBatchInflight.delete(inflightKey)") &&
    cacheSource.includes("for (const [key, keyPromise] of keyInflightPromises.entries())") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.get(key) === keyPromise") &&
    !cacheSource.includes("_analysisCacheBatchInflight.set(inflightKey, new Map"),
  "analysis cache batch lookup must coalesce identical and overlapping concurrent non-abort-bound reads without storing settled misses"
);

assert(
  (() => {
    const singleLookup = cacheSource.indexOf("export async function getCachedAnalysis(cacheKey, options = {})");
    const prewarmWait = cacheSource.indexOf("const prewarmResult = await _awaitInflightPrewarm(", singleLookup);
    const inflightWait = cacheSource.indexOf("const inflightResult = await _awaitInflightAnalysisCacheResult(", prewarmWait);
    const inflightHit = cacheSource.indexOf("ANALYSIS IN-FLIGHT KEY HIT for key:", inflightWait);
    const dbFallback = cacheSource.indexOf("return _getCachedAnalysisFromDb(cacheKey, {", inflightHit);
    const dbLookup = cacheSource.indexOf("async function _getCachedAnalysisFromDb(cacheKey, options = {})");
    const normalizedKey = cacheSource.indexOf("const normalizedCacheKey = _normalizeAnalysisCacheKey(cacheKey);", dbLookup);
    const singleInflightKey = cacheSource.indexOf("const inflightKey = _analysisSingleInflightKey(normalizedCacheKey, lookupTimeoutMs);", normalizedKey);
    const identicalHit = cacheSource.indexOf("Analysis cache IN-FLIGHT HIT for key:", singleInflightKey);
    return singleLookup !== -1 &&
      prewarmWait !== -1 &&
      inflightWait !== -1 &&
      inflightHit !== -1 &&
      dbFallback !== -1 &&
      dbLookup !== -1 &&
      normalizedKey !== -1 &&
      singleInflightKey !== -1 &&
      identicalHit !== -1 &&
      singleLookup < prewarmWait &&
      prewarmWait < inflightWait &&
      inflightWait < inflightHit &&
      inflightHit < dbFallback &&
      dbLookup < normalizedKey &&
      normalizedKey < singleInflightKey &&
      singleInflightKey < identicalHit;
  })() &&
    cacheSource.includes("_analysisCacheSingleInflight.set(inflightKey, lookupPromise)") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.set(normalizedCacheKey, lookupPromise)") &&
    cacheSource.includes("_analysisCacheSingleInflight.get(inflightKey) === lookupPromise") &&
    cacheSource.includes("_analysisCacheSingleInflight.delete(inflightKey)") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.get(normalizedCacheKey) === lookupPromise") &&
    cacheSource.includes("_analysisCacheKeyInflightResults.delete(normalizedCacheKey)") &&
    !cacheSource.includes("_analysisCacheSingleInflight.set(inflightKey, { hit: false"),
  "single-key analysis cache lookup must coalesce identical and overlapping concurrent non-abort-bound reads without storing settled misses"
);

assert(
  analysisSource.includes("getCachedAnalyses, normalizeCacheKey") &&
    analysisSource.includes("function _cacheBaseKeyCandidates(primaryKey, fallbackKey)") &&
    analysisSource.includes("const fallbackKeys = Array.isArray(fallbackKey) ? fallbackKey : [fallbackKey]") &&
    analysisSource.includes("return [...new Set([primaryKey, ...fallbackKeys].filter(Boolean))]") &&
    analysisSource.includes("const baseKeys = _cacheBaseKeyCandidates(primaryKey, fallbackKey)") &&
    analysisSource.includes("const speciesKeys = baseKeys.map((key) => _analysisCacheKey(key, petType)).filter(Boolean)") &&
    analysisSource.includes("const keys = [...new Set([...speciesKeys, ...baseKeys])]") &&
    /const hits = await getCachedAnalyses\(keys, options\)[\s\S]{0,180}const cached = hits\.get\(key\)[\s\S]{0,120}cached\?\.hit/.test(analysisSource) &&
    !analysisSource.includes("const speciesHits = await getCachedAnalyses(speciesKeys, options)") &&
    !analysisSource.includes("const legacyHits = await getCachedAnalyses(legacyKeys, options)"),
  "species cache lookup must batch all species and legacy fallback keys in one query while preserving priority order"
);

assert(
  !cacheSource.includes("(known miss)"),
  "warm-cache known-miss short-circuit must not remain"
);

assert(
  cacheSource.includes("function _isUsableCachedAnalysis(analysis)") &&
    cacheSource.includes("PET_CATEGORY_NAMES_V2") &&
    /async function _getCachedAnalysisFromDb[\s\S]*if \(!_isUsableCachedAnalysis\(data\.analysis\)\)[\s\S]{0,180}return \{ hit: false \};[\s\S]*const result = _cacheResultFromRow\(\{ cache_key: normalizedCacheKey, \.\.\.data \}\);/.test(cacheSource),
  "shared analysis-cache hits must be schema-valid before warm or DB replay"
);

assert(
    homeSource.includes("function buildSearchPrewarmKeys(rows)") &&
    homeSource.includes("function buildSearchPrewarmBaseKeys(row)") &&
    homeSource.includes("function prewarmSearchRows(rows)") &&
    homeSource.includes("function normalizeSearchPrewarmRow(row)") &&
    homeSource.includes("const SEARCH_PREWARM_DEDUPE_TTL_MS = 60 * 1000") &&
    homeSource.includes("const searchPrewarmTimestamps = new Map()") &&
    homeSource.includes("function searchPrewarmSignature(row)") &&
    homeSource.includes("function filterRecentlyPrewarmedSearchRows(rows, now = Date.now())") &&
    homeSource.includes("function markSearchPrewarmRowsForRetry(rows)") &&
    homeSource.includes("const prewarmRows = filterRecentlyPrewarmedSearchRows(normalizedRows)") &&
    homeSource.includes("if (prewarmRows.length === 0) return;") &&
    homeSource.includes("markSearchPrewarmRowsForRetry(prewarmRows)") &&
    homeSource.includes("const rowPetType = [\"dog\", \"cat\"].includes(row.petType || row.pet_type)") &&
    homeSource.includes("const petType = rowPetType || inferSearchPetType(productName, brand, cacheKey)") &&
    homeSource.includes("function cacheKeySpellingVariants(cacheKey)") &&
    homeSource.includes("const variants = new Set([key])") &&
    homeSource.includes("for (const existing of [...variants])") &&
    homeSource.includes("if (variants.size >= 32) break;") &&
    homeSource.includes("variants.delete(key)") &&
    homeSource.includes('[/grain free/g, "grainfree"]') &&
    homeSource.includes('[/raw mix/g, "rawmix"]') &&
    homeSource.includes("function normalizedSearchKeyVariants(...values)") &&
    homeSource.includes("...normalizedSearchKeyVariants(productName)") &&
    homeSource.includes("normalizedSearchKeyVariants(`${brand} ${productName}`)") &&
    homeSource.includes("const baseKeys = buildSearchPrewarmBaseKeys(row)") &&
    homeSource.includes("for (const key of baseKeys)") &&
    homeSource.includes("keys.push(`${key}__${row.petType}`)") &&
    homeSource.includes("keys.push(`${key}__dog`, `${key}__cat`)") &&
    homeSource.includes("void Promise.allSettled([") &&
    homeSource.includes("rememberProductDataSnapshots(prewarmRows)") &&
    homeSource.includes("const productDataPrewarmRows = prewarmRows.filter((row) => !buildSearchRowCatalogSnapshot(row, row.cache_key))") &&
    homeSource.includes("prefetchProductDataByCacheKeys(productDataPrewarmRows.map((row) => row.cache_key))") &&
    homeSource.includes("prefetchAnalyses(buildSearchPrewarmKeys(prewarmRows))") &&
    homeSource.includes("Prewarm background task failed") &&
    homeSource.includes("prewarmSearchRows(recentSearches)") &&
    !homeSource.includes("cacheKeys.flatMap((key) => [`${key}__dog`, `${key}__cat`])"),
  "Home search and recent prewarm must dedupe repeated rows, use the known/inferred species key, and only query both dog/cat variants when species is unknown"
);

console.log("cache prewarm guard passed");
