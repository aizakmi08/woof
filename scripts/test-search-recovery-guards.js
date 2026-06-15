#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const recentSource = fs.readFileSync(path.join(root, "services/recentSearches.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const resultsSearchBlock = resultsSource.slice(
  resultsSource.indexOf('if (mode === "search") {'),
  resultsSource.indexOf("// Photo mode: delegate to analysis service")
);
const searchHandlerStart = homeSource.indexOf("const handleSearchResultPress = useCallback");
const searchHandlerEnd = homeSource.indexOf("const loadHistory = useCallback", searchHandlerStart);
const searchHandlerBlock = homeSource.slice(searchHandlerStart, searchHandlerEnd);

function assert(condition, message) {
  if (!condition) {
    console.error(`search recovery guard failed: ${message}`);
    process.exit(1);
  }
}

function includesInOrder(source, terms) {
  let cursor = 0;
  for (const term of terms) {
    const idx = source.indexOf(term, cursor);
    if (idx < 0) return false;
    cursor = idx + term.length;
  }
  return true;
}

assert(
  recentSource.includes('export const RECENT_SEARCHES_KEY = "@woof_recent_searches"') &&
    recentSource.includes("export async function getRecentSearches()") &&
    recentSource.includes("export async function recordRecentSearch(item)") &&
    recentSource.includes("export async function removeRecentSearch(cacheKey)") &&
    recentSource.includes("export async function clearRecentSearches()") &&
    recentSource.includes('const cacheKey = String(item.cache_key || item.cacheKey || "").trim()') &&
    recentSource.includes('const productName = String(item.product_name || item.productName || "").trim()') &&
    recentSource.includes('petType: ["dog", "cat"].includes(item.petType || item.pet_type)'),
  "recent searches must be centralized behind a service API, canonicalize keys/names, and preserve validated petType"
);

assert(
  /const next = current\.filter\(\(entry\) => entry\.cache_key !== cacheKey\);[\s\S]{0,120}AsyncStorage\.setItem\(RECENT_SEARCHES_KEY, JSON\.stringify\(next\)\)/.test(recentSource),
  "removeRecentSearch must persistently remove rejected cache keys"
);

assert(
  homeSource.includes('} from "../services/recentSearches"') &&
    homeSource.includes("getRecentSearches") &&
    homeSource.includes("removeRecentSearch") &&
    homeSource.includes("persistRecentSearch") &&
    homeSource.includes("clearStoredRecentSearches"),
  "Home search recents must use the centralized recent-search service"
);

