#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`home search guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  homeSource.includes("const searchQueryRef = useRef(\"\")"),
  "search must track the latest query outside async closures"
);

assert(
  homeSource.includes('import { reportNetworkError, reportNetworkSuccess, useNetwork } from "../services/network"') &&
    homeSource.includes("const { isOnline } = useNetwork();") &&
    /if \(!isOnline\) \{[\s\S]{0,120}searchSeqRef\.current \+= 1;[\s\S]{0,160}setSearchError\("You're offline\. Connect to Wi-Fi or cellular data to search products\."\);[\s\S]{0,120}setSearchLoading\(false\);[\s\S]{0,80}return;[\s\S]{0,80}\}\s*setSearchLoading\(true\);/.test(homeSource) &&
    homeSource.includes("}, [isOnline]);"),
  "known-offline product searches must fail immediately with visible copy before starting loading or the debounced Supabase RPC"
);

assert(
  /setSearchLoading\(true\);[\s\S]{0,120}setSearchResults\(\[\]\);[\s\S]{0,80}const seq = \+\+searchSeqRef\.current;/.test(homeSource),
  "starting a new search must clear old rows before the debounced RPC"
);

assert(
  /searchSeqRef\.current \+= 1;[\s\S]{0,160}setSearchResults\(\[\]\);/.test(homeSource),
  "short or cleared searches must invalidate pending result sequences and clear rows"
);

assert(
  /if \(seq !== searchSeqRef\.current \|\| searchQueryRef\.current\.trim\(\) !== trimmed\) return;/.test(homeSource),
  "late search responses must be ignored unless they match the current sequence and query"
);

