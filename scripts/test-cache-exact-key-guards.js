#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const scanFlowSource = fs.readFileSync(path.join(root, "scripts/test-scan-flow.js"), "utf8");
const uniquenessMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/033_enforce_product_data_cache_key_uniqueness.sql"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`cache exact-key guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  cacheSource.includes("function _scoreProductRow(row, querySig, queryVariants)") &&
    cacheSource.includes("function _rowPassesMatch(row, brandName, querySig, queryVariants)"),
  "exact-key rows must reuse shared token and variant scoring helpers"
);

assert(
  /const candidateKeys = new Map\(\)/.test(cacheSource) &&
    cacheSource.includes("function _cacheKeySpellingVariants(cacheKey)") &&
    cacheSource.includes("const variants = new Set([key])") &&
    cacheSource.includes("for (const existing of [...variants])") &&
    cacheSource.includes("if (variants.size >= 32) break;") &&
    cacheSource.includes("variants.delete(key)") &&
    cacheSource.includes('[/grain free/g, "grainfree"]') &&
    cacheSource.includes('[/raw mix/g, "rawmix"]') &&
    cacheSource.includes("function _normalizeProductDataAliasKeys(...values)") &&
    /const variants = normalized\.flatMap\(\(key\) => \[key, \.\.\._cacheKeySpellingVariants\(key\)\]\);/.test(cacheSource) &&
    /const addCandidateKey = \(key, priority, kind\) => \{[\s\S]{0,80}for \(const normalized of _normalizeProductDataAliasKeys\(key\)\)/.test(cacheSource) &&
    /addCandidateKey\(productName, 0, "product"\)/.test(cacheSource) &&
    /addCandidateKey\(`\$\{brandName\} \$\{productName\}`, 1, "brand_product"\)/.test(cacheSource) &&
    /addCandidateKey\(term, 4, "search_term"\)/.test(cacheSource),
  "exact-key candidates must preserve confidence priority from canonical keys through broad search terms and conservative spelling aliases"
);

assert(
  (() => {
    const scoredStart = cacheSource.indexOf("const scored = rows");
    const normalizeIndex = cacheSource.indexOf("const normalized = _normalizeUsableRow(row);", scoredStart);
    const matchIndex = cacheSource.indexOf("_rowPassesMatch(row, brandName, querySig, queryVariants)", normalizeIndex);
    return scoredStart !== -1 &&
      normalizeIndex !== -1 &&
      matchIndex !== -1 &&
      scoredStart < normalizeIndex &&
      normalizeIndex < matchIndex;
  })(),
  "exact-key hits must be sanitized and validated before selection"
);

assert(
  /\.filter\(\(entry\) => entry\.ok\)[\s\S]{0,220}a\.priority - b\.priority[\s\S]{0,120}b\.score - a\.score[\s\S]{0,120}normalized\.ingredientCount/.test(cacheSource),
  "exact-key hits must rank by key confidence before score and ingredient count"
);

assert(
  !/rows\s*\.filter\(\(r\) => \(r\.ingredients\?\.length \|\| 0\) >= 5\)\s*\.sort\(\(a, b\) => \(b\.ingredient_count \|\| 0\) - \(a\.ingredient_count \|\| 0\)\)\[0\]/.test(cacheSource),
  "exact-key hits must not choose the largest ingredient list without match validation"
);

assert(
  cacheSource.includes("function _normalizeUsableRow(data)") &&
    /for \(const row of rows\) \{[\s\S]{0,80}const normalized = _normalizeUsableRow\(row\);[\s\S]{0,240}Selected key candidate rejected/.test(cacheSource) &&
    cacheSource.includes('console.log("[CACHE] Exact key rejected:", row.cache_key, "| unusable ingredients after sanitization")') &&
    cacheSource.includes("return best.normalized;") &&
    cacheSource.includes('console.log("[CACHE] Scored search rejected:", row.cache_key, "| unusable ingredients after sanitization")'),
  "product_data hits must be rejected after client-side ingredient sanitization if fewer than 5 ingredients remain"
);

assert(
	  cacheSource.includes("const _productDataWarmCache = new Map()") &&
	    cacheSource.includes("const _productDataExactInflight = new Map()") &&
	    cacheSource.includes("const _productDataPrewarmInflightKeys = new Set()") &&
	    cacheSource.includes("const _productDataPrewarmInflightResults = new Map()") &&
	    cacheSource.includes("const _productDataKeyInflightResults = new Map()") &&
	    cacheSource.includes("function _rememberWarmProductData(cacheKey, result, warmedAt = Date.now())") &&
	    cacheSource.includes("function _warmProductDataAliasKeys(result)") &&
	    cacheSource.includes("function _rememberWarmProductDataAliases(result, warmedAt = Date.now())") &&
	    /function _warmProductDataAliasKeys\(result\) \{[\s\S]{0,220}_normalizeProductDataAliasKeys\([\s\S]{0,80}result\.productCacheKey,[\s\S]{0,80}result\.productName,[\s\S]{0,100}result\.brand && result\.productName \? `\$\{result\.brand\} \$\{result\.productName\}` : null/.test(cacheSource) &&
	    cacheSource.includes("function _getWarmProductData(cacheKey)") &&
	    cacheSource.includes("async function _awaitInflightProductDataPrewarm(cacheKey, options = {}, timeoutMs = PRODUCT_DATA_QUERY_TIMEOUT_MS)") &&
	    cacheSource.includes("async function _awaitInflightProductDataResult(cacheKey, options = {}, timeoutMs = PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS)") &&
	    cacheSource.includes("async function _awaitAnyInflightProductDataPrewarm(") &&
	    cacheSource.includes("cacheKeys = null") &&
	    cacheSource.includes("const targetKeys = Array.isArray(cacheKeys) ? cacheKeys.map(normalizeCacheKey).filter(Boolean) : null;") &&
	    cacheSource.includes("targetKeys.map((key) => _productDataPrewarmInflightResults.get(key)).filter(Boolean)") &&
	    cacheSource.includes("if (inflight.length === 0 || timeoutMs <= 0) return;") &&
	    cacheSource.includes("function _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants)") &&
	    cacheSource.includes("if (!key || result?.found !== true || (result.ingredients?.length || 0) < 5) return;") &&
	    cacheSource.includes("_productDataWarmCache.delete(key);") &&
	    cacheSource.includes("_productDataExactInflight.clear();") &&
	    cacheSource.includes("_productDataPrewarmInflightResults.clear();") &&
	    cacheSource.includes("_productDataKeyInflightResults.clear();") &&
	    !cacheSource.includes("reason: \"not_found\", warmedAt") &&
	    !cacheSource.includes("reason: \"lookup_error\", warmedAt"),
	  "product_data warm cache and prewarm waits must store positive sanitized rows with conservative spelling aliases only and must not cache negative lookup outcomes"
	);

assert(
  /export async function prefetchProductDataByCacheKeys\(cacheKeys\)[\s\S]{0,320}const keys = \[\.\.\.new Set\([\s\S]{0,180}\.map\(\(k\) => normalizeCacheKey\(k\)\)[\s\S]{0,80}\.filter\(Boolean\)[\s\S]{0,80}\)\];/.test(cacheSource) &&
	    !/export async function prefetchProductDataByCacheKeys\(cacheKeys\)[\s\S]{0,320}\.map\(\(k\) => k\.trim\(\)\)/.test(cacheSource) &&
	    cacheSource.includes("_productDataPrewarmInflightKeys.has(key)") &&
	    cacheSource.includes("fresh.forEach((key) => _productDataPrewarmInflightKeys.add(key));") &&
	    cacheSource.includes("const prewarmPromise = (async () => {") &&
	    cacheSource.includes("const warmedResults = new Map();") &&
	    /from\("product_data"\)[\s\S]{0,120}\.in\("cache_key", fresh\)[\s\S]{0,120}\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)[\s\S]{0,220}\.abortSignal\(request\.signal\)/.test(cacheSource) &&
	    /const normalized = _normalizeUsableRow\(row\);[\s\S]{0,160}_rememberWarmProductData\(row\.cache_key, normalized, now\);[\s\S]{0,140}_rememberWarmProductData\(normalized\.productCacheKey, normalized, now\);[\s\S]{0,100}_rememberWarmProductDataAliases\(normalized, now\);[\s\S]{0,180}warmedResults\.set\(normalizeCacheKey\(row\.cache_key\), normalized\);[\s\S]{0,120}warmedResults\.set\(normalizeCacheKey\(normalized\.productCacheKey\), normalized\);/.test(cacheSource) &&
		    cacheSource.includes("const keyedPrewarmPromises = new Map();") &&
		    cacheSource.includes("const keyedPromise = prewarmPromise.then((results) => results.get(key) || null);") &&
		    cacheSource.includes("_productDataPrewarmInflightResults.set(key, keyedPromise)") &&
		    cacheSource.includes("_productDataKeyInflightResults.set(key, keyedPromise)") &&
		    cacheSource.includes("_productDataPrewarmInflightResults.get(key) === promise") &&
		    cacheSource.includes("_productDataKeyInflightResults.get(key) === promise") &&
	    /finally \{[\s\S]{0,100}fresh\.forEach\(\(key\) => _productDataPrewarmInflightKeys\.delete\(key\)\);[\s\S]{0,80}request\?\.cleanup\?\.?\(\);/.test(cacheSource),
	  "visible search product_data rows must be prewarmed as positive sanitized exact-key hits with per-key in-flight reuse and without caching negative outcomes"
	);

assert(
	    /export async function getProductDataByCacheKey\(cacheKey, options = \{\}\)[\s\S]{0,520}const warmed = _getWarmProductData\(cacheKey\);[\s\S]{0,160}normalizeCacheKey\(warmed\.productCacheKey\) === exactCacheKey[\s\S]{0,220}Product data WARM HIT \(selected key\)[\s\S]{0,80}return warmed;/.test(cacheSource) &&
	    cacheSource.includes("Product data warm alias ignored for selected key") &&
	    cacheSource.includes("const prewarmAwaitTimeoutMs = Number.isFinite(options.prewarmWaitMs)") &&
	    cacheSource.includes("? Math.max(0, options.prewarmWaitMs)") &&
	    cacheSource.includes(": PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS") &&
	    /export async function getProductDataByCacheKey\(cacheKey, options = \{\}\)[\s\S]{0,160}const exactCacheKey = normalizeCacheKey\(cacheKey\);[\s\S]{0,80}if \(!exactCacheKey\) return \{ found: false, reason: "not_found" \};/.test(cacheSource) &&
	    /const prewarmResult = await _awaitInflightProductDataPrewarm\([\s\S]{0,180}_remainingQueryBudget\(lookupStartedAt, lookupTimeoutMs\)[\s\S]{0,120}prewarmAwaitTimeoutMs,[\s\S]{0,220}Product data PREWARM IN-FLIGHT HIT \(selected key\)[\s\S]{0,120}return prewarmResult;/.test(cacheSource) &&
	    /const inflightResult = await _awaitInflightProductDataResult\([\s\S]{0,180}_remainingQueryBudget\(lookupStartedAt, lookupTimeoutMs\)[\s\S]{0,120}prewarmAwaitTimeoutMs,[\s\S]{0,260}normalizeCacheKey\(inflightResult\.productCacheKey\) === exactCacheKey[\s\S]{0,180}Product data IN-FLIGHT KEY HIT \(selected key\)[\s\S]{0,120}return inflightResult;/.test(cacheSource) &&
	    /Product data HIT \(selected key\)[\s\S]{0,160}_rememberWarmProductData\(cacheKey, normalized\);[\s\S]{0,80}_rememberWarmProductData\(exactCacheKey, normalized\);[\s\S]{0,80}_rememberWarmProductData\(normalized\.productCacheKey, normalized\);[\s\S]{0,80}_rememberWarmProductDataAliases\(normalized\);[\s\S]{0,80}return normalized;/.test(cacheSource),
	  "exact selected-row lookup must canonicalize selected keys, reuse warm/in-flight prewarmed rows, require real row-key agreement for warm hits, and remember positive product_data rows without another Supabase round trip"
	);

	{
	  const start = cacheSource.indexOf("export async function getProductDataByCacheKey");
	  const end = cacheSource.indexOf("\n/**", start);
	  const exactLookupBody = cacheSource.slice(start, end === -1 ? undefined : end);
	  assert(
	    start !== -1 &&
	    exactLookupBody.includes("const exactCacheKey = normalizeCacheKey(cacheKey)") &&
	    exactLookupBody.includes("const inflightKey = exactCacheKey") &&
	    exactLookupBody.includes("if (!options.signal && _productDataExactInflight.has(inflightKey))") &&
	    exactLookupBody.includes("Product data IN-FLIGHT HIT (selected key)") &&
	    exactLookupBody.includes("await _productDataExactInflight.get(inflightKey)") &&
		    cacheSource.includes("const lookupPromise = (async () => {") &&
		    cacheSource.includes("_productDataExactInflight.set(inflightKey, lookupPromise)") &&
		    cacheSource.includes("keyedPromise = lookupPromise.then((result) => (result?.found === true ? result : null))") &&
		    cacheSource.includes("_productDataKeyInflightResults.set(inflightKey, keyedPromise)") &&
		    cacheSource.includes("_productDataExactInflight.get(inflightKey) === lookupPromise") &&
		    cacheSource.includes("_productDataExactInflight.delete(inflightKey)") &&
		    cacheSource.includes("_productDataKeyInflightResults.get(inflightKey) === keyedPromise") &&
		    !cacheSource.includes("_productDataExactInflight.set(inflightKey, { found: false"),
	    "exact selected-row lookup must coalesce concurrent non-abort-bound lookups without storing negative outcomes"
	  );
	}

{
  const start = cacheSource.indexOf("function _bestWarmProductDataCandidate");
  const end = cacheSource.indexOf("\nexport async function getProductDataByCacheKey", start);
  const warmExactBody = cacheSource.slice(start, end === -1 ? undefined : end);
  const productLookupStart = cacheSource.indexOf("export async function getProductData(productNameOrId, brand, options = {})");
  const productLookupEnd = cacheSource.indexOf("\n/**\n * Save product data", productLookupStart);
  const productLookupBody = cacheSource.slice(productLookupStart, productLookupEnd === -1 ? undefined : productLookupEnd);
  assert(
    start !== -1 &&
      productLookupStart !== -1 &&
      warmExactBody.includes("const normalized = _getWarmProductData(key);") &&
      warmExactBody.includes("_rowPassesMatch(row, brandName, querySig, queryVariants)") &&
      warmExactBody.includes(".filter((entry) => entry.ok)") &&
      warmExactBody.includes("a.priority - b.priority") &&
      warmExactBody.includes("b.score - a.score") &&
      warmExactBody.includes("(b.normalized.ingredientCount || 0) - (a.normalized.ingredientCount || 0)") &&
      productLookupBody.includes("let bestWarm = _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants);") &&
      productLookupBody.includes("const overlappingPrewarmKeys = keys.filter((key) => _productDataPrewarmInflightResults.has(key));") &&
      productLookupBody.includes("if (!bestWarm && overlappingPrewarmKeys.length > 0)") &&
      productLookupBody.includes("await _awaitAnyInflightProductDataPrewarm(") &&
      productLookupBody.includes("Math.min(remainingLookupBudget(), PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS)") &&
      productLookupBody.includes("overlappingPrewarmKeys") &&
      productLookupBody.includes("bestWarm = _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants);") &&
      productLookupBody.includes("const overlappingInflightKeys = keys.filter((key) => _productDataKeyInflightResults.has(key));") &&
      productLookupBody.includes("await Promise.allSettled(") &&
      productLookupBody.includes("_awaitInflightProductDataResult(") &&
      productLookupBody.includes("Product data WARM HIT (exact key):") &&
      productLookupBody.includes("return bestWarm.normalized;"),
    "getProductData must validate warm exact-key product_data rows with the same brand/variant scorer before returning"
  );
}

assert(
  cacheSource.includes("const exactLookupPromise = (async () => {") &&
    cacheSource.includes("const keyedResults = new Map();") &&
    cacheSource.includes("keyedResults.set(normalizeCacheKey(row.cache_key), normalized);") &&
    cacheSource.includes("keyedResults.set(normalizeCacheKey(normalized.productCacheKey), normalized);") &&
    cacheSource.includes("const keyInflightPromises = new Map();") &&
    cacheSource.includes("const keyPromise = exactLookupPromise.then(({ keyedResults }) => keyedResults.get(key) || null);") &&
    cacheSource.includes("_productDataKeyInflightResults.set(key, keyPromise)") &&
    cacheSource.includes("_productDataKeyInflightResults.get(key) === keyPromise") &&
    !cacheSource.includes("_productDataKeyInflightResults.set(key, { found: false"),
  "getProductData exact candidate reads must expose positive sanitized per-key in-flight results without storing settled misses"
);

assert(
  /Product data HIT \(exact key\):[\s\S]{0,240}_rememberWarmProductData\(best\.row\.cache_key, best\.normalized\);[\s\S]{0,100}_rememberWarmProductData\(best\.normalized\.productCacheKey, best\.normalized\);[\s\S]{0,80}_rememberWarmProductDataAliases\(best\.normalized\);/.test(cacheSource) &&
    /Product data HIT \(scored\):[\s\S]{0,240}_rememberWarmProductData\(best\.row\.cache_key, best\.normalized\);[\s\S]{0,100}_rememberWarmProductData\(best\.normalized\.productCacheKey, best\.normalized\);[\s\S]{0,80}_rememberWarmProductDataAliases\(best\.normalized\);/.test(cacheSource),
  "product_data exact and scored hits must warm product-name and brand-name aliases for later photo/name lookups"
);

assert(
  cacheSource.includes("const PRODUCT_DATA_QUERY_TIMEOUT_MS = 8000") &&
    cacheSource.includes("const ANALYSIS_CACHE_QUERY_TIMEOUT_MS = 8000") &&
    cacheSource.includes("const WARM_TTL_MS = 5 * 60 * 1000") &&
    cacheSource.includes("function _startQueryDeadline") &&
    cacheSource.includes("function _remainingQueryBudget(startedAt, totalMs)") &&
    cacheSource.includes("signal.addEventListener(\"abort\", abortFromParent, { once: true })") &&
    cacheSource.includes("signal?.removeEventListener(\"abort\", abortFromParent)"),
  "cache service must provide bounded Supabase query deadlines linked to parent abort signals"
);

assert(
  cacheSource.includes("const lookupStartedAt = Date.now()") &&
    cacheSource.includes("const lookupTimeoutMs = options.timeoutMs || PRODUCT_DATA_QUERY_TIMEOUT_MS") &&
    cacheSource.includes("const remainingLookupBudget = () => _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs)") &&
    cacheSource.includes("const exactBudgetMs = remainingLookupBudget()") &&
    cacheSource.includes("timeoutMs: exactBudgetMs") &&
    cacheSource.includes("Product data lookup budget exhausted before scored fallback") &&
    cacheSource.includes("const scoredBudgetMs = remainingLookupBudget()") &&
    cacheSource.includes("timeoutMs: scoredBudgetMs"),
  "getProductData timeoutMs must be a total lookup budget across exact and scored fallback queries"
);

assert(
  cacheSource.includes('return { found: false, reason: "lookup_error" };') &&
    cacheSource.includes('return { found: false, reason: "not_found" };') &&
    cacheSource.includes('return { found: false, reason: "unusable" };'),
  "exact selected-row lookup failures must expose reasons so stale recents are removed without deleting on network errors"
);

{
  const start = cacheSource.indexOf("export async function getProductDataByCacheKey");
  const end = cacheSource.indexOf("\n/**", start);
  const exactLookupBody = cacheSource.slice(start, end === -1 ? undefined : end);
  assert(
    start !== -1 &&
      exactLookupBody.includes('.eq("cache_key", exactCacheKey)') &&
      !exactLookupBody.includes('.eq("cache_key", cacheKey)') &&
      exactLookupBody.includes('.order("ingredient_count", { ascending: false })') &&
      exactLookupBody.includes('.order("updated_at", { ascending: false })') &&
      exactLookupBody.includes(".limit(5)"),
    "exact selected-row lookup must pick the best valid row instead of failing on duplicate cache-key drift"
  );

  assert(
    start !== -1 &&
      exactLookupBody.includes('.eq("cache_key", exactCacheKey)') &&
      !exactLookupBody.includes('.eq("cache_key", cacheKey)') &&
      exactLookupBody.includes(".abortSignal(request.signal)") &&
      !exactLookupBody.includes('.gte("ingredient_count", 5)') &&
      !exactLookupBody.includes(".maybeSingle()") &&
      /for \(const row of rows\)[\s\S]{0,120}const normalized = _normalizeUsableRow\(row\);[\s\S]{0,260}continue;[\s\S]{0,460}return normalized;[\s\S]{0,80}return \{ found: false, reason: "unusable" \};/.test(exactLookupBody),
    "exact selected-row lookup must not prefilter on stored ingredient_count before client-side sanitization"
  );
}

{
  const start = cacheSource.indexOf("// ── Step 2: brand-constrained ILIKE search with scoring ──");
  const end = cacheSource.indexOf("\n  return { found: false, reason: \"not_found\" };", start);
  const scoredFallbackBody = cacheSource.slice(start, end === -1 ? undefined : end);
  assert(
    start !== -1 &&
      scoredFallbackBody.includes(".abortSignal(request.signal)") &&
      !scoredFallbackBody.includes('.gte("ingredient_count", 5)') &&
      /const scored = results[\s\S]{0,120}\.map\(\(row\) => \{[\s\S]{0,120}const normalized = _normalizeUsableRow\(row\);[\s\S]{0,240}unusable ingredients after sanitization[\s\S]{0,220}_scoreProductRow\(row, querySig, queryVariants\)/.test(scoredFallbackBody) &&
      /scored\.sort\(\(a, b\) =>[\s\S]{0,120}b\.score - a\.score[\s\S]{0,160}b\.normalized\.ingredientCount/.test(scoredFallbackBody) &&
      scoredFallbackBody.includes('return { found: false, reason: "not_found" };') &&
      scoredFallbackBody.includes('return { found: false, reason: "unusable" };') &&
      scoredFallbackBody.includes("return best.normalized;"),
    "scored product_data fallback must sanitize rows before scoring, expose miss reasons, and must not prefilter on stored ingredient_count"
  );
}

assert(
  uniquenessMigration.includes("row_number() OVER") &&
    uniquenessMigration.includes("PARTITION BY cache_key") &&
    uniquenessMigration.includes("DELETE FROM public.product_data") &&
    uniquenessMigration.includes("CREATE UNIQUE INDEX product_data_cache_key_unique") &&
    uniquenessMigration.includes("ADD CONSTRAINT product_data_cache_key_unique") &&
    uniquenessMigration.includes("UNIQUE USING INDEX product_data_cache_key_unique"),
  "database migrations must dedupe product_data cache keys and enforce exact-row uniqueness"
);

assert(
  scanFlowSource.includes("function normalizeUsableRow(row)") &&
    scanFlowSource.includes("sanitizeIngredients(row?.ingredients)") &&
    !scanFlowSource.includes("ingredient_count=gte.5") &&
    /normalizeUsableRow\(row\)[\s\S]{0,260}scoreRow\(normalized, querySig, queryVars\)/.test(scanFlowSource),
  "scan-flow audit mirror must sanitize candidate rows and avoid stale stored ingredient_count prefilters"
);

console.log("cache exact-key guard passed");