assert(
  homeSource.includes("const hydrateRecentSearches = useCallback") &&
    /useEffect\(\(\) => \{[\s\S]{0,80}hydrateRecentSearches\(\);/.test(homeSource) &&
    /useFocusEffect\([\s\S]{0,180}hydrateRecentSearches\(\);[\s\S]{0,80}loadHistory\(\);/.test(homeSource),
  "Home must hydrate recent searches on mount and focus so removals from Results are reflected"
);

assert(
  !homeSource.includes('"@woof_recent_searches"') &&
    !homeSource.includes("AsyncStorage.setItem(\"@woof_recent_searches\"") &&
    !homeSource.includes("AsyncStorage.removeItem(\"@woof_recent_searches\""),
  "Home must not bypass the recent-search service for disk writes"
);

assert(
  resultsSource.includes('import { classifyError } from "../../services/errors"') &&
    resultsSource.includes('import { removeRecentSearch } from "../../services/recentSearches"'),
  "Results must import the error classifier and recent-search removal helper"
);

assert(
  /if \(mode !== "search" \|\| !cacheKey \|\| !error\) return;[\s\S]{0,120}classifyError\(error\)\.kind !== "product_not_found"[\s\S]{0,120}removeRecentSearch\(cacheKey\)/.test(resultsSource),
  "search catalog misses must remove the rejected recent-search row instead of leaving a loopable stale product"
);

assert(
  cacheSource.includes("export async function getProductDataByCacheKey(cacheKey, options = {})") &&
    cacheSource.includes("const exactCacheKey = normalizeCacheKey(cacheKey)") &&
    cacheSource.includes('.eq("cache_key", exactCacheKey)') &&
    cacheSource.includes(".limit(5)") &&
    cacheSource.includes("for (const row of rows)") &&
    cacheSource.includes("Selected key candidate rejected"),
  "cache service must expose exact product_data row lookup by selected search cache key"
);

assert(
  resultsSource.includes("selectedCacheKey: cacheKey") &&
    resultsSource.includes("selectedProductData: catalogSnapshot") &&
    analysisSource.includes("getProductDataByCacheKey") &&
    (() => {
      const start = analysisSource.indexOf("async function _runSearch");
      const end = analysisSource.indexOf("\nasync function _runHumanFood", start);
      const block = analysisSource.slice(start, end);
      return includesInOrder(block, [
        "const exactSelectedCacheKey = normalizeCacheKey(selectedCacheKey);",
        "const realCacheKey = exactSelectedCacheKey || normalizeCacheKey(productName);",
        "const selectedSnapshot = _usableSelectedProductData(selectedProductData, exactSelectedCacheKey);",
        "const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot",
        "const exactProductDataPromise = exactSelectedCacheKey && !selectedSnapshot",
        "getProductDataByCacheKey(exactSelectedCacheKey, { signal, timeoutMs: SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS })",
        "let dbResult = selectedSnapshot || { found: false };",
        "if (exactProductDataPromise) {",
        "const selectedRace = await Promise.race([",
        'if (exactSelectedCacheKey && dbResult.reason === "lookup_error")',
        'const shouldFallbackToName = !dbResult.found && (!exactSelectedCacheKey || dbResult.reason === "not_found");',
        "if (shouldFallbackToName) {",
        "dbResult = await getProductData(productName, brand, { signal, timeoutMs: SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS });",
      ]);
    })() &&
    (() => {
      const start = analysisSource.indexOf("async function _runSearch");
      const end = analysisSource.indexOf("\nasync function _runHumanFood", start);
      const block = analysisSource.slice(start, end);
      return /const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot[\s\S]{0,620}"search",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(block);
    })() &&
    cacheSource.includes('return { found: false, reason: "not_found" };') &&
    cacheSource.includes('return { found: false, reason: "unusable" };'),
  "search result taps must normalize and analyze the exact selected product_data row and only fall back to fuzzy lookup when the selected key is truly missing"
);

assert(
    homeSource.includes("function buildCatalogSnapshot(validationResult, cacheKey)") &&
    homeSource.includes("function isPlausibleCatalogIngredient(value)") &&
    homeSource.includes("function cleanCatalogIngredients(list)") &&
    homeSource.includes("function buildSearchRowCatalogSnapshot(item, cacheKey)") &&
    homeSource.includes("function validationFromCatalogSnapshot(snapshot)") &&
    homeSource.includes("normalizeCacheKey(key) !== normalizeCacheKey(cacheKey)") &&
    /function buildCatalogSnapshot\(validationResult, cacheKey\)[\s\S]{0,180}const ingredients = cleanCatalogIngredients\(validationResult\.ingredients\);[\s\S]{0,80}ingredients\.length < 5/.test(homeSource) &&
    homeSource.includes('ingredientText: ingredients.join(", "),') &&
    homeSource.includes("let catalogSnapshot = buildSearchRowCatalogSnapshot(item, cacheKey);") &&
    homeSource.includes("let validation = validationFromCatalogSnapshot(catalogSnapshot);") &&
    homeSource.includes("if (!validation) {") &&
    homeSource.includes("validation = await getProductDataByCacheKey(cacheKey, {") &&
    homeSource.includes("const validatedCacheKey = String(validation.productCacheKey || cacheKey).trim() || cacheKey;") &&
    homeSource.includes("catalogSnapshot = catalogSnapshot || buildCatalogSnapshot(validation, validatedCacheKey);") &&
    homeSource.includes("selectedProductData: catalogSnapshot") &&
    homeSource.includes("recordRecentSearch({ ...finalItem, cache_key: validatedCacheKey });") &&
    homeSource.includes("cacheKey: validatedCacheKey") &&
    homeSource.includes("catalogSnapshot,") &&
	    analysisSource.includes("function _usableSelectedProductData(snapshot, exactCacheKey)") &&
	    analysisSource.includes("const expectedKey = normalizeCacheKey(exactCacheKey);") &&
	    analysisSource.includes("const rawSnapshotKey = typeof snapshot.productCacheKey === \"string\"") &&
	    analysisSource.includes("const snapshotKey = normalizeCacheKey(rawSnapshotKey);") &&
	    analysisSource.includes("snapshotKey !== expectedKey") &&
	    analysisSource.includes("ingredients.length < 5") &&
    analysisSource.includes("let dbResult = selectedSnapshot || { found: false };") &&
    analysisSource.includes("const exactProductDataPromise = exactSelectedCacheKey && !selectedSnapshot") &&
	    analysisSource.includes("selectedProductData, exactSelectedCacheKey"),
	  "validated search result catalog snapshots must skip duplicate Results product_data lookups without trusting malformed or wrong-key route params"
	);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runSearch");
    const end = analysisSource.indexOf("\nasync function _runHumanFood", start);
    const block = analysisSource.slice(start, end);
    return includesInOrder(block, [
      "const sharedCacheKey = dbResult.productCacheKey || realCacheKey;",
      "const searchFallbackKeys = [...new Set([",
      "..._catalogNameFallbackKeys({",
      "const searchAnalysisKeys = [sharedCacheKey, ...searchFallbackKeys]",
      "const sharedAnalysisKey = searchAnalysisKeys[0] || null;",
      "const realAnalysisKey = _analysisCacheKey(realCacheKey, resolvedPetType);",
	      "if (sharedAnalysisKey && sharedAnalysisKey !== notifyKey) {",
	      "_rekey(notifyKey, sharedAnalysisKey, state);",
	      "notifyKey = sharedAnalysisKey;",
	      "const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, searchFallbackKeys, resolvedPetType).catch((err) => {",
	      "const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, searchFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {",
	      "const replayResult = await _firstCompletedReplayResult(",
	    ]);
  })(),
  "validated search DB hits must rekey route aliases to the canonical shared product analysis key before cache replay or model work"
);