assert(
  homeSource.includes("const SEARCH_REQUEST_TIMEOUT_MS = 6000") &&
    homeSource.includes("const SEARCH_TAP_VALIDATION_TIMEOUT_MS = 2500") &&
    homeSource.includes("const SEARCH_TAP_PREWARM_AWAIT_MS = 1200") &&
    /const ctl = new AbortController\(\);[\s\S]{0,120}let searchTimedOut = false;[\s\S]{0,180}setTimeout\(\(\) => \{[\s\S]{0,80}searchTimedOut = true;[\s\S]{0,80}ctl\.abort\(\);[\s\S]{0,80}\}, SEARCH_REQUEST_TIMEOUT_MS\);/.test(homeSource) &&
    /if \(err\.name === "AbortError" && !searchTimedOut\) return;[\s\S]{0,120}reportNetworkError\(searchTimedOut \? new Error\("SEARCH_TIMEOUT"\) : err\);/.test(homeSource) &&
    /finally \{[\s\S]{0,80}clearTimeout\(searchTimeout\);[\s\S]{0,160}setSearchLoading\(false\);/.test(homeSource),
  "search RPC and tap validation requests must have hard timeouts that exit loading with visible retryable errors"
);

assert(
  /if \(searchAbortRef\.current === ctl\) searchAbortRef\.current = null;/.test(homeSource),
  "completed search requests must clear the abort ref"
);

assert(
    homeSource.includes("prefetchProductDataByCacheKeys, rememberProductDataSnapshots } from \"../services/cache\"") &&
    homeSource.includes("function normalizeSearchPrewarmRow(row)") &&
    homeSource.includes("function buildSearchPrewarmBaseKeys(row)") &&
    homeSource.includes("const SEARCH_PREWARM_DEDUPE_TTL_MS = 60 * 1000") &&
    homeSource.includes("const searchPrewarmTimestamps = new Map()") &&
    homeSource.includes("function searchPrewarmSignature(row)") &&
    homeSource.includes("function filterRecentlyPrewarmedSearchRows(rows, now = Date.now())") &&
    homeSource.includes("function markSearchPrewarmRowsForRetry(rows)") &&
    homeSource.includes("searchPrewarmTimestamps.set(signature, now)") &&
    homeSource.includes("markSearchPrewarmRowsForRetry(prewarmRows)") &&
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
    /function buildSearchPrewarmKeys\(rows\) \{[\s\S]{0,180}const baseKeys = buildSearchPrewarmBaseKeys\(row\);[\s\S]{0,160}for \(const key of baseKeys\)/.test(homeSource) &&
    homeSource.includes(".map((row) => normalizeSearchRow(row) || normalizeSearchPrewarmRow(row))") &&
    /function prewarmSearchRows\(rows\) \{[\s\S]{0,260}const prewarmRows = filterRecentlyPrewarmedSearchRows\(normalizedRows\);[\s\S]{0,80}if \(prewarmRows\.length === 0\) return;[\s\S]{0,120}const remembered = rememberProductDataSnapshots\(prewarmRows\);[\s\S]{0,140}const productDataPrewarmRows = prewarmRows\.filter\(\(row\) => !buildSearchRowCatalogSnapshot\(row, row\.cache_key\)\);[\s\S]{0,220}productDataPrewarmRows\.length > 0[\s\S]{0,120}prefetchProductDataByCacheKeys\(productDataPrewarmRows\.map\(\(row\) => row\.cache_key\)\)[\s\S]{0,160}prefetchAnalyses\(buildSearchPrewarmKeys\(prewarmRows\)\),[\s\S]{0,320}Prewarm background task failed/.test(homeSource) &&
    /const rows = \(data \|\| \[\]\)\.map\(normalizeSearchRow\)\.filter\(Boolean\);[\s\S]{0,360}prewarmSearchRows\(rows\);/.test(homeSource) &&
    /useEffect\(\(\) => \{[\s\S]{0,80}prewarmSearchRows\(recentSearches\);[\s\S]{0,40}\}, \[recentSearches\]\);/.test(homeSource),
  "visible and recent search rows must dedupe repeated prewarm attempts while prewarming exact product_data rows and analysis scores"
);

assert(
  /\{!searchLoading && searchQuery\.trim\(\)\.length >= 2 && searchResults\.length > 0 && \(/.test(homeSource),
  "search rows must not render while a newer query is loading"
);

assert(
  /function normalizeSearchRow\(row\)[\s\S]{0,220}const cacheKey = typeof row\.cache_key === "string" \? row\.cache_key\.trim\(\) : ""[\s\S]{0,160}const productName = typeof row\.product_name === "string" \? row\.product_name\.trim\(\) : ""[\s\S]{0,260}!Number\.isFinite\(ingredientCount\) \|\| ingredientCount < 5/.test(homeSource) &&
    /const petType = rowPetType \|\| inferSearchPetType\(productName, brand, cacheKey\);/.test(homeSource) &&
    /cache_key: cacheKey,[\s\S]{0,80}product_name: productName,[\s\S]{0,180}ingredient_count: ingredientCount,[\s\S]{0,80}petType/.test(homeSource) &&
    /const rows = \(data \|\| \[\]\)\.map\(normalizeSearchRow\)\.filter\(Boolean\);[\s\S]{0,180}setSearchResults\(rows\);/.test(homeSource),
  "visible search rows must be canonicalized with pet type, a real cache key, product name, and at least five ingredients before they can be tapped"
);

assert(
  homeSource.includes("const [searchError, setSearchError] = useState(null)") &&
    /if \(error\) \{[\s\S]{0,180}setSearchError\("Search is unavailable\. Check your connection and try again\."\);[\s\S]{0,40}return;/.test(homeSource),
  "Supabase RPC search errors must become visible search error state"
);

assert(
  /searchError && !searchLoading && searchQuery\.trim\(\)\.length >= 2/.test(homeSource) &&
    homeSource.includes("Couldn't search products") &&
    homeSource.includes("accessibilityLabel=\"Retry product search\"") &&
    /onPress=\{\(\) => \{[\s\S]{0,120}handleSearch\(searchQuery\);/.test(homeSource),
  "visible search error state must include a retry action"
);

assert(
  /setSearchLoading\(true\);[\s\S]{0,120}setSearchError\(null\);[\s\S]{0,80}setSearchResults\(\[\]\);/.test(homeSource) &&
    /const clearSearch = useCallback\(\(\) => \{[\s\S]{0,80}clearSearchTapLock\(\);[\s\S]{0,360}setSearchQuery\(""\);[\s\S]{0,140}setSearchError\(null\);/.test(homeSource),
  "new and cleared searches must clear stale search errors and abort any pending tap validation"
);

assert(
    homeSource.includes("const searchTapInFlightRef = useRef(null)") &&
    homeSource.includes("const searchTapReleaseTimerRef = useRef(null)") &&
    homeSource.includes("const searchTapAbortRef = useRef(null)") &&
    homeSource.includes("const clearSearchTapLock = useCallback") &&
    homeSource.includes("searchTapAbortRef.current?.abort()") &&
    homeSource.includes("searchTapAbortRef.current = null") &&
    homeSource.includes("const releaseSearchTap = useCallback") &&
    /const handleSearchResultPress = useCallback\(async \(item\) => \{[\s\S]{0,900}const tapKey = cacheKey \? `\$\{isRecent \? "recent" : "search"\}:\$\{cacheKey\}` : null;[\s\S]{0,180}if \(searchTapInFlightRef\.current\) return;[\s\S]{0,180}searchTapReleaseTimerRef\.current = setTimeout\(\(\) => releaseSearchTap\(tapKey\), 12000\);/.test(homeSource) &&
    /handleDismissLegalConsent[\s\S]{0,160}clearSearchTapLock\(\);/.test(homeSource) &&
    homeSource.includes("function isPlausibleCatalogIngredient(value)") &&
    homeSource.includes("function cleanCatalogIngredients(list)") &&
    homeSource.includes("function buildSearchRowCatalogSnapshot(item, cacheKey)") &&
    homeSource.includes("function validationFromCatalogSnapshot(snapshot)") &&
    homeSource.includes("normalizeCacheKey(key) !== normalizeCacheKey(cacheKey)") &&
    /function buildCatalogSnapshot\(validationResult, cacheKey\)[\s\S]{0,180}const ingredients = cleanCatalogIngredients\(validationResult\.ingredients\);[\s\S]{0,80}ingredients\.length < 5/.test(homeSource) &&
    homeSource.includes('ingredientText: ingredients.join(", "),') &&
    /runWithLegalConsent\(\(\) => \{[\s\S]{0,120}\(async \(\) => \{[\s\S]{0,120}try \{[\s\S]{0,180}if \(!canScan\(\)\) \{[\s\S]{0,180}return;[\s\S]{0,120}let catalogSnapshot = buildSearchRowCatalogSnapshot\(item, cacheKey\);[\s\S]{0,100}let validation = validationFromCatalogSnapshot\(catalogSnapshot\);[\s\S]{0,80}if \(!validation\) \{[\s\S]{0,120}const validationCtl = new AbortController\(\);[\s\S]{0,120}searchTapAbortRef\.current = validationCtl;[\s\S]{0,160}validation = await getProductDataByCacheKey\(cacheKey, \{[\s\S]{0,100}timeoutMs: SEARCH_TAP_VALIDATION_TIMEOUT_MS,[\s\S]{0,100}prewarmWaitMs: SEARCH_TAP_PREWARM_AWAIT_MS,[\s\S]{0,100}signal: validationCtl\.signal/.test(homeSource) &&
    /validation = await getProductDataByCacheKey\(cacheKey, \{[\s\S]{0,100}timeoutMs: SEARCH_TAP_VALIDATION_TIMEOUT_MS,[\s\S]{0,100}prewarmWaitMs: SEARCH_TAP_PREWARM_AWAIT_MS,[\s\S]{0,100}signal: validationCtl\.signal/.test(homeSource) &&
    /if \(searchTapAbortRef\.current === validationCtl\) searchTapAbortRef\.current = null;[\s\S]{0,120}if \(validationCtl\.signal\.aborted\) \{[\s\S]{0,80}releaseSearchTap\(tapKey\);[\s\S]{0,80}return;/.test(homeSource) &&
    /if \(handleRejectedValidation\(validation\)\) \{[\s\S]{0,80}releaseSearchTap\(tapKey\);[\s\S]{0,80}return;/.test(homeSource) &&
    homeSource.includes("const validatedCacheKey = String(validation.productCacheKey || cacheKey).trim() || cacheKey;") &&
    /const finalItem = \{[\s\S]{0,80}\.\.\.buildValidatedItem\(validation\),[\s\S]{0,80}cache_key: validatedCacheKey,[\s\S]{0,40}\};/.test(homeSource) &&
    /inferSearchPetType\([\s\S]{0,160}validatedCacheKey,[\s\S]{0,80}cacheKey,[\s\S]{0,40}\);/.test(homeSource) &&
    homeSource.includes('import * as analysisService from "../services/analysisService";') &&
    /catalogSnapshot = catalogSnapshot \|\| buildCatalogSnapshot\(validation, validatedCacheKey\);[\s\S]{0,120}analysisService\.startAnalysis\(\{[\s\S]{0,80}mode: "search",[\s\S]{0,160}selectedCacheKey: validatedCacheKey,[\s\S]{0,120}selectedProductData: catalogSnapshot,[\s\S]{0,80}petType: finalPetType,[\s\S]{0,80}isPro,/.test(homeSource) &&
    /console\.log\("\[SEARCH\] Background search analysis start failed:", err\.message\);/.test(homeSource) &&
    homeSource.includes("recordRecentSearch({ ...finalItem, cache_key: validatedCacheKey });") &&
    /navigation\.navigate\("Results", \{[\s\S]{0,260}cacheKey: validatedCacheKey,[\s\S]{0,120}catalogSnapshot,/.test(homeSource) &&
    /catch \(err\) \{[\s\S]{0,120}\[SEARCH\] Tap handler error:[\s\S]{0,360}releaseSearchTap\(tapKey\);/.test(homeSource) &&
    /navigation\.navigate\("Results", \{[\s\S]{0,420}setTimeout\(\(\) => releaseSearchTap\(tapKey\), 600\);/.test(homeSource) &&
    /\}, \[canScan, navigation, clearSearch, recordRecentSearch, runWithLegalConsent, releaseSearchTap, isPro\]\);/.test(homeSource),
  "search result taps must be in-flight guarded, consent/quota-gated before validation, pre-start background analysis, and cannot queue duplicate validation or Results navigation"
);

console.log("home search guard passed");
