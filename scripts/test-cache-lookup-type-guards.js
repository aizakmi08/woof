const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const edgeSource = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");
const migrationSource = fs.readFileSync(path.join(root, "supabase/migrations/028_fix_analysis_cache_lookup_type.sql"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`cache lookup-type guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /export async function analyzeWithData\(opffProduct, base64Image, \{[\s\S]{0,90}lookupType/.test(claudeSource) &&
    claudeSource.includes("if (lookupType) payload.lookupType = lookupType;") &&
    claudeSource.includes("cacheAliases") &&
    claudeSource.includes("payload.cacheAliases = cacheAliases"),
  "Claude verified-data wrapper must forward explicit lookupType and bounded cache aliases"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runBarcode(");
    const end = analysisSource.indexOf("\n// ── Search flow", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    const terms = [
      "const analysisKey = _analysisCacheKey(barcode, resolvedPetType);",
      "const scoringProduct = catalogProductForScoring || lookup.product;",
      "const analysis = await analyzeWithData(scoringProduct, undefined, { onUpdate, signal, cacheKey: analysisKey || barcode, lookupType: \"barcode\", cacheAliases, clientProStatus: isPro === true });",
    ];
    let cursor = 0;
    return terms.every((term) => {
      const idx = body.indexOf(term, cursor);
      if (idx < 0) return false;
      cursor = idx + term.length;
      return true;
    });
  })(),
  "barcode analysis must mark shared cache writes as barcode lookups under the species-specific cache key"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runBarcode(");
    const end = analysisSource.indexOf("\n// ── Search flow", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    return body.includes("try the cleaner catalog/name cache") &&
      analysisSource.includes("const BARCODE_ANALYSIS_CACHE_TIMEOUT_MS = 1800") &&
      analysisSource.includes("const BARCODE_CATALOG_CACHE_TIMEOUT_MS = 1800") &&
      analysisSource.includes("const CATALOG_ANALYSIS_CACHE_TIMEOUT_MS = 2500") &&
      analysisSource.includes("function _getSpeciesMemoryResult(primaryKey, fallbackKey, petType)") &&
      body.includes("const opffNameBaseKey = normalizeCacheKey(") &&
      body.includes("const opffNameFallbackKeys = _catalogNameFallbackKeys({") &&
      body.includes("const opffNameAnalysisKeys = [opffNameBaseKey, ...opffNameFallbackKeys]") &&
      body.includes("const opffNameMemoryResult = _getSpeciesMemoryResult(opffNameBaseKey, opffNameFallbackKeys, resolvedPetType)") &&
      analysisSource.includes("function _completeBarcodeNameReplay({") &&
      analysisSource.includes("Barcode reused ${sourceLabel} name cache:") &&
      body.indexOf("const opffNameMemoryResult = _getSpeciesMemoryResult(opffNameBaseKey, opffNameFallbackKeys, resolvedPetType)") <
        body.indexOf("const opffNameReplayPromise = opffNameBaseKey") &&
      !body.includes("await _getSpeciesMemoryResult") &&
      body.includes("const opffNameReplayPromise = opffNameBaseKey") &&
      body.includes("const catalogMatchPromise = getProductData({") &&
      body.includes("const nameRace = await Promise.race([") &&
      body.includes('nameRace.type === "replay"') &&
      body.includes('sourceLabel: "in-memory"') &&
      body.includes('sourceLabel: nameRace.result?.source === "shared" ? "shared" : "local"') &&
      body.includes("productName: lookup.product.productName") &&
      body.includes("brand: lookup.product.brand") &&
      body.includes("timeoutMs: BARCODE_CATALOG_CACHE_TIMEOUT_MS") &&
      body.includes("catalogMatch = nameRace.type === \"product_data\"") &&
      body.includes("let catalogProductForScoring = null") &&
      body.includes("const catalogSourceMeta = _ingredientSourceMeta(catalogMatch.source)") &&
      body.includes("ingredientsText: catalogMatch.ingredientText") &&
      body.includes("sourceTrustLevel: catalogSourceMeta.trustLevel") &&
      analysisSource.includes("function _catalogNameFallbackKeys({ catalogProductName, catalogBrand, routeProductName, routeBrand, excludeKey })") &&
      body.includes("const catalogFallbackKeys = _catalogNameFallbackKeys({") &&
      body.includes("catalogProductName: catalogProductNameForKey") &&
      body.includes("catalogBrand: catalogBrandForKey") &&
      body.includes("routeProductName: lookup.product.productName") &&
      body.includes("routeBrand: lookup.product.brand") &&
      body.includes("const catalogAnalysisKeys = [catalogBaseKey, ...catalogFallbackKeys]") &&
      body.includes("localCacheAliases = catalogAnalysisKeys") &&
	      body.includes("const localCatalogPromise = _getSpeciesLocalResult(catalogBaseKey, catalogFallbackKeys, resolvedPetType).catch((err) => {") &&
	      body.includes("const cachedCatalogPromise = _getSpeciesCachedAnalysis(catalogBaseKey, catalogFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
	      body.includes("const catalogReplayResult = await _firstCompletedReplayResult(") &&
	      body.includes('catalogReplayResult?.source === "local"') &&
	      body.includes('catalogReplayResult?.source === "shared"') &&
      body.includes("Barcode reused catalog cache") &&
      body.includes("Barcode reused local catalog cache") &&
      body.includes("_saveLocalResultCopies([analysisKey || barcode, ...localCacheAliases], augmented, state.dataSource, state.opffData)") &&
      body.includes("_saveLocalResultCopies([analysisKey || barcode, ...localCacheAliases], analysis, state.dataSource, scoringProduct)") &&
      body.includes("const scoringProduct = catalogProductForScoring || lookup.product") &&
      body.includes("const cacheAliases = catalogProductForScoring && catalogMatch?.found") &&
      body.includes("? localCacheAliases") &&
      body.includes("analyzeWithData(scoringProduct, undefined, { onUpdate, signal, cacheKey: analysisKey || barcode, lookupType: \"barcode\", cacheAliases, clientProStatus: isPro === true })") &&
      body.includes("prefetchAnalyses(catalogAnalysisKeys)");
  })() &&
    analysisSource.includes("prefetchAnalyses } from \"./cache\""),
  "barcode scans must reuse species-specific catalog/name cached scores before spending AI quota, while saving the reused result under the barcode key"
);

assert(
  analysisSource.includes("async function _saveLocalResultCopies(cacheKeys, analysis, dataSource, opffData)") &&
    analysisSource.includes("const MAX_LOCAL_RESULTS = 240") &&
    analysisSource.includes("const LOCAL_RESULT_MEMORY_TTL_MS = 10 * 60 * 1000") &&
    analysisSource.includes("const localResultMemoryCache = new Map()") &&
    analysisSource.includes("key-count based, not product-count based") &&
    analysisSource.includes("const uniqueKeys = _normalizeLocalResultCacheKeys(cacheKeys)") &&
    analysisSource.includes("function _normalizeLocalResultCacheKey(cacheKey)") &&
    analysisSource.includes("function _normalizeLocalResultCacheKeys(cacheKeys)") &&
    analysisSource.includes("if (!_validateAnyCompletedResult(analysis))") &&
    analysisSource.includes("await AsyncStorage.multiSet(") &&
    analysisSource.includes("function _rememberLocalResultMemory(cacheKey, result, rememberedAt = Date.now(), fingerprint = null)") &&
    analysisSource.includes("function _localResultFingerprint(analysis, dataSource, opffData)") &&
    analysisSource.includes("function _reusableLocalResultMemory(cacheKey, fingerprint, now = Date.now())") &&
    analysisSource.includes("const fingerprint = _localResultFingerprint(analysis, dataSource, opffData)") &&
    analysisSource.includes("const storageFresh = _reusableLocalResultMemory(normalizedCacheKey, fingerprint, savedAt)") &&
    analysisSource.includes("Skipped duplicate local result write for:") &&
    analysisSource.includes("const keysToWrite = uniqueKeys.filter((key) => !_reusableLocalResultMemory(key, fingerprint, savedAt))") &&
    analysisSource.includes("Skipped duplicate local result copy writes for:") &&
    analysisSource.includes("keysToWrite.map((key) => [`${LOCAL_RESULT_PREFIX}${key}`, value])") &&
    analysisSource.includes("fingerprint: fingerprint || _localResultFingerprint(result.analysis, result.dataSource, result.opffData)") &&
    analysisSource.includes("while (localResultMemoryCache.size > MAX_LOCAL_RESULTS)") &&
    analysisSource.includes("function _getLocalResultMemory(cacheKey, now = Date.now())") &&
    analysisSource.includes("now - entry.rememberedAt > LOCAL_RESULT_MEMORY_TTL_MS") &&
    analysisSource.includes("!entry.result?.analysis || !_validateAnyCompletedResult(entry.result.analysis)") &&
    analysisSource.includes("const memoryHit = _getLocalResultMemory(key, now)") &&
    analysisSource.includes("if (storageKeys.length === 0) return hits;") &&
    analysisSource.includes("if (result) _rememberLocalResultMemory(normalizedCacheKey, result);") &&
    analysisSource.includes("const filtered = keys.filter((key) => !uniqueKeys.includes(key))") &&
    analysisSource.includes("const nextKeys = [...uniqueKeys, ...filtered]") &&
    analysisSource.includes("await AsyncStorage.multiRemove("),
  "local result copies must dedupe alias keys, validate once, skip duplicate hot-memory rewrites, batch writes, maintain a bounded memory replay cache, and update retention once"
);

assert(
  (() => {
    const searchStart = analysisSource.indexOf("async function _runSearch");
    const humanStart = analysisSource.indexOf("\n// ── Human food flow", searchStart);
    const searchBody = analysisSource.slice(searchStart, humanStart);
    const photoStart = analysisSource.indexOf("async function _runPhoto(");
    const localCacheStart = analysisSource.indexOf("\n// ── Local result cache", photoStart);
    const photoBody = analysisSource.slice(photoStart, localCacheStart);
    return searchBody.includes("const searchFallbackKeys = [...new Set([") &&
      searchBody.includes("..._catalogNameFallbackKeys({") &&
      searchBody.includes("const searchAnalysisKeys = [sharedCacheKey, ...searchFallbackKeys]") &&
      searchBody.includes("const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, searchFallbackKeys, resolvedPetType).catch((err) => {") &&
      searchBody.includes("const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, searchFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
      searchBody.includes("const replayResult = await _firstCompletedReplayResult(") &&
      searchBody.includes('replayResult?.source === "local"') &&
      searchBody.includes('replayResult?.source === "shared"') &&
      searchBody.includes("_saveLocalResultCopies([localResult.cacheKey, ...searchAnalysisKeys], augmented, state.dataSource, state.opffData)") &&
      searchBody.includes("_saveLocalResultCopies([cachedAnalysis.cacheKey, ...searchAnalysisKeys], augmented, state.dataSource, state.opffData)") &&
      searchBody.includes("cacheAliases: searchAnalysisKeys") &&
      searchBody.includes("_saveLocalResultCopies(searchAnalysisKeys, analysis, state.dataSource, opffProduct)") &&
	      photoBody.includes("const photoFallbackKeys = [...new Set([") &&
	      photoBody.includes("..._catalogNameFallbackKeys({") &&
	      photoBody.includes("const photoAnalysisKeys = [sharedCacheKey, ...photoFallbackKeys]") &&
	      photoBody.includes("if (sharedAnalysisKey && sharedAnalysisKey !== notifyKey)") &&
	      photoBody.includes("_rekey(notifyKey, sharedAnalysisKey, state)") &&
	      photoBody.includes("const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, photoFallbackKeys, petType).catch((err) => {") &&
	      photoBody.includes("const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, photoFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
	      photoBody.includes("const photoReplayResult = await _firstCompletedReplayResult(") &&
	      photoBody.includes('photoReplayResult?.source === "local"') &&
	      photoBody.includes('photoReplayResult?.source === "shared"') &&
	      photoBody.includes("_saveLocalResultCopies([localResult.cacheKey, ...photoAnalysisKeys], augmented, state.dataSource, state.opffData)") &&
	      photoBody.includes("_saveLocalResultCopies([cachedAnalysis.cacheKey, ...photoAnalysisKeys], augmented, state.dataSource, state.opffData)") &&
	      photoBody.includes("cacheAliases: photoAnalysisKeys") &&
	      photoBody.includes("_saveLocalResultCopies(photoAnalysisKeys, analysis, state.dataSource, opffProduct)") &&
      !searchBody.includes("if (sharedAnalysisKey) _saveLocalResult(sharedAnalysisKey, analysis, state.dataSource, opffProduct)") &&
      !photoBody.includes("if (sharedAnalysisKey) _saveLocalResult(sharedAnalysisKey, analysis, state.dataSource, opffProduct)");
  })(),
  "catalog-backed search/photo first scores and replayed cache hits must batch shared, real, and hit-key local cache writes"
);

const verifiedCalls = [...analysisSource.matchAll(/analyzeWithData\(opffProduct[\s\S]{0,130}lookupType: "name"/g)].length;
assert(
  verifiedCalls >= 3,
  "search, photo DB-hit, and label-photo verified analyses must mark shared cache writes as name lookups"
);

assert(
  /lookupType = null/.test(edgeSource) &&
    /cacheAliases = null/.test(edgeSource) &&
    /const requestedLookupType =[\s\S]{0,120}lookupType === "barcode" \|\| lookupType === "name"/.test(edgeSource) &&
    /const barcodeLikeKey = \/\^\[0-9\]\{8,14\}\$\/\.test\(resolvedKey\);[\s\S]{0,220}requestedLookupType === "barcode"[\s\S]{0,160}requestedLookupType === "name"[\s\S]{0,160}barcodeLikeKey/.test(edgeSource),
  "Edge cache writer must prefer explicit lookupType and fall back to barcode-shaped keys only for old clients"
);

assert(
  edgeSource.includes("function normalizeCacheAliases(cacheAliases: unknown, primaryKey: string, analysis: Record<string, any>): string[]") &&
    edgeSource.includes("aliases.length >= 3") &&
    edgeSource.includes("key === primaryKey") &&
    edgeSource.includes("key.length > 180") &&
    edgeSource.includes("/^[a-z0-9 _-]+(?:__(?:dog|cat))?$/.test(key)") &&
    edgeSource.includes("suffix && suffix !== petType") &&
    edgeSource.includes("...aliases.map((aliasKey) => ({") &&
    edgeSource.includes('lookup_type: "name"') &&
    edgeSource.includes('runBackgroundTask(\n        "Non-stream cache write"') &&
    edgeSource.includes("await writeToCache(supabase, analysis!, mode, cacheKey, opffProduct, requestedLookupType, cacheAliases);") &&
    edgeSource.includes("writeToCache(supabase, analysis!, mode, cacheKey, opffProduct, requestedLookupType, cacheAliases),"),
  "Edge cache aliases must be bounded, key-shape validated, species-safe, and written as name lookup cache rows"
);

assert(
  !edgeSource.includes('const lookupType = cacheKey ? "barcode" : "name";'),
  "Edge cache writer must not infer barcode solely from cacheKey presence"
);

assert(
  migrationSource.includes("DELETE FROM public.analysis_cache") &&
    migrationSource.includes("lookup_type = 'human_food'") &&
    migrationSource.includes("cache_key ~ '^[0-9]{8,14}$'") &&
    migrationSource.includes("THEN 'barcode'") &&
    migrationSource.includes("ELSE 'name'"),
  "migration must remove human-food cache rows and backfill barcode/name lookup types"
);

assert(
  packageJson.includes('"test:cache-lookup-type": "node scripts/test-cache-lookup-type-guards.js"') &&
    packageJson.includes("npm run test:cache-lookup-type"),
  "cache lookup-type guard must be wired into package scripts"
);

console.log("cache lookup-type guard passed");