assert(
  (() => {
    const start = analysisSource.indexOf("export function startAnalysis");
    const end = analysisSource.indexOf("const controller = new AbortController()", start);
    const block = analysisSource.slice(start, end);
    return block.includes('const searchBaseKey = mode === "search"') &&
      block.includes("const selectedSearchCacheKey = normalizeCacheKey(selectedCacheKey)") &&
      block.includes("selectedSearchCacheKey || normalizeCacheKey(preIdentifiedName)") &&
      block.includes('mode === "search"') &&
      block.includes("_analysisCacheKey(searchBaseKey, petType) || searchBaseKey") &&
      block.includes('entry.status === "running"') &&
      block.includes('entry.status === "complete"') &&
      block.includes('entry.status === "needs_pet_type"') &&
      block.includes('entry.status === "needs_ingredient_photo"') &&
      block.includes("Reusing existing analysis for key");
  })(),
  "selected search rows must use their species-specific stable cache key before analysis starts so retries reuse running, completed, or paused same-species work"
);

assert(
  resultsSearchBlock.includes("const existing = analysisService.getAnalysis(key)") &&
    resultsSearchBlock.includes('applyExistingAnalysisState(existing, "search")') &&
    resultsSource.includes("const applyExistingAnalysisState = useCallback") &&
    resultsSource.includes('existing.status === "complete"') &&
    resultsSource.includes('existing.status === "running"') &&
    resultsSource.includes("setStreaming(true)") &&
    resultsSource.includes("setResult(existing.result ? { ...existing.result } : {})") &&
    resultsSource.includes('existing.status === "needs_pet_type"') &&
    resultsSource.includes("existing.recovery || {}"),
  "Results search mode must immediately attach reused running, completed, or paused selected-row analyses"
);

assert(
  (() => {
    const start = analysisSource.indexOf('if (exactSelectedCacheKey && dbResult.reason === "lookup_error")');
    const end = analysisSource.indexOf("const shouldFallbackToName = !dbResult.found && (!exactSelectedCacheKey || dbResult.reason === \"not_found\");", start);
    const block = analysisSource.slice(start, end);
    const replayStart = block.indexOf("const selectedReplayResult = routeReplayPromise ? await routeReplayPromise : null;");
    const errorStart = block.indexOf("Could not verify this product in the database");
    return start !== -1 &&
      end !== -1 &&
      replayStart !== -1 &&
      errorStart !== -1 &&
      replayStart < errorStart &&
      block.includes("if (_completeSearchFromLocalReplay({") &&
      block.includes("localResult: selectedReplayResult?.result") &&
      block.includes("sourceLabel: selectedReplayResult?.source === \"shared\" ? \"shared\" : \"local\"") &&
      block.includes("fromFallback: true") &&
      block.includes('type: "error"') &&
      block.includes("_scheduleCleanup(notifyKey);");
  })(),
  "selected-row lookup network errors must reuse the already-started bounded score replay, then surface a retryable verification error before fuzzy fallback"
);

assert(
    homeSource.includes("const [recentSearchError, setRecentSearchError] = useState(null)") &&
    homeSource.includes("const searchResultsRef = useRef([])") &&
    /const clearSearch = useCallback\(\(\) => \{[\s\S]{0,80}clearSearchTapLock\(\);/.test(homeSource) &&
    homeSource.includes("function normalizeSearchRow(row)") &&
    homeSource.includes("const rows = (data || []).map(normalizeSearchRow).filter(Boolean)") &&
    homeSource.includes("!Number.isFinite(ingredientCount) || ingredientCount < 5") &&
    homeSource.includes('const cacheKey = String(item.cache_key || "").trim() || normalizeCacheKey') &&
    /useEffect\(\(\) => \{[\s\S]{0,80}searchResultsRef\.current = searchResults;[\s\S]{0,80}\}, \[searchResults\]\);/.test(homeSource) &&
    homeSource.includes("const isRecent = item.fromRecent === true") &&
    homeSource.includes("const tapSearchSeq = searchSeqRef.current") &&
    homeSource.includes("const tapSearchQuery = searchQueryRef.current") &&
    homeSource.includes("const SEARCH_TAP_VALIDATION_TIMEOUT_MS = 2500") &&
    homeSource.includes("const searchTapAbortRef = useRef(null)") &&
    homeSource.includes("searchTapAbortRef.current?.abort()") &&
    analysisSource.includes("const SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS = 2_500") &&
    analysisSource.includes("const SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS = 4_000") &&
    analysisSource.includes("const PHOTO_PRODUCT_DATA_TIMEOUT_MS = 4_500") &&
    homeSource.includes("let catalogSnapshot = buildSearchRowCatalogSnapshot(item, cacheKey);") &&
    homeSource.includes("let validation = validationFromCatalogSnapshot(catalogSnapshot);") &&
    homeSource.includes("if (!validation) {") &&
    /const validationCtl = new AbortController\(\);[\s\S]{0,120}searchTapAbortRef\.current = validationCtl;[\s\S]{0,180}validation = await getProductDataByCacheKey\(cacheKey, \{[\s\S]{0,100}timeoutMs: SEARCH_TAP_VALIDATION_TIMEOUT_MS,[\s\S]{0,100}signal: validationCtl\.signal/.test(homeSource) &&
    /if \(searchTapAbortRef\.current === validationCtl\) searchTapAbortRef\.current = null;[\s\S]{0,120}if \(validationCtl\.signal\.aborted\) \{[\s\S]{0,80}releaseSearchTap\(tapKey\);[\s\S]{0,80}return;[\s\S]{0,180}if \(!isRecent && \(tapSearchSeq !== searchSeqRef\.current \|\| tapSearchQuery !== searchQueryRef\.current\)\) \{[\s\S]{0,80}return;[\s\S]{0,80}\}/.test(homeSource) &&
    /const handleRejectedValidation = \(validationResult\) => \{[\s\S]{0,100}if \(!validationResult\.found\) \{[\s\S]{0,220}validationResult\.reason === "lookup_error"[\s\S]{0,260}setSearchError\("Could not verify this product/.test(homeSource) &&
    /if \(isRecent\) \{[\s\S]{0,220}removeRecentSearch\(cacheKey\)[\s\S]{0,180}setRecentSearchError/.test(homeSource) &&
    /else \{[\s\S]{0,120}const nextSearchResults = searchResultsRef\.current\.filter\(\(entry\) => entry\.cache_key !== cacheKey\);[\s\S]{0,80}searchResultsRef\.current = nextSearchResults;[\s\S]{0,80}setSearchResults\(nextSearchResults\);[\s\S]{0,80}setSearchEmpty\(nextSearchResults\.length === 0\);[\s\S]{0,180}setSearchError\(`\$\{productName \|\| "This product"\} is no longer in the searchable database/.test(homeSource) &&
    /catch \(err\) \{[\s\S]{0,120}\[SEARCH\] Tap handler error:[\s\S]{0,120}setRecentSearchError\("Could not open this recent product\. Try searching again\."\)[\s\S]{0,140}setSearchError\("Could not open this product\. Try again\."\)[\s\S]{0,80}releaseSearchTap\(tapKey\);/.test(homeSource),
  "Home must validate every search result row before navigation, drop stale live tap validations, and remove stale rows from the current live result list without deleting recents on lookup errors"
);

assert(
    searchHandlerStart >= 0 &&
    searchHandlerEnd > searchHandlerStart &&
    includesInOrder(searchHandlerBlock, [
      "runWithLegalConsent(() => {",
      "if (!canScan())",
      "let catalogSnapshot = buildSearchRowCatalogSnapshot(item, cacheKey);",
      "let validation = validationFromCatalogSnapshot(catalogSnapshot);",
      "if (!validation) {",
      "const validationCtl = new AbortController();",
      "validation = await getProductDataByCacheKey(cacheKey, {",
      "signal: validationCtl.signal",
      "if (validationCtl.signal.aborted)",
      "handleRejectedValidation(validation)",
      "catalogSnapshot = catalogSnapshot || buildCatalogSnapshot(validation, validatedCacheKey);",
      "analysisService.startAnalysis({",
      "recordRecentSearch",
      'navigation.navigate("Results"',
    ]) &&
    !searchHandlerBlock.includes("initialValidation") &&
    !searchHandlerBlock.includes("finalValidation") &&
    /}, \[canScan, navigation, clearSearch, recordRecentSearch, runWithLegalConsent, releaseSearchTap, isPro\]\);/.test(homeSource),
  "Home search taps must validate once after legal consent and skip validation when quota routes directly to paywall"
);

assert(
  homeSource.includes("function inferSearchPetType(...values)") &&
    homeSource.includes("const SEARCH_CAT_BRANDS") &&
    homeSource.includes("const SEARCH_DOG_BRANDS") &&
    /const finalPetType = finalItem\.petType \|\| inferSearchPetType\([\s\S]{0,180}finalItem\.product_name[\s\S]{0,120}finalItem\.brand/.test(homeSource) &&
    /navigation\.navigate\("Results", \{[\s\S]{0,160}mode: "search"[\s\S]{0,360}\.\.\(finalPetType && \{ petType: finalPetType \}\)/.test(homeSource) &&
    /recordRecentSearch\(\{ \.\.\.finalItem, cache_key: validatedCacheKey \}\)/.test(homeSource),
  "Home search taps must carry explicit inferred dog/cat context into Results and recent searches"
);

assert(
  /onPress=\{\(\) => handleSearchResultPress\(\{ \.\.\.item, fromRecent: true \}\)\}/.test(homeSource) &&
    homeSource.includes("Recent search updated"),
  "recent search taps must be distinguishable from live search rows and show inline stale-row feedback"
);

assert(
  packageJson.includes('"test:search-recovery": "node scripts/test-search-recovery-guards.js"') &&
    packageJson.includes("npm run test:search-recovery"),
  "search recovery guard must be wired into package scripts"
);

console.log("search recovery guard passed");
